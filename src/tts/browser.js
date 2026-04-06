/**
 * tts/browser.js
 * Browser Web Speech API provider.
 *
 * Uses the built-in SpeechSynthesis API — free, offline, no API key.
 * Quality is lower than cloud TTS but works without any setup.
 *
 * Limitation: SpeechSynthesis doesn't produce downloadable MP3 blobs.
 * This provider is for preview/testing only. Generation stores a
 * placeholder blob and marks the sentence with a preview flag.
 *
 * Word-level events are available via SpeechSynthesisEvent.charIndex,
 * which can drive word highlighting during live playback.
 */

/** Fetch available voices from the browser's SpeechSynthesis engine. */
function getBrowserVoices() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices()
    if (voices.length > 0) {
      resolve(voices)
    } else {
      speechSynthesis.addEventListener('voiceschanged', () => {
        resolve(speechSynthesis.getVoices())
      }, { once: true })
    }
  })
}

export const browserProvider = {
  id:   'browser',
  name: 'Browser (offline)',

  capabilities: {
    wordTimestamps:     true,   // via charIndex events during live playback
    sentenceTimestamps: false,
    emotions:           false,
    streaming:          false,
  },

  async voices() {
    if (!('speechSynthesis' in window)) return []
    const raw = await getBrowserVoices()
    return raw.map(v => ({
      id:       v.voiceURI,
      name:     v.name,
      gender:   'unknown',
      language: v.lang,
      local:    v.localService,
    }))
  },

  /**
   * "Generate" using SpeechSynthesis.
   * Speaks the text aloud and returns a silent placeholder blob.
   * Suitable for previewing voices before committing to a cloud API.
   *
   * @param {{ text, voiceId, settings }} params
   * @returns {Promise<{ blob: Blob, wordTimings: null, isPreview: true }>}
   */
  async generate({ text, voiceId, settings = {} }) {
    if (!('speechSynthesis' in window)) {
      throw new Error('SpeechSynthesis is not supported in this browser')
    }

    // Speak the text
    await speak(text, voiceId, settings)

    // Return a silent placeholder blob (1 byte, not a real MP3)
    // The playlist will show a ⓟ preview badge instead of duration
    const silentBlob = new Blob([new Uint8Array([0])], { type: 'audio/mpeg' })

    return {
      blob:       silentBlob,
      wordTimings: null,
      isPreview:  true,
    }
  },
}

/** Speak text via SpeechSynthesis, resolving when finished. */
function speak(text, voiceURI, settings) {
  return new Promise((resolve, reject) => {
    speechSynthesis.cancel()

    const utt  = new SpeechSynthesisUtterance(text)
    utt.rate   = settings.speed ?? 1.0
    utt.pitch  = 1.0
    utt.volume = 1.0

    if (voiceURI) {
      const voices = speechSynthesis.getVoices()
      const voice  = voices.find(v => v.voiceURI === voiceURI)
      if (voice) utt.voice = voice
    }

    utt.onend   = () => resolve()
    utt.onerror = e  => reject(new Error(`SpeechSynthesis error: ${e.error}`))
    speechSynthesis.speak(utt)
  })
}
