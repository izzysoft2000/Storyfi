/**
 * tts/minimax.js
 * MiniMax Audio T2A v2 TTS provider.
 *
 * CORS note: MiniMax blocks the GroupId header on voice_list from browsers.
 * We use the full static voice catalogue instead (updated April 2026).
 * GroupId is sent as a query param on T2A requests to avoid the header CORS issue.
 */

import { withRetry } from './provider.js'

const BASE_URL = 'https://api.minimax.io/v1'

// Full MiniMax system voice catalogue — source: platform.minimax.io/docs/faq/system-voice-id
const MINIMAX_VOICES = [
  // ── English (45 voices) ─────────────────────────────────────────────────────
  { id: 'English_expressive_narrator',    name: 'Expressive Narrator',    gender: 'male',   language: 'en' },
  { id: 'English_radiant_girl',           name: 'Radiant Girl',           gender: 'female', language: 'en' },
  { id: 'English_magnetic_voiced_man',    name: 'Magnetic-voiced Male',   gender: 'male',   language: 'en' },
  { id: 'English_compelling_lady1',       name: 'Compelling Lady',        gender: 'female', language: 'en' },
  { id: 'English_Aussie_Bloke',           name: 'Aussie Bloke',           gender: 'male',   language: 'en' },
  { id: 'English_captivating_female1',    name: 'Captivating Female',     gender: 'female', language: 'en' },
  { id: 'English_Upbeat_Woman',           name: 'Upbeat Woman',           gender: 'female', language: 'en' },
  { id: 'English_Trustworth_Man',         name: 'Trustworthy Man',        gender: 'male',   language: 'en' },
  { id: 'English_CalmWoman',              name: 'Calm Woman',             gender: 'female', language: 'en' },
  { id: 'English_UpsetGirl',              name: 'Upset Girl',             gender: 'female', language: 'en' },
  { id: 'English_Gentle-voiced_man',      name: 'Gentle-voiced Man',      gender: 'male',   language: 'en' },
  { id: 'English_Whispering_girl',        name: 'Whispering Girl',        gender: 'female', language: 'en' },
  { id: 'English_Diligent_Man',           name: 'Diligent Man',           gender: 'male',   language: 'en' },
  { id: 'English_Graceful_Lady',          name: 'Graceful Lady',          gender: 'female', language: 'en' },
  { id: 'English_ReservedYoungMan',       name: 'Reserved Young Man',     gender: 'male',   language: 'en' },
  { id: 'English_PlayfulGirl',            name: 'Playful Girl',           gender: 'female', language: 'en' },
  { id: 'English_ManWithDeepVoice',       name: 'Man With Deep Voice',    gender: 'male',   language: 'en' },
  { id: 'English_MaturePartner',          name: 'Mature Partner',         gender: 'male',   language: 'en' },
  { id: 'English_FriendlyPerson',         name: 'Friendly Guy',           gender: 'male',   language: 'en' },
  { id: 'English_MatureBoss',             name: 'Bossy Lady',             gender: 'female', language: 'en' },
  { id: 'English_Debator',                name: 'Male Debater',           gender: 'male',   language: 'en' },
  { id: 'English_LovelyGirl',             name: 'Lovely Girl',            gender: 'female', language: 'en' },
  { id: 'English_Steadymentor',           name: 'Reliable Man',           gender: 'male',   language: 'en' },
  { id: 'English_Deep-VoicedGentleman',   name: 'Deep-voiced Gentleman',  gender: 'male',   language: 'en' },
  { id: 'English_Wiselady',               name: 'Wise Lady',              gender: 'female', language: 'en' },
  { id: 'English_CaptivatingStoryteller', name: 'Captivating Storyteller',gender: 'female', language: 'en' },
  { id: 'English_DecentYoungMan',         name: 'Decent Young Man',       gender: 'male',   language: 'en' },
  { id: 'English_SentimentalLady',        name: 'Sentimental Lady',       gender: 'female', language: 'en' },
  { id: 'English_ImposingManner',         name: 'Imposing Queen',         gender: 'female', language: 'en' },
  { id: 'English_SadTeen',                name: 'Teen Boy',               gender: 'male',   language: 'en' },
  { id: 'English_PassionateWarrior',      name: 'Passionate Warrior',     gender: 'male',   language: 'en' },
  { id: 'English_WiseScholar',            name: 'Wise Scholar',           gender: 'male',   language: 'en' },
  { id: 'English_Soft-spokenGirl',        name: 'Soft-Spoken Girl',       gender: 'female', language: 'en' },
  { id: 'English_SereneWoman',            name: 'Serene Woman',           gender: 'female', language: 'en' },
  { id: 'English_ConfidentWoman',         name: 'Confident Woman',        gender: 'female', language: 'en' },
  { id: 'English_PatientMan',             name: 'Patient Man',            gender: 'male',   language: 'en' },
  { id: 'English_Comedian',               name: 'Comedian',               gender: 'male',   language: 'en' },
  { id: 'English_BossyLeader',            name: 'Bossy Leader',           gender: 'male',   language: 'en' },
  { id: 'English_Strong-WilledBoy',       name: 'Strong-Willed Boy',      gender: 'male',   language: 'en' },
  { id: 'English_StressedLady',           name: 'Stressed Lady',          gender: 'female', language: 'en' },
  { id: 'English_AssertiveQueen',         name: 'Assertive Queen',        gender: 'female', language: 'en' },
  { id: 'English_AnimeCharacter',         name: 'Female Narrator',        gender: 'female', language: 'en' },
  { id: 'English_Jovialman',              name: 'Jovial Man',             gender: 'male',   language: 'en' },
  { id: 'English_WhimsicalGirl',          name: 'Whimsical Girl',         gender: 'female', language: 'en' },
  { id: 'English_Kind-heartedGirl',       name: 'Kind-Hearted Girl',      gender: 'female', language: 'en' },
  // ── French ─────────────────────────────────────────────────────────────────
  { id: 'French_Male_Speech_New',         name: 'Level-Headed Man',         gender: 'male',   language: 'fr' },
  { id: 'French_Female_News Anchor',      name: 'Patient Female Presenter', gender: 'female', language: 'fr' },
  { id: 'French_CasualMan',               name: 'Casual Man',               gender: 'male',   language: 'fr' },
  { id: 'French_MovieLeadFemale',         name: 'Movie Lead Female',        gender: 'female', language: 'fr' },
  { id: 'French_FemaleAnchor',            name: 'Female Anchor',            gender: 'female', language: 'fr' },
  { id: 'French_MaleNarrator',            name: 'Male Narrator',            gender: 'male',   language: 'fr' },
  // ── Spanish ─────────────────────────────────────────────────────────────────
  { id: 'Spanish_SereneWoman',            name: 'Serene Woman',           gender: 'female', language: 'es' },
  { id: 'Spanish_MaturePartner',          name: 'Mature Partner',         gender: 'male',   language: 'es' },
  { id: 'Spanish_CaptivatingStoryteller', name: 'Captivating Storyteller',gender: 'female', language: 'es' },
  { id: 'Spanish_Narrator',               name: 'Narrator',               gender: 'male',   language: 'es' },
  { id: 'Spanish_WiseScholar',            name: 'Wise Scholar',           gender: 'male',   language: 'es' },
  { id: 'Spanish_Kind-heartedGirl',       name: 'Kind-hearted Girl',      gender: 'female', language: 'es' },
  { id: 'Spanish_ConfidentWoman',         name: 'Confident Woman',        gender: 'female', language: 'es' },
  { id: 'Spanish_BossyLeader',            name: 'Bossy Leader',           gender: 'male',   language: 'es' },
  { id: 'Spanish_ReservedYoungMan',       name: 'Reserved Young Man',     gender: 'male',   language: 'es' },
  { id: 'Spanish_ThoughtfulMan',          name: 'Thoughtful Man',         gender: 'male',   language: 'es' },
  { id: 'Spanish_SophisticatedLady',      name: 'Sophisticated Lady',     gender: 'female', language: 'es' },
  { id: 'Spanish_Comedian',               name: 'Comedian',               gender: 'male',   language: 'es' },
  { id: 'Spanish_Debator',                name: 'Debater',                gender: 'male',   language: 'es' },
  { id: 'Spanish_AssertiveQueen',         name: 'Assertive Queen',        gender: 'female', language: 'es' },
  { id: 'Spanish_Wiselady',               name: 'Wise Lady',              gender: 'female', language: 'es' },
  // ── German ──────────────────────────────────────────────────────────────────
  { id: 'German_FriendlyMan',             name: 'Friendly Man',           gender: 'male',   language: 'de' },
  { id: 'German_SweetLady',               name: 'Sweet Lady',             gender: 'female', language: 'de' },
  { id: 'German_PlayfulMan',              name: 'Playful Man',            gender: 'male',   language: 'de' },
  // ── Italian ─────────────────────────────────────────────────────────────────
  { id: 'Italian_BraveHeroine',           name: 'Brave Heroine',          gender: 'female', language: 'it' },
  { id: 'Italian_Narrator',               name: 'Narrator',               gender: 'male',   language: 'it' },
  { id: 'Italian_WanderingSorcerer',      name: 'Wandering Sorcerer',     gender: 'male',   language: 'it' },
  { id: 'Italian_DiligentLeader',         name: 'Diligent Leader',        gender: 'male',   language: 'it' },
  // ── Russian ─────────────────────────────────────────────────────────────────
  { id: 'Russian_HandsomeChildhoodFriend',name: 'Handsome Childhood Friend', gender: 'male',   language: 'ru' },
  { id: 'Russian_BrightHeroine',          name: 'Bright Queen',           gender: 'female', language: 'ru' },
  { id: 'Russian_AmbitiousWoman',         name: 'Ambitious Woman',        gender: 'female', language: 'ru' },
  { id: 'Russian_ReliableMan',            name: 'Reliable Man',           gender: 'male',   language: 'ru' },
  { id: 'Russian_CrazyQueen',             name: 'Crazy Girl',             gender: 'female', language: 'ru' },
  { id: 'Russian_AttractiveGuy',          name: 'Attractive Guy',         gender: 'male',   language: 'ru' },
  // ── Japanese ────────────────────────────────────────────────────────────────
  { id: 'Japanese_IntellectualSenior',    name: 'Intellectual Senior',    gender: 'male',   language: 'ja' },
  { id: 'Japanese_DecisivePrincess',      name: 'Decisive Princess',      gender: 'female', language: 'ja' },
  { id: 'Japanese_LoyalKnight',           name: 'Loyal Knight',           gender: 'male',   language: 'ja' },
  { id: 'Japanese_DominantMan',           name: 'Dominant Man',           gender: 'male',   language: 'ja' },
  { id: 'Japanese_ColdQueen',             name: 'Cold Queen',             gender: 'female', language: 'ja' },
  { id: 'Japanese_DependableWoman',       name: 'Dependable Woman',       gender: 'female', language: 'ja' },
  { id: 'Japanese_GentleButler',          name: 'Gentle Butler',          gender: 'male',   language: 'ja' },
  { id: 'Japanese_KindLady',              name: 'Kind Lady',              gender: 'female', language: 'ja' },
  { id: 'Japanese_CalmLady',              name: 'Calm Lady',              gender: 'female', language: 'ja' },
  { id: 'Japanese_OptimisticYouth',       name: 'Optimistic Youth',       gender: 'male',   language: 'ja' },
  { id: 'Japanese_SportyStudent',         name: 'Sporty Student',         gender: 'male',   language: 'ja' },
  { id: 'Japanese_GracefulMaiden',        name: 'Graceful Maiden',        gender: 'female', language: 'ja' },
  // ── Korean ──────────────────────────────────────────────────────────────────
  { id: 'Korean_CalmGentleman',           name: 'Calm Gentleman',         gender: 'male',   language: 'ko' },
  { id: 'Korean_CalmLady',                name: 'Calm Lady',              gender: 'female', language: 'ko' },
  { id: 'Korean_IntellectualMan',         name: 'Intellectual Man',       gender: 'male',   language: 'ko' },
  { id: 'Korean_MatureLady',              name: 'Mature Lady',            gender: 'female', language: 'ko' },
  { id: 'Korean_WiseTeacher',             name: 'Wise Teacher',           gender: 'male',   language: 'ko' },
  { id: 'Korean_SweetGirl',               name: 'Sweet Girl',             gender: 'female', language: 'ko' },
  { id: 'Korean_CheerfulBoyfriend',       name: 'Cheerful Boyfriend',     gender: 'male',   language: 'ko' },
  { id: 'Korean_DecisiveQueen',           name: 'Decisive Queen',         gender: 'female', language: 'ko' },
  { id: 'Korean_BraveAdventurer',         name: 'Brave Adventurer',       gender: 'male',   language: 'ko' },
  // ── Portuguese ──────────────────────────────────────────────────────────────
  { id: 'Portuguese_CaptivatingStoryteller', name: 'Captivating Storyteller', gender: 'female', language: 'pt' },
  { id: 'Portuguese_Narrator',            name: 'Narrator',               gender: 'male',   language: 'pt' },
  { id: 'Portuguese_ConfidentWoman',      name: 'Confident Woman',        gender: 'female', language: 'pt' },
  { id: 'Portuguese_Deep-VoicedGentleman',name: 'Deep-voiced Gentleman',  gender: 'male',   language: 'pt' },
  { id: 'Portuguese_BossyLeader',         name: 'Bossy Leader',           gender: 'male',   language: 'pt' },
  { id: 'Portuguese_SentimentalLady',     name: 'Sentimental Lady',       gender: 'female', language: 'pt' },
  { id: 'Portuguese_Wiselady',            name: 'Wise Lady',              gender: 'female', language: 'pt' },
  // ── Chinese Mandarin ─────────────────────────────────────────────────────────
  { id: 'Chinese (Mandarin)_Reliable_Executive',      name: 'Reliable Executive',  gender: 'male',   language: 'zh' },
  { id: 'Chinese (Mandarin)_News_Anchor',              name: 'News Anchor',          gender: 'male',   language: 'zh' },
  { id: 'Chinese (Mandarin)_Unrestrained_Young_Man',  name: 'Unrestrained Young Man', gender: 'male', language: 'zh' },
  { id: 'Chinese (Mandarin)_Mature_Woman',             name: 'Mature Woman',         gender: 'female', language: 'zh' },
  { id: 'Chinese (Mandarin)_Sweet_Lady',               name: 'Sweet Lady',           gender: 'female', language: 'zh' },
  { id: 'Chinese (Mandarin)_Warm_Bestie',              name: 'Warm Bestie',          gender: 'female', language: 'zh' },
  { id: 'Chinese (Mandarin)_Gentleman',                name: 'Gentleman',            gender: 'male',   language: 'zh' },
  { id: 'Chinese (Mandarin)_Radio_Host',               name: 'Radio Host',           gender: 'male',   language: 'zh' },
  // ── Cantonese ────────────────────────────────────────────────────────────────
  { id: 'Cantonese_ProfessionalHost (F)', name: 'Professional Female Host', gender: 'female', language: 'yue' },
  { id: 'Cantonese_GentleLady',           name: 'Gentle Lady',              gender: 'female', language: 'yue' },
  { id: 'Cantonese_ProfessionalHost (M)', name: 'Professional Male Host',   gender: 'male',   language: 'yue' },
  { id: 'Cantonese_PlayfulMan',           name: 'Playful Man',              gender: 'male',   language: 'yue' },
  { id: 'Cantonese_CuteGirl',             name: 'Cute Girl',                gender: 'female', language: 'yue' },
  // ── Indonesian ───────────────────────────────────────────────────────────────
  { id: 'Indonesian_SweetGirl',           name: 'Sweet Girl',             gender: 'female', language: 'id' },
  { id: 'Indonesian_ReservedYoungMan',    name: 'Reserved Young Man',     gender: 'male',   language: 'id' },
  { id: 'Indonesian_CharmingGirl',        name: 'Charming Girl',          gender: 'female', language: 'id' },
  { id: 'Indonesian_ConfidentWoman',      name: 'Confident Woman',        gender: 'female', language: 'id' },
  { id: 'Indonesian_BossyLeader',         name: 'Bossy Leader',           gender: 'male',   language: 'id' },
  // ── Hindi ────────────────────────────────────────────────────────────────────
  { id: 'hindi_male_1_v2',                name: 'Trustworthy Advisor',    gender: 'male',   language: 'hi' },
  { id: 'hindi_female_2_v1',              name: 'Tranquil Woman',         gender: 'female', language: 'hi' },
  { id: 'hindi_female_1_v2',              name: 'News Anchor',            gender: 'female', language: 'hi' },
  // ── Arabic ───────────────────────────────────────────────────────────────────
  { id: 'Arabic_CalmWoman',               name: 'Calm Woman',             gender: 'female', language: 'ar' },
  { id: 'Arabic_FriendlyGuy',             name: 'Friendly Guy',           gender: 'male',   language: 'ar' },
  // ── Turkish ──────────────────────────────────────────────────────────────────
  { id: 'Turkish_CalmWoman',              name: 'Calm Woman',             gender: 'female', language: 'tr' },
  { id: 'Turkish_Trustworthyman',         name: 'Trustworthy Man',        gender: 'male',   language: 'tr' },
  // ── Dutch ────────────────────────────────────────────────────────────────────
  { id: 'Dutch_kindhearted_girl',         name: 'Kind-hearted Girl',      gender: 'female', language: 'nl' },
  { id: 'Dutch_bossy_leader',             name: 'Bossy Leader',           gender: 'male',   language: 'nl' },
  // ── Polish ───────────────────────────────────────────────────────────────────
  { id: 'Polish_male_1_sample4',          name: 'Male Narrator',          gender: 'male',   language: 'pl' },
  { id: 'Polish_female_1_sample1',        name: 'Calm Woman',             gender: 'female', language: 'pl' },
  // ── Ukrainian ────────────────────────────────────────────────────────────────
  { id: 'Ukrainian_CalmWoman',            name: 'Calm Woman',             gender: 'female', language: 'uk' },
  { id: 'Ukrainian_WiseScholar',          name: 'Wise Scholar',           gender: 'male',   language: 'uk' },
]

