/**
 * storage/crypto.js
 * Client-side API key encryption using the Web Crypto API.
 * PBKDF2 key derivation + AES-GCM symmetric encryption.
 * No third-party libraries required.
 *
 * Encryption is optional — keys can be stored plaintext on trusted devices.
 * See §6.8 of CLAUDE.md for full architecture notes.
 */

// ─── Key Derivation ────────────────────────────────────────────────────────────

/**
 * Derive a CryptoKey from a user password + random salt.
 * 250,000 PBKDF2 iterations makes brute-forcing expensive.
 */
async function deriveKey(password, salt) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// ─── Encrypt ──────────────────────────────────────────────────────────────────

/**
 * Encrypt an API key string with a user password.
 * Returns an EncryptedKeyRecord (without providerId — caller adds that).
 */
export async function encryptApiKey(apiKey, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const key  = await deriveKey(password, salt)
  const enc  = new TextEncoder()

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(apiKey)
  )

  const toBase64 = buf =>
    btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)))

  return {
    isEncrypted: true,
    encrypted:   toBase64(ciphertext),
    salt:        toBase64(salt),
    iv:          toBase64(iv),
    savedAt:     Date.now(),
  }
}

// ─── Decrypt ──────────────────────────────────────────────────────────────────

/**
 * Decrypt an EncryptedKeyRecord with the user's password.
 * Throws DOMException if the password is wrong (AES-GCM auth tag fails).
 */
export async function decryptApiKey(record, password) {
  const fromBase64 = b64 =>
    Uint8Array.from(atob(b64), c => c.charCodeAt(0))

  const salt       = fromBase64(record.salt)
  const iv         = fromBase64(record.iv)
  const ciphertext = fromBase64(record.encrypted)
  const key        = await deriveKey(password, salt)

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return new TextDecoder().decode(plain)
}

// ─── In-memory plaintext key cache ────────────────────────────────────────────
// Cleared on tab close via beforeunload. Never written back to storage.

const _keyCache = {} // { [providerId]: string }

export function cacheDecryptedKey(providerId, plaintextKey) {
  _keyCache[providerId] = plaintextKey
}

export function getCachedKey(providerId) {
  return _keyCache[providerId] ?? null
}

export function clearCachedKeys() {
  for (const k in _keyCache) delete _keyCache[k]
}

// Clear on tab/window close
window.addEventListener('beforeunload', clearCachedKeys)

// ─── Resolve key for generation ───────────────────────────────────────────────

import { getApiKey } from '@/store/db.js'

/**
 * Returns the plaintext API key for a provider.
 * Checks in-memory cache first, then reads from IndexedDB.
 * If encrypted, throws — caller must prompt for password first.
 */
export async function resolveApiKey(providerId) {
  // 1. Check in-memory cache
  const cached = getCachedKey(providerId)
  if (cached) return cached

  // 2. Read from IndexedDB
  const record = await getApiKey(providerId)
  if (!record) throw new Error(`No API key saved for provider "${providerId}"`)

  if (record.isEncrypted) {
    throw new Error('API_KEY_LOCKED') // caller should show password prompt
  }

  // Plaintext — cache and return
  const key = record.encrypted // stored as plaintext in the `encrypted` field
  cacheDecryptedKey(providerId, key)
  return key
}
