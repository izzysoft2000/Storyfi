/**
 * tts/openai.js
 * OpenAI TTS provider.
 *
 * API: POST https://api.openai.com/v1/audio/speech
 * Returns: binary MP3 directly (no base64 decoding needed)
 * No word timestamps — uses sentence-level highlight fallback.
 *
 * Note: OpenAI does support CORS from browser origins.
 */

import { withRetry } from './provider.js'

const BASE_URL = 'https://api.openai.com/v1'

// OpenAI has a fixed set of voices — no API endpoint to fetch them.
const OPENAI_VOICES = [
  { id: 'alloy',   name: 'Alloy',   gender: 'neutral', language: 'en' },
  { id: 'echo',    name: 'Echo',    gender: 'male',    language: 'en' },
  { id: 'fable',   name: 'Fable',   gender: 'male',    language: 'en' },
  { id: 'onyx',    name: 'Onyx',    gender: 'male',    language: 'en' },
  { id: 'nova',    name: 'Nova',    gender: 'female',  language: 'en' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female',  language: 'en' },
]

export const openaiProvider = {
  id:   'openai',
  name: 'OpenAI TTS',

  capabilities: {
    wordTimestamps:     false,  // → sentence-level highlight fallback
    sentenceTimestamps: false,
    emotions:           false,
    streaming:          false,
  },

  /** Static voice list — always available, even offline. */
  async voices() {
    return OPENAI_VOICES
  },

  /**
   * Generate speech for a sentence.
   *
   * @param {{ text, voiceId, settings, apiKey }} params
   * @returns {Promise<{ blob: Blob, wordTimings: null }>}
   */
  async generate({ text, voiceId, settings = {}, apiKey }) {
    if (!apiKey) throw new Error('OpenAI API key is required')

    const res = await withRetry(() =>
      fetch(`${BASE_URL}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:           settings.model   ?? 'tts-1',
          input:           text,
          voice:           voiceId,
          response_format: 'mp3',
          speed:           settings.speed   ?? 1.0,
        }),
      })
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      const err = new Error(`OpenAI TTS error ${res.status}: ${errText}`)
      err.status = res.status
      throw err
    }

    const blob = await res.blob()
    return { blob, wordTimings: null } // no timestamps → sentence highlight
  },
}
