/**
 * store/generation.js
 * Pinia store managing the audio generation pipeline.
 *
 * Responsibilities:
 *  - Build ParagraphGroup + Sentence records from the editor doc
 *  - Queue sentences for TTS API calls (max 2 concurrent)
 *  - Handle retries, errors, and progress tracking
 *  - Stitch completed groups and update the master timeline
 *  - Write stitched blobs to IndexedDB and optionally to disk
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { uuid }              from '@/utils/uuid.js'
import { extractTaggedSpans, splitTaggedSpan } from '@/editor/splitter.js'
import { getProvider, withConcurrency }         from '@/tts/provider.js'
import { resolveApiKey }                         from '@/storage/crypto.js'
import { getBlobDurationMs, computeSentenceTimings, recomputeMasterTimeline }
  from '@/audio/timestamps.js'
import { stitchBlobs }   from '@/audio/stitcher.js'
import {
  saveAudioSentence, saveAudioStitched, getAudioSentence,
  saveProject,
} from '@/store/db.js'
import { writeFileToFolder, buildDiskFilename, requestFolderPermission } from '@/storage/filesystem.js'
import { useProjectStore } from '@/store/project.js'

export const useGenerationStore = defineStore('generation', () => {
  const projectStore = useProjectStore()

  // ─── State ──────────────────────────────────────────────────────────────────
  const groups       = ref([])   // ParagraphGroup[]  — current project
  const sentences    = ref({})   // { [sentenceId]: Sentence }
  const isGenerating = ref(false)
  const totalCount   = ref(0)
  const doneCount    = ref(0)
  const failCount    = ref(0)
  const currentError = ref(null) // last error message
  const diskDivergences = ref({}) // { [groupId]: DivergenceType } — set by sync check

  // ─── Getters ────────────────────────────────────────────────────────────────
  const progress = computed(() =>
    totalCount.value === 0 ? 0 : doneCount.value / totalCount.value
  )

  const progressLabel = computed(() =>
    `Generating ${doneCount.value} / ${totalCount.value}`
  )

  // ─── Load groups from project ────────────────────────────────────────────────
  function loadFromProject() {
    const p = projectStore.project
    if (!p) return

    const savedGroups = p.paragraphGroups ?? []
    if (savedGroups.length === 0) return

    // Restore groups reactively
    groups.value = savedGroups.map(g => ({ ...g }))

    // Rebuild sentence lookup
    sentences.value = {}
    for (const g of savedGroups) {
      for (const s of g.sentences ?? []) {
        sentences.value[s.id] = { ...s }
      }
    }

    // Restore _currentWidth of playlist isn't relevant here but
    // restore master timeline totals from saved data
    console.debug(`[generation] Loaded ${savedGroups.length} groups from project`)
  }

  // ─── Build groups from editor doc ────────────────────────────────────────────
  /**
   * Extract tagged spans from the editor doc and create
   * ParagraphGroup + Sentence records. Existing "ready" groups are skipped
   * unless forceRegenerate is true.
   *
   * @param {ProseMirrorNode} doc
   * @param {number}          charLimit
   * @param {boolean}         forceRegenerate
   */
  function buildGroupsFromDoc(doc, charLimit = 250, forceRegenerate = false) {
    const spans = extractTaggedSpans(doc)
    const existingGroupMap = Object.fromEntries(groups.value.map(g => [g.spanKey, g]))

    // Group consecutive same-role spans together.
    // Each span (paragraph) becomes one sentence; consecutive paragraphs
    // under the same [LABEL] become one playlist group.
    const spanGroups = []
    for (const span of spans) {
      const last = spanGroups[spanGroups.length - 1]
      if (last && last.roleId === span.roleId) {
        last.spans.push(span)
        last.to = span.to
      } else {
        spanGroups.push({
          roleId:    span.roleId,
          roleLabel: span.roleLabel,
          color:     span.color,
          from:      span.from,
          to:        span.to,
          spans:     [span],
        })
      }
    }

    const newGroups = spanGroups.map((sg, groupIndex) => {
      // Stable key: role + position of first and last span
      const spanKey = `${sg.roleId}:${sg.from}:${sg.to}`
      const existing = existingGroupMap[spanKey]

      if (existing && existing.stitchStatus === 'ready' && !forceRegenerate) {
        return existing
      }

      // Each span in the group becomes one or more sentences (split by § only)
      const sentenceList = []
      let si = 0
      for (const span of sg.spans) {
        const chunks = splitTaggedSpan(span.text, charLimit)
        let charCursor = 0
        for (const chunk of chunks) {
          const sentenceId = existing?.sentences?.[si]?.id ?? uuid()
          const textStart  = charCursor
          const textEnd    = charCursor + chunk.text.length
          charCursor = textEnd + 1

          sentenceList.push({
            id:               sentenceId,
            paragraphGroupId: null, // filled below
            roleId:           sg.roleId,
            text:             chunk.text,
            sentenceIndex:    si,
            status:           'pending',
            audioKey:         null,
            durationMs:       null,
            startMs:          null,
            endMs:            null,
            editorFrom:       span.from + textStart,
            editorTo:         span.from + textEnd,
            wordTimings:      null,
            splitWarning:     chunk.splitWarning,
          })
          si++
        }
      }

      const groupId    = existing?.id ?? `group_${groupIndex}_${uuid()}`
      const role       = projectStore.cast.find(r => r.id === sg.roleId)
      const providerId = role?.voiceAssignment?.providerId ?? 'browser'
      sentenceList.forEach(s => { s.paragraphGroupId = groupId })

      return {
        id:                  groupId,
        spanKey,
        roleId:              sg.roleId,
        roleLabel:           sg.roleLabel,
        color:               sg.color,
        providerId,
        livePlayback:        providerId === 'browser',
        _voiceURI:           providerId === 'browser' ? (role?.voiceAssignment?.voiceId ?? null) : null,
        order:               groupIndex + 1,
        sentences:           sentenceList,
        sentenceIds:         sentenceList.map(s => s.id),
        stitchedAudioKey:    null,
        stitchedDiskFilename: null,
        totalDurationMs:     null,
        startMs:             null,
        endMs:               null,
        stitchStatus:        'pending',
        stitchError:         null,
      }
    })

    groups.value = newGroups

    // Rebuild sentence lookup
    sentences.value = {}
    for (const g of newGroups) {
      for (const s of g.sentences ?? []) {
        sentences.value[s.id] = s
      }
    }
  }

  // ─── Main generate function ──────────────────────────────────────────────────
  /**
   * Generate audio for all pending sentences.
   *
   * @param {{ providerId, charLimit, doc, onFolderPrompt }} opts
   */