/**
 * MiniMax T2A v2 returns audio as a hex-encoded string, NOT base64.
 * e.g. "fffb9064..." where each pair of hex chars = one byte.
 */
function hexToBlob(hexString, mimeType = 'audio/mpeg') {
  // Strip any whitespace just in case
  const hex   = hexString.replace(/\s/g, '')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return new Blob([bytes], { type: mimeType })
}

/**
 * Fallback: try base64 decode (for providers/endpoints that do use base64).
 */
function base64ToBlob(base64, mimeType = 'audio/mpeg') {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/**
 * Auto-detect encoding: if the string looks like pure hex (0-9, a-f only)
 * and has an even length, treat it as hex. Otherwise try base64.
 */
function audioDataToBlob(data, mimeType = 'audio/mpeg') {
  const trimmed = data.trim()
  const isHex   = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0
  return isHex ? hexToBlob(trimmed, mimeType) : base64ToBlob(trimmed, mimeType)
}

export const minimaxProvider = {
  id:   'minimax',
  name: 'MiniMax Audio',

  capabilities: {
    wordTimestamps:     true,
    sentenceTimestamps: false,
    emotions:           true,
    streaming:          false,
  },

  async voices() {
    return MINIMAX_VOICES
  },

  async generate({ text, voiceId, apiKey, groupId, settings }) {
  const payload = {
    model: settings?.model || 'speech-2.6-hd',
    text,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed:    parseFloat(settings?.speed)  || 1.0,
      vol:      parseFloat(settings?.volume) || 1.0,
      pitch:    parseInt(settings?.pitch)    || 0,
      ...(settings?.emotion ? { emotion: settings.emotion } : {}),
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate:     128000,
      format:      'mp3',
      channel:     1,
    },
  }

  const url = groupId
    ? `https://api.minimax.io/v1/t2a_v2?GroupId=${groupId}`
    : `https://api.minimax.io/v1/t2a_v2`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg || 'MiniMax generation failed')
  }

  // MiniMax T2A v2 returns audio as a hex string (Bug Fix #2)
  const audioBlob = hexToBlob(data.data.audio)

  // Word-level timings for playback highlight sync
  const wordTimings = data.data.extra_info?.word_info?.map(w => ({
    word:     w.text,
    start_ms: w.start_ms,
    end_ms:   w.end_ms,
  })) ?? null

  return { blob: audioBlob, wordTimings }
},
}
