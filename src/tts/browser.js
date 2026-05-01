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

/**
 * Guess gender from a browser voice name.
 * Checks for explicit Male/Female keywords first, then matches against
 * a list of common male/female given names found in TTS voice names.
 * Returns 'male' | 'female' | 'unknown'.
 */
function guessBrowserGender(name) {
  const n = name.toLowerCase()

  // Explicit keywords (Google voices: "Google UK English Male")
  if (/\bfemale\b/.test(n))           return 'female'
  if (/\bmale\b/.test(n))             return 'male'
  if (/\bwoman\b|\bgirl\b/.test(n))   return 'female'
  if (/\bman\b|\bguy\b/.test(n))      return 'male'

  // Extract first title-cased token that isn't a known vendor prefix
  // e.g. "Microsoft David - English (US)" → "david"
  const VENDORS = new Set(['microsoft','google','apple','amazon','samsung','android'])
  const tokens = name.match(/[A-Z][a-z]{1,}/g) || []
  let firstName = ''
  for (const t of tokens) {
    if (!VENDORS.has(t.toLowerCase())) { firstName = t.toLowerCase(); break }
  }

  const FEMALE = new Set([
    'allison','amanda','amy','anna','aria','ashley','audrey',
    'ava','bella','beth','bria','carmen','carol','caroline',
    'catharina','charlotte','claire','claudia','elena','elise',
    'elizabeth','ella','ellen','emily','emma','eva','evelyn',
    'fiona','grace','hazel','helen','hera','ida','irina',
    'isabel','isabella','jane','janet','jessica','joana','joanna',
    'joelle','julia','juliette','karen','kate','katherine','kathy',
    'katja','katrien','laura','leah','leila','lena','leonie',
    'lili','lina','linda','lisa','lotte','lucia','lucy',
    'mae','maria','marisol','martha','martina','mary','matilda',
    'melina','melissa','michelle','mia','moira','monica','nadia',
    'natalia','natasha','nicole','nina','nora','olivia',
    'penelope','petra','rachel','raveena','rosa','rosie','ruth',
    'sabina','sabrina','samantha','sandra','sara','sarah',
    'satu','selma','serena','shannon','sharon','siobhan',
    'sofia','sophie','stella','susan','sylvie','tanja','tessa',
    'tina','tracey','ting','uma','valentina','vanessa','veena',
    'vicki','victoria','vivienne','wendy','yelena','yuna','zosia',
  ])

  const MALE = new Set([
    'aaron','adam','albert','alex','alexei','alfred','ali',
    'alva','anders','andre','andrew','andy','antoine','antonio',
    'arjun','arthur','bader','bart','benjamin','brandon','brian',
    'bruce','carlos','charles','chris','christian','christoph',
    'claude','colin','craig','daniel','david','deepak','denis',
    'derek','dmitri','dominic','doran','douglas','dylan',
    'eddy','edgar','edward','eli','elliot','emir','eric',
    'ethan','evan','felix','filip','finn','franck','fred',
    'george','gordon','grant','hans','harold','harry','henry',
    'hugo','ivan','jack','jacob','james','jan','jason',
    'jean','jeff','joep','john','jonathan','jorge','jose',
    'joseph','juan','julian','julio','kai','kevin','knut',
    'lars','lasse','lee','liam','luca','lucas','luis',
    'magnus','mark','martin','mathieu','matthew','mattias',
    'max','michael','miguel','mikael','mike','mo','nathan',
    'neil','nicolas','nigel','noel','oliver','omar','oscar',
    'otto','paul','pedro','peter','philip','pierre','quentin',
    'rafael','rajeev','reed','remi','richard','robert','robin',
    'rodrigo','rolf','ryan','samuel','scott','sean','sebastian',
    'sergio','simon','stefan','stephen','steve','thomas',
    'tim','tobias','tom','tyler','victor','vincent','vlad',
    'wayne','william','xavier','yan','yannick','yusuf',
  ])

  if (firstName && FEMALE.has(firstName)) return 'female'
  if (firstName && MALE.has(firstName))   return 'male'
  return 'unknown'
}

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
      gender:   guessBrowserGender(v.name),
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
