/**
 * src/store/playback.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pinia store for audio playback. Owns transport state (isPlaying, currentMs,
 * etc.) and drives editor highlight sync via a requestAnimationFrame loop.
 *
 * CRITICAL: All Web Audio objects (AudioContext, AudioBufferSourceNode,
 * AudioBuffer[]) live in MODULE-LEVEL variables — never in Pinia reactive
 * state. Vue Proxy-wrapping these objects causes silent failures.
 * Same pattern as Bug Fix #4 (resizable pane DOM-only during drag).
 *
 * CRITICAL: All imports are static at the top level. No dynamic import()
 * calls inside async functions or loops (Bug Fix #6).
 */

import { defineStore } from 'pinia'
import { getAudioStitched } from './db.js'
import { formatDuration } from '../audio/timestamps.js'

// ─── Module-level Web Audio internals (non-reactive) ──────────────────────────

/** @type {AudioContext|null} */
let _audioCtx = null

/** @type {(AudioBuffer|null)[]} Indexed parallel to the groups array passed to loadAndPlay() */
let _buffers = []

/** @type {AudioBufferSourceNode|null} Currently playing source node */
let _source = null

/** audioCtx.currentTime captured when source.start() was called (for elapsed-time math) */
let _startedAtCtx = 0

/** Global ms offset of the currently playing group's start in the master timeline */
let _segmentOffsetMs = 0

/** requestAnimationFrame ID */
let _rafId = null

/** Snapshot of paragraphGroups[] passed to loadAndPlay() */
let _groups = null

/**
 * Cache of computed word→editor positions.
 * Map<sentenceId, WordPosition[] | false>
 * `false` means "computed but nothing found" — avoids re-computing on every frame.
 */
let _wordPositionCache = new Map()

/**
 * Reference to the StoryEditor component instance.
 * Must expose: highlightWord(from, to), highlightSentence(from, to),
 *              clearHighlight(), getEditor() → Tiptap Editor instance
 */
let _editorRef = null

/**
 * Downsampled amplitude data for the waveform canvas.
 * Float32Array of length WAVEFORM_BARS — each value 0..1.
 * Built once after all buffers are decoded. Non-reactive (raw typed array).
 */
let _waveformData = null

// Browser TTS pause state — SpeechSynthesis.pause() is unreliable (especially
// on iOS), so we cancel() immediately and re-speak from sentence start on resume.
let _browserPausedGroupIdx   = -1
let _browserPausedSentenceIdx = -1
const WAVEFORM_BARS = 200

// ─── Pure helpers (no Vue/Pinia dependency) ───────────────────────────────────

/**
 * Find the sentence in a group whose time window contains `groupLocalMs`.
 * Clamps to the last sentence to handle float drift at end of group.
 *
 * @param {object} group - ParagraphGroup with sentences[]
 * @param {number} groupLocalMs - ms elapsed since group start
 * @returns {object|null} Sentence
 */
function findCurrentSentence(group, groupLocalMs) {
  const sentences = group?.sentences
  if (!sentences?.length) return null

  const hasTiming = sentences.some(s => s.startMs != null)
  if (hasTiming) {
    for (const s of sentences) {
      if (groupLocalMs >= (s.startMs ?? 0) && groupLocalMs < (s.endMs ?? Infinity)) {
        return s
      }
    }
    return sentences[sentences.length - 1] ?? null
  }

  // Fallback: no timing yet — distribute evenly by estimated duration
  const totalDur = group.totalDurationMs || 1
  const idx = Math.min(
    Math.floor((groupLocalMs / totalDur) * sentences.length),
    sentences.length - 1
  )
  return sentences[idx] ?? null
}

/**
 * Map word timings to ProseMirror editor positions using sequential indexOf
 * within the sentence's editor range. Called once per sentence, result cached.
 *
 * MiniMax word_info shape: { word: string, start_ms: number, end_ms: number }
 *
 * @param {import('@tiptap/core').Editor} editor - Tiptap editor instance
 * @param {object} sentence - Sentence with wordTimings[], editorFrom, editorTo
 * @returns {Array<{start_ms, end_ms, editorFrom, editorTo}>|null}
 */
