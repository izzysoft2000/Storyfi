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

    const newGroups = spans.map((span, spanIndex) => {
      // Create a stable key for this span by role + position
      const spanKey = `${span.roleId}:${span.from}:${span.to}`
      const existing = existingGroupMap[spanKey]

      if (existing && existing.stitchStatus === 'ready' && !forceRegenerate) {
        return existing // keep ready group
      }

      // Split into sentences
      const chunks = splitTaggedSpan(span.text, charLimit)

      // Build character-offset positions within span text
      let charCursor = 0
      const sentenceList = chunks.map((chunk, si) => {
        const sentenceId = existing?.sentences?.[si]?.id ?? uuid()
        const textStart  = charCursor
        const textEnd    = charCursor + chunk.text.length
        charCursor = textEnd + 1 // +1 for separator

        return {
          id:               sentenceId,
          paragraphGroupId: existing?.id ?? `group_${spanIndex}_${uuid()}`,
          roleId:           span.roleId,
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
        }
      })

      const groupId = existing?.id ?? `group_${spanIndex}_${uuid()}`

      // Fix sentence paragraphGroupId now that we have it
      sentenceList.forEach(s => { s.paragraphGroupId = groupId })

      return {
        id:                  groupId,
        spanKey,
        roleId:              span.roleId,
        roleLabel:           span.roleLabel,
        color:               span.color,
        order:               spanIndex + 1,
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
  async function generateAll({ providerId, charLimit = 250, doc, onFolderPrompt }) {
    if (isGenerating.value) return
    if (!doc) throw new Error('Editor doc is required')

    const provider = getProvider(providerId)
    if (!provider) throw new Error(`Provider "${providerId}" not registered`)

    // Build/update groups from current doc
    buildGroupsFromDoc(doc, charLimit)

    // Resolve API key
    let apiKey
    try {
      apiKey = await resolveApiKey(providerId)
    } catch (err) {
      if (err.message === 'API_KEY_LOCKED') {
        currentError.value = 'API key is locked — enter your password in Settings.'
      } else {
        currentError.value = err.message
      }
      throw err
    }

    // Check if output folder prompt is needed
    const project = projectStore.project
    if (
      project &&
      !project.outputFolderHandle &&
      !project.outputFolderPromptDismissed &&
      onFolderPrompt
    ) {
      await onFolderPrompt() // resolves when user picks folder or skips
    }

    // Collect pending sentences
    const pendingSentences = groups.value
      .flatMap(g => g.sentences ?? [])
      .filter(s => s.status === 'pending' || s.status === 'error')

    if (pendingSentences.length === 0) return

    isGenerating.value  = true
    totalCount.value    = pendingSentences.length
    doneCount.value     = 0
    failCount.value     = 0
    currentError.value  = null

    // Build generation tasks
    const tasks = pendingSentences.map(sentence => async () => {
      setSentenceStatus(sentence.id, 'generating')

      const role = projectStore.cast.find(r => r.id === sentence.roleId)
      const voiceId = role?.voiceAssignment?.voiceId

      if (!voiceId) {
        setSentenceStatus(sentence.id, 'error',
          `No voice assigned to role "${role?.label ?? sentence.roleId}"`)
        failCount.value++
        return
      }

      try {
        const result = await provider.generate({
          text:     sentence.text,
          voiceId,
          settings: role.voiceAssignment.settings ?? {},
          apiKey,
          groupId:  projectStore.project?.apiConfig?.providers?.[providerId]?.groupId,
        })

        // Store sentence blob in IndexedDB
        await saveAudioSentence(sentence.id, result.blob)

        // Compute duration
        let durationMs = null
        try {
          durationMs = await getBlobDurationMs(result.blob)
        } catch {
          // Duration decode failed — estimate from text length (~150 wpm)
          durationMs = Math.round((sentence.text.split(' ').length / 150) * 60_000)
        }

        // Update sentence record
        updateSentence(sentence.id, {
          status:      'ready',
          audioKey:    sentence.id,
          durationMs,
          wordTimings: result.wordTimings ?? null,
        })

        doneCount.value++

        // Check if all sentences in this group are ready → stitch
        const group = groups.value.find(g => g.id === sentence.paragraphGroupId)
        if (group) await maybeStitchGroup(group, provider)

      } catch (err) {
        setSentenceStatus(sentence.id, 'error', err.message)
        failCount.value++
        currentError.value = err.message
      }
    })

    // Run with max 2 concurrent requests
    await withConcurrency(tasks, 2)

    // Recompute master timeline
    const updated = recomputeMasterTimeline(groups.value)
    groups.value = updated

    // Persist updated groups to project
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
    generateAll, regenerateGroup, updateGroup,
    setDivergences, clearDivergence, clearAllDivergences,
    reset,
  }
})