// ─── Main generate function (Upgraded for Multi-Provider & Advanced Settings) ───
async function generateAll({ providerId: defaultProviderId, charLimit = 250, doc, onFolderPrompt }) {
  if (isGenerating.value) return
  if (!doc) throw new Error('Editor doc is required')

  // Build/update groups from current doc
  buildGroupsFromDoc(doc, charLimit)

  // Collect pending sentences
  const pendingSentences = groups.value
    .flatMap(g => g.sentences ?? [])
    .filter(s => s.status === 'pending' || s.status === 'error')

  if (pendingSentences.length === 0) return

  // 1. Identify all unique providers used in this batch
  const usedProviderIds = new Set(
    pendingSentences.map(s => {
      const role = projectStore.cast.find(r => r.id === s.roleId)
      return role?.voiceAssignment?.providerId || defaultProviderId
    })
  )

  // 2. Resolve API keys for ALL needed providers before starting
  const apiKeys = {}
  try {
    for (const pId of usedProviderIds) {
      if (pId === 'browser') { apiKeys[pId] = null; continue }
      apiKeys[pId] = await resolveApiKey(pId)
    }
  } catch (err) {
    currentError.value = err.message === 'API_KEY_LOCKED' 
      ? 'One or more API keys are locked — check Settings.' 
      : err.message
    throw err
  }

  // Check if output folder prompt is needed
  const project = projectStore.project
  if (project && !project.outputFolderHandle && !project.outputFolderPromptDismissed && onFolderPrompt) {
    await onFolderPrompt()
  }

  isGenerating.value  = true
  totalCount.value    = pendingSentences.length
  doneCount.value     = 0
  failCount.value     = 0
  currentError.value  = null

  // 3. Build generation tasks
  const tasks = pendingSentences.map(sentence => async () => {
    setSentenceStatus(sentence.id, 'generating')

    const role = projectStore.cast.find(r => r.id === sentence.roleId)
    
    // Determine which provider this specific role wants to use
    const targetProviderId = role?.voiceAssignment?.providerId || defaultProviderId
    const provider = getProvider(targetProviderId)
    const apiKey   = apiKeys[targetProviderId]
    const voiceId  = role?.voiceAssignment?.voiceId

    if (!provider) {
      setSentenceStatus(sentence.id, 'error', `Provider "${targetProviderId}" not found`)
      failCount.value++
      return
    }

    if (!voiceId) {
      setSentenceStatus(sentence.id, 'error', `No voice assigned to role "${role?.label}"`)
      failCount.value++
      return
    }

    try {
      // Browser provider: SpeechSynthesis at play time — no blob, estimate duration
      if (targetProviderId === 'browser') {
        const durationMs = Math.ceil((sentence.text.length / 15) * 1000)
        updateSentence(sentence.id, { status: 'ready', audioKey: null, durationMs, wordTimings: null })
        doneCount.value++
        const group = groups.value.find(g => g.id === sentence.paragraphGroupId)
        if (group) await maybeStitchGroup(group, provider)
        return
      }

      // Pass the role-specific settings (Pitch, Rate, Vol, Emotion) to the provider
      const result = await provider.generate({
        text:     sentence.text,
        voiceId,
        settings: role.voiceAssignment.settings ?? {},
        apiKey,
        // Pull GroupId if provider is MiniMax
        groupId:  projectStore.project?.apiConfig?.providers?.[targetProviderId]?.groupId,
      })

      await saveAudioSentence(sentence.id, result.blob)

      let durationMs = null
      try {
        durationMs = await getBlobDurationMs(result.blob)
      } catch {
        durationMs = Math.round((sentence.text.split(' ').length / 150) * 60_000)
      }

      updateSentence(sentence.id, {
        status:      'ready',
        audioKey:    sentence.id,
        durationMs,
        wordTimings: result.wordTimings ?? null,
      })

      doneCount.value++

      const group = groups.value.find(g => g.id === sentence.paragraphGroupId)
      if (group) await maybeStitchGroup(group, provider)

    } catch (err) {
      setSentenceStatus(sentence.id, 'error', err.message)
      failCount.value++
      currentError.value = err.message
    }
  })

  await withConcurrency(tasks, 2)

  const updated = recomputeMasterTimeline(groups.value)
  groups.value = updated

  if (projectStore.project) {
    projectStore.project.paragraphGroups = groups.value
    await saveProject(projectStore.project)
  }

  isGenerating.value = false
}

  // ─── Stitch a group when all its sentences are ready ─────────────────────────
  async function maybeStitchGroup(group, provider) {
    const groupSentences = (group.sentences ?? [])
    const allReady = groupSentences.every(s => {
      const live = sentences.value[s.id]
      return live?.status === 'ready' || live?.status === 'preview'
    })

    if (!allReady) return

    // Browser groups use SpeechSynthesis — no stitching needed, mark ready immediately
    if (group.livePlayback) {
      const readySentences = groupSentences.map(s => sentences.value[s.id])
      const timings = computeSentenceTimings(readySentences)
      timings.forEach((t, i) => {
        updateSentence(readySentences[i].id, { startMs: t.startMs, endMs: t.endMs })
      })
      const totalDurationMs = timings[timings.length - 1]?.endMs ?? 0
      updateGroup(group.id, { stitchStatus: 'ready', stitchedAudioKey: null, totalDurationMs })
      return
    }

    // Update group status
    updateGroup(group.id, { stitchStatus: 'stitching' })

    try {
      // Collect sentence blobs in order
      const blobs = []
      for (const s of groupSentences) {
        const live = sentences.value[s.id]
        if (live?.status === 'ready' && live.audioKey) {
          const blob = await getAudioSentence(live.audioKey)
          if (blob) blobs.push(blob)
        }
      }

      if (blobs.length === 0) throw new Error('No audio blobs to stitch')

      // Stitch blobs
	  // CHANGE IT TO:
      const stitchedBlob = await stitchBlobs(blobs)

      // Compute total duration from sentence timings
      const readySentences = groupSentences.map(s => sentences.value[s.id])
      const timings = computeSentenceTimings(readySentences)
      timings.forEach((t, i) => {
        updateSentence(readySentences[i].id, { startMs: t.startMs, endMs: t.endMs })
      })
      const totalDurationMs = timings[timings.length - 1]?.endMs ?? 0

      // Store stitched blob
      await saveAudioStitched(group.id, stitchedBlob)

      // Build disk filename
      const diskFilename = buildDiskFilename(
        group.order,
        group.roleLabel,
        group.order
      )

      // Write to disk if output folder is linked
      const project = projectStore.project
      if (project?.outputFolderHandle) {
        try {
          const perm = await requestFolderPermission(project.outputFolderHandle)
          if (perm === 'granted') {
            await writeFileToFolder(project.outputFolderHandle, diskFilename, stitchedBlob)
          }
        } catch { /* disk write failure is non-blocking */ }
      }

      // Update group
      updateGroup(group.id, {
        stitchStatus:        'ready',
        stitchedAudioKey:    group.id,
        stitchedDiskFilename: diskFilename,
        totalDurationMs,
      })

      // Update project audio size
      if (projectStore.project) {
        projectStore.project.audioSizeBytes =
          (projectStore.project.audioSizeBytes ?? 0) + stitchedBlob.size
      }

    } catch (err) {
      updateGroup(group.id, { stitchStatus: 'error', stitchError: err.message })
    }
  }

  // ─── Regenerate a single group ────────────────────────────────────────────────
  async function regenerateGroup(groupId, { providerId, doc, onFolderPrompt }) {
    if (!doc) throw new Error('Editor doc is required')

    const group = groups.value.find(g => g.id === groupId)
    if (!group) return

    // Reset group and all its sentences to pending
    updateGroup(groupId, {
      stitchStatus:        'pending',
      stitchedAudioKey:    null,
      stitchedDiskFilename: null,
      totalDurationMs:     null,
      startMs:             null,
      endMs:               null,
    })
    for (const s of group.sentences ?? []) {
      updateSentence(s.id, {
        status:      'pending',
        audioKey:    null,
        durationMs:  null,
        startMs:     null,
        endMs:       null,
        wordTimings: null,
        errorMessage: null,
      })
    }

    // Re-run the full generation pipeline (it will skip already-ready sentences
    // in other groups since they are status "ready", not "pending")
    await generateAll({ providerId, charLimit: 250, doc, onFolderPrompt })
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function setSentenceStatus(sentenceId, status, errorMessage = null) {
    const s = sentences.value[sentenceId]
    if (!s) return
    s.status = status
    if (errorMessage) s.errorMessage = errorMessage

    // Sync into groups
    for (const g of groups.value) {
      const idx = (g.sentences ?? []).findIndex(x => x.id === sentenceId)
      if (idx !== -1) { g.sentences[idx] = { ...g.sentences[idx], status, errorMessage } }
    }
  }

  function updateSentence(sentenceId, updates) {
    const s = sentences.value[sentenceId]
    if (!s) return
    Object.assign(s, updates)

    // Sync into groups
    for (const g of groups.value) {
      const idx = (g.sentences ?? []).findIndex(x => x.id === sentenceId)
      if (idx !== -1) {
        g.sentences[idx] = { ...g.sentences[idx], ...updates }
      }
    }
  }

  function updateGroup(groupId, updates) {
    const idx = groups.value.findIndex(g => g.id === groupId)
    if (idx !== -1) {
      groups.value[idx] = { ...groups.value[idx], ...updates }
    }
  }

  function setDivergences(report) {
    const map = {}
    for (const d of report.divergences ?? []) {
      map[d.groupId] = d.type
    }
    diskDivergences.value = map
  }

  function clearDivergence(groupId) {
    const updated = { ...diskDivergences.value }
    delete updated[groupId]
    diskDivergences.value = updated
  }

  function clearAllDivergences() {
    diskDivergences.value = {}
  }

  function deleteGroups(groupIds) {
    const idSet = new Set(groupIds)
    // Remove sentences belonging to deleted groups
    for (const id of idSet) {
      const group = groups.value.find(g => g.id === id)
      if (group) {
        for (const s of group.sentences ?? []) {
          delete sentences.value[s.id]
        }
      }
    }
    groups.value = groups.value.filter(g => !idSet.has(g.id))
    // Persist
    if (projectStore.project) {
      projectStore.project.paragraphGroups = groups.value
    }
  }

  function reset() {
    groups.value      = []
    sentences.value   = {}
    isGenerating.value = false
    totalCount.value  = 0
    doneCount.value   = 0
    failCount.value   = 0
    currentError.value = null
    diskDivergences.value = {}
  }

  return {
    groups, sentences, isGenerating,
    totalCount, doneCount, failCount, currentError,
    diskDivergences,
    progress, progressLabel,
    loadFromProject, buildGroupsFromDoc,
    generateAll, regenerateGroup, updateGroup, deleteGroups,
    setDivergences, clearDivergence, clearAllDivergences,
    reset,
  }
})