function computeWordEditorPositions(editor, sentence) {
  if (!sentence.wordTimings?.length || sentence.editorFrom == null) return null

  try {
    const docSize = editor.state.doc.content.size
    const safeFrom = Math.max(0, sentence.editorFrom)
    const safeTo = Math.min(sentence.editorTo ?? docSize, docSize)
    if (safeFrom >= safeTo) return null

    // textBetween with '\0' block separator avoids joining across nodes
    const docText = editor.state.doc.textBetween(safeFrom, safeTo, '\0', '\0')
    const result = []
    let cursor = 0

    for (const wt of sentence.wordTimings) {
      const word = (wt.word ?? '').trim()
      if (!word) continue

      const idx = docText.indexOf(word, cursor)
      if (idx === -1) continue // word not found — skip (punctuation variance)

      result.push({
        start_ms: wt.start_ms ?? 0,
        end_ms: wt.end_ms ?? 0,
        editorFrom: safeFrom + idx,
        editorTo: safeFrom + idx + word.length,
      })
      cursor = idx + word.length
    }

    return result.length ? result : null
  } catch (_) {
    return null
  }
}

// ─── Waveform data builder ─────────────────────────────────────────────────────

/**
 * Downsample all decoded AudioBuffers into a single Float32Array of `bars`
 * amplitude values (0..1). Merges channels by averaging, then reduces to bars
 * by taking the RMS of each chunk.
 *
 * @param {(AudioBuffer|null)[]} buffers
 * @param {number} bars
 * @returns {Float32Array}
 */
function buildWaveformData(buffers, bars) {
  // Concatenate all channel data into one flat array
  const chunks = []
  let totalSamples = 0

  for (const buf of buffers) {
    if (!buf || buf._browserLive) continue  // skip browser live sentinels
    const nCh = buf.numberOfChannels
    const len = buf.length
    const merged = new Float32Array(len)
    for (let ch = 0; ch < nCh; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) merged[i] += data[i] / nCh
    }
    chunks.push(merged)
    totalSamples += len
  }

  if (totalSamples === 0) return new Float32Array(bars)

  // Downsample to `bars` values using RMS per chunk
  const result     = new Float32Array(bars)
  const chunkSize  = totalSamples / bars
  let   globalIdx  = 0
  let   chunkIdx   = 0
  let   posInChunk = 0

  for (let b = 0; b < bars; b++) {
    let   sumSq = 0
    let   count = 0
    const target = Math.round((b + 1) * chunkSize) - Math.round(b * chunkSize)

    for (let s = 0; s < target; s++) {
      if (chunkIdx >= chunks.length) break
      const val = chunks[chunkIdx][posInChunk]
      sumSq += val * val
      count++
      posInChunk++
      if (posInChunk >= chunks[chunkIdx].length) {
        chunkIdx++
        posInChunk = 0
      }
    }
    globalIdx += target
    result[b] = count > 0 ? Math.sqrt(sumSq / count) : 0
  }

  // Normalise to 0..1
  let max = 0
  for (let i = 0; i < bars; i++) if (result[i] > max) max = result[i]
  if (max > 0) for (let i = 0; i < bars; i++) result[i] /= max

  return result
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePlaybackStore = defineStore('playback', {
  state: () => ({
    /** Whether audio is currently emitting sound */
    isPlaying: false,

    /** Whether playback is paused mid-session (AudioContext suspended) */
    isPaused: false,

    /** Whether buffers are being loaded/decoded from IndexedDB */
    isLoading: false,

    /** Non-null if loading or playback failed */
    loadError: null,

    /**
     * Index into groupOffsets[] / _groups[] for the currently playing group.
     * -1 when stopped.
     */
    currentGroupIdx: -1,

    /** sentenceId of the sentence currently under the playhead — for row highlighting */
    currentSentenceId: null,

    /** Whether the playlist should auto-scroll/expand to track the playing sentence */
    followMode: true,

    /** Master timeline position in ms — updated every RAF tick */
    currentMs: 0,

    /** Total duration of all stitched groups in ms */
    totalMs: 0,

    /**
     * Offset table built during loadAndPlay().
     * Readable by components for seek / row highlighting.
     * Shape: [{ groupId, groupIdx, startMs, endMs, hasAudio }]
     */
    groupOffsets: [],

    /**
     * Increments each time waveform data is rebuilt — AudioPlayerBar
     * watches this to know when to redraw. The actual Float32Array lives
     * in _waveformData (non-reactive) to avoid Vue Proxy wrapping typed arrays.
     */
    waveformVersion: 0,
  }),

  // ─── Getters ───────────────────────────────────────────────────────────────

  getters: {
    /** 0–1 fractional progress through the full timeline */
    progress: (state) => (state.totalMs > 0 ? state.currentMs / state.totalMs : 0),

    /** true if at least one group has been decoded successfully */
    hasAudio: (state) => state.totalMs > 0,

    /** Human-readable current time, e.g. "1:23" */
    currentTimeDisplay: (state) => formatDuration(state.currentMs),

    /** Human-readable total time, e.g. "4:07" */
    totalTimeDisplay: (state) => formatDuration(state.totalMs),

    /** Returns the raw waveform Float32Array — null until decoded.
     *  Depends on waveformVersion so Pinia recomputes when data is built. */
    waveformData: (state) => state.waveformVersion > 0 ? _waveformData : null,
  },

  // ─── Actions ───────────────────────────────────────────────────────────────

  actions: {
    // ── External wiring ──────────────────────────────────────────────────────

    /**
     * Called by EditorView.vue after the StoryEditor component mounts.
     * The ref must expose: highlightWord, highlightSentence, clearHighlight, getEditor.
     */
    setEditorRef(ref) {
      _editorRef = ref
    },

    // ── Main entry point ─────────────────────────────────────────────────────

    /**
     * Load stitched audio for all groups from IndexedDB, decode into AudioBuffers,
     * then begin sequential playback starting at `startGroupIdx`.
     *
     * Safe to call while already playing — stops current playback first.
     *
     * @param {object[]} groups - project.paragraphGroups
     * @param {number} [startGroupIdx=0]
     */
    async loadAndPlay(groups, startGroupIdx = 0) {
      this._cleanup()
      this.isLoading = true
      this.loadError = null

      _groups = groups
      _wordPositionCache = new Map()

      try {
        // AudioContext must be created (or resumed) inside a user gesture handler.
        if (!_audioCtx || _audioCtx.state === 'closed') {
          _audioCtx = new AudioContext()
        } else if (_audioCtx.state === 'suspended') {
          await _audioCtx.resume()
        }

        _buffers = new Array(groups.length).fill(null)
        const offsets = []
        let ms = 0

        for (let i = 0; i < groups.length; i++) {
          const group = groups[i]
          const startMs = ms
          let hasAudio = false

          try {
            if (group.livePlayback) {
              const estimatedMs = (group.sentences ?? []).reduce(
                (sum, s) => sum + (s.durationMs ?? Math.ceil((s.text?.length ?? 0) / 15 * 1000)), 0
              )
              _buffers[i] = { _browserLive: true, group }
              ms += estimatedMs
              hasAudio = true
            } else {
              const blob = await getAudioStitched(group.id)
              if (blob) {
                const arrayBuf = await blob.arrayBuffer()
                const audioBuf = await Promise.race([
                  _audioCtx.decodeAudioData(arrayBuf),
                  new Promise((_, rej) =>
                    setTimeout(() => rej(new Error('decodeAudioData timeout')), 10_000)
                  ),
                ])
                _buffers[i] = audioBuf
                ms += audioBuf.duration * 1000
                hasAudio = true
              }
            }
          } catch (err) {
            console.warn(`[playback] Could not decode group ${group.id}:`, err)
          }

          offsets.push({ groupId: group.id, groupIdx: i, startMs, endMs: ms, hasAudio })
        }

        this.groupOffsets = offsets
        this.totalMs = ms
        this.isLoading = false

        if (ms === 0) {
          this.loadError = 'No generated audio found. Run Generate first.'
          return
        }

        // Build waveform amplitude data from all decoded buffers
        _waveformData = buildWaveformData(_buffers, WAVEFORM_BARS)
        this.waveformVersion++

        this._startGroup(startGroupIdx)
      } catch (err) {
        this.isLoading = false
        this.loadError = err?.message ?? 'Playback failed'
        console.error('[playback]', err)
      }
    },

    // ── Transport controls ────────────────────────────────────────────────────

    pause() {
      if (!this.isPlaying || this.isPaused) return

      // For browser TTS: speechSynthesis.pause() is unreliable — cancel immediately
      // and record where we are so resume() can restart from the same sentence.
      const buf = _buffers[this.currentGroupIdx]
      if (buf?._browserLive && 'speechSynthesis' in window) {
        // Find the sentence index we're currently on
        const group = buf.group
        const sentences = group.sentences ?? []
        const si = sentences.findIndex(s => s.id === this.currentSentenceId)
        _browserPausedGroupIdx    = this.currentGroupIdx
        _browserPausedSentenceIdx = Math.max(0, si)
        speechSynthesis.cancel()
      }

      _audioCtx?.suspend()
      this._stopRaf()
      this.isPlaying = false
      this.isPaused = true
    },

    resume() {
      if (!this.isPaused) return

      // For browser TTS: we cancelled on pause, so restart from the saved sentence
      if (_browserPausedGroupIdx >= 0) {
        const gi = _browserPausedGroupIdx
        const si = _browserPausedSentenceIdx
        _browserPausedGroupIdx    = -1
        _browserPausedSentenceIdx = -1
        this.isPaused = false
        // _startGroup re-enters the browser TTS loop from the beginning of the group;
        // we manually offset si so it starts at the right sentence.
        // Simplest: temporarily splice sentences so speakNext starts at si.
        const buf = _buffers[gi]
        if (buf?._browserLive) {
          const group = buf.group
          const allSentences = group.sentences ?? []
          // Temporarily replace sentences with the tail starting at si
          group.sentences = allSentences.slice(si)
          this._startGroup(gi)
          // Restore after one tick so generation/export aren't affected
          setTimeout(() => { group.sentences = allSentences }, 0)
          return
        }
      }

      _audioCtx?.resume()
      this.isPlaying = true
      this.isPaused = false
      this._startRaf()
    },

    togglePlayPause() {
      if (this.isPaused) this.resume()
      else if (this.isPlaying) this.pause()
      // If stopped: caller should invoke loadAndPlay()
    },

    stop() {
      this._cleanup()
      _editorRef?.clearHighlight?.()
    },

    /**
     * Jump playback to the start of a group.
     * If stopped, just repositions the playhead display.
     * If playing or paused, immediately seeks and resumes.
     *
     * @param {number} groupIdx
     */
    seekToGroup(groupIdx) {
      if (!_groups || groupIdx < 0 || groupIdx >= _groups.length) return

      // Advance past any groups without decoded audio
      let idx = groupIdx
      while (idx < _buffers.length && !_buffers[idx]) idx++
      if (idx >= _buffers.length) return

      if (this.isPlaying || this.isPaused) {
        if (_audioCtx?.state === 'suspended') _audioCtx.resume()
        this._startGroupAtOffset(idx, 0)
      } else {
        // Pre-position display without playing
        this.currentMs = this.groupOffsets[idx]?.startMs ?? 0
        this.currentGroupIdx = idx
      }
    },

    /**
     * Seek to an arbitrary ms position in the master timeline.
     * Works both while playing and while stopped/paused.
     *
     * @param {number} ms
     */
    seekToMs(ms) {
      if (!_groups) return
      const offset = this.groupOffsets.find(
        (o) => o?.hasAudio && ms >= o.startMs && ms < o.endMs
      ) ?? this.groupOffsets.filter(o => o?.hasAudio).at(-1)  // clamp to last group
      if (!offset) return

      const offsetInGroup = Math.max(0, ms - offset.startMs)

      if (this.isPlaying) {
        if (_audioCtx?.state === 'suspended') _audioCtx.resume()
        this._startGroupAtOffset(offset.groupIdx, offsetInGroup)
      } else if (this.isPaused) {
        this._stopSourceNode()
        this.currentMs       = ms
        this.currentGroupIdx = offset.groupIdx
        _startedAtCtx        = (_audioCtx?.currentTime ?? 0) - offsetInGroup / 1000
        _segmentOffsetMs     = offset.startMs
        this._syncHighlight()
      } else {
        this.currentMs       = ms
        this.currentGroupIdx = offset.groupIdx
      }
    },

    // ── Internal: audio scheduling ────────────────────────────────────────────

    /**
     * Start playing from `groupIdx`, advancing past any groups without audio.
     * @param {number} groupIdx
     */
    _startGroup(groupIdx) {
      this._stopSourceNode()

      let idx = groupIdx
      while (idx < _buffers.length && !_buffers[idx]) idx++

      if (idx >= _buffers.length) {
        this._onPlaybackEnded()
        return
      }

      this._startGroupAtOffset(idx, 0)
    },

    /**
     * Start playing group `groupIdx` starting `offsetMs` into its buffer.
     * @param {number} groupIdx
     * @param {number} offsetMs - offset within this group's buffer in ms
     */
    _startGroupAtOffset(groupIdx, offsetMs) {
      this._stopSourceNode()

      const buf = _buffers[groupIdx]
      if (!buf) {
        this._startGroup(groupIdx + 1)
        return
      }

      // ── Browser live playback via SpeechSynthesis ──────────────────────────
      if (buf._browserLive) {
        const group    = buf.group
        const sentences = group.sentences ?? []
        const groupOffset = this.groupOffsets[groupIdx]

        this.currentGroupIdx = groupIdx
        this.isPlaying = true
        this.isPaused  = false

        // Anchor the RAF clock to this group so currentMs is correct
        _segmentOffsetMs = groupOffset?.startMs ?? 0
        _startedAtCtx    = _audioCtx?.currentTime ?? 0

        this._startRaf()

        let si = 0
        const speakNext = () => {
          if (!this.isPlaying || si >= sentences.length) {
            if (this.isPlaying) this._startGroup(groupIdx + 1)
            return
          }
          const sentence = sentences[si++]

          // Update currentMs + currentSentenceId directly — SpeechSynthesis doesn't
          // give real-time position, so we drive highlight from sentence boundaries
          const sentenceAbsMs = _segmentOffsetMs + (sentence.startMs ?? 0)
          this.currentMs        = sentenceAbsMs
          this.currentSentenceId = sentence.id
          // Re-anchor RAF so elapsed time counts from this sentence's start
          _startedAtCtx  = (_audioCtx?.currentTime ?? 0) - (sentence.startMs ?? 0) / 1000

          const utt = new SpeechSynthesisUtterance(sentence.text)
          utt.rate = 1.0
          if (group._voiceURI) {
            const v = speechSynthesis.getVoices().find(v => v.voiceURI === group._voiceURI)
            if (v) utt.voice = v
          }
          utt.onend   = speakNext
          utt.onerror = speakNext
          speechSynthesis.speak(utt)
        }
        speechSynthesis.cancel()
        speakNext()
        return
      }

      // ── Normal AudioBuffer playback ────────────────────────────────────────
      const offsetSec = Math.max(0, offsetMs / 1000)
      const src = _audioCtx.createBufferSource()
      src.buffer = buf
      src.connect(_audioCtx.destination)
      src.onended = () => {
        if (this.isPlaying) this._startGroup(groupIdx + 1)
      }
      _source = src
      _startedAtCtx = _audioCtx.currentTime - offsetSec
      _segmentOffsetMs = this.groupOffsets[groupIdx]?.startMs ?? 0
      this.currentGroupIdx = groupIdx
      this.isPlaying = true
      this.isPaused = false
      src.start(0, offsetSec)
      this._startRaf()
    },

    _stopSourceNode() {
      if ('speechSynthesis' in window) speechSynthesis.cancel()
      if (_source) {
        try {
          _source.onended = null // prevent chaining
          _source.stop()
        } catch (_) {
          // stop() throws if source hasn't started yet — safe to ignore
        }
        _source = null
      }
    },

    _onPlaybackEnded() {
      this._stopRaf()
      this.isPlaying = false
      this.isPaused = false
      this.currentGroupIdx = -1
      this.currentMs = this.totalMs // show full duration at end
      _editorRef?.clearHighlight?.()
    },

    _cleanup() {
      this._stopSourceNode()
      this._stopRaf()
      this.isPlaying = false
      this.isPaused = false
      this.currentGroupIdx = -1
      this.currentMs = 0
      this.currentSentenceId = null
      _waveformData = null
      _browserPausedGroupIdx    = -1
      _browserPausedSentenceIdx = -1
    },

    // ── RAF loop ──────────────────────────────────────────────────────────────

    _startRaf() {
      this._stopRaf()
      const tick = () => {
        if (!this.isPlaying || !_audioCtx) return
        // Compute master timeline position from AudioContext clock (drift-free)
        const elapsedSec = _audioCtx.currentTime - _startedAtCtx
        this.currentMs = _segmentOffsetMs + elapsedSec * 1000
        this._syncHighlight()
        _rafId = requestAnimationFrame(tick)
      }
      _rafId = requestAnimationFrame(tick)
    },

    _stopRaf() {
      if (_rafId !== null) {
        cancelAnimationFrame(_rafId)
        _rafId = null
      }
    },

    // ── Highlight sync ────────────────────────────────────────────────────────

    /**
     * Called every RAF tick. Determines the current sentence (and word if
     * MiniMax word timings are present) and dispatches to StoryEditor.
     */
    _syncHighlight() {
      if (!_editorRef || !_groups) return

      const offset = this.groupOffsets[this.currentGroupIdx]
      if (!offset) return

      const group = _groups[this.currentGroupIdx]
      if (!group) return

      const groupLocalMs = this.currentMs - offset.startMs
      const sentence = findCurrentSentence(group, groupLocalMs)

      if (!sentence) {
        _editorRef.clearHighlight?.()
        return
      }

      // Update reactive sentence ID for playlist row highlighting (always — follow-independent)
      if (this.currentSentenceId !== sentence.id) {
        this.currentSentenceId = sentence.id
      }

      // ── Editor highlighting — only when followMode is on ─────────────────
      if (!this.followMode) return

      // ── Word-level highlight (MiniMax only) ──────────────────────────────

      if (sentence.wordTimings?.length > 0 && sentence.editorFrom != null) {
        let positions = _wordPositionCache.get(sentence.id)

        if (positions === undefined) {
          // Compute once per sentence per playback session
          const editor = _editorRef.getEditor?.()
          positions = editor ? computeWordEditorPositions(editor, sentence) : null
          // Cache as `false` (not null) to mark "computed but empty"
          _wordPositionCache.set(sentence.id, positions ?? false)
        }

        if (positions) {
          const sentenceLocalMs = groupLocalMs - (sentence.startMs ?? 0)
          const wt = positions.find(
            (w) => sentenceLocalMs >= w.start_ms && sentenceLocalMs < w.end_ms
          )
          if (wt) {
            _editorRef.highlightWord?.(wt.editorFrom, wt.editorTo)
            return
          }
        }
      }

      // ── Sentence-level fallback ───────────────────────────────────────────

      if (sentence.editorFrom != null) {
        _editorRef.highlightSentence?.(sentence.editorFrom, sentence.editorTo)
      }
    },
  },
})
