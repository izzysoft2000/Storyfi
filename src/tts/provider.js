/**
 * tts/provider.js
 * TTS provider registry, in-memory voice cache, and concurrency limiter.
 *
 * All providers implement:
 *   { id, name, capabilities, voices(), generate(params) }
 *
 * See §9.1 of CLAUDE.md for the full interface spec.
 */

// ─── Provider Registry ─────────────────────────────────────────────────────────

const _providers = {}

export function registerProvider(provider) {
  _providers[provider.id] = provider
}

export function getProvider(id) {
  return _providers[id] ?? null
}

export function getAllProviders() {
  return Object.values(_providers)
}

// ─── Voice Cache (session-scoped, cleared on tab close) ───────────────────────

const _voiceCache = {} // { [providerId]: Voice[] }

export async function getVoices(providerId) {
  const provider = getProvider(providerId)
  if (!provider) throw new Error(`Unknown provider: ${providerId}`)

  if (_voiceCache[providerId]) return _voiceCache[providerId]

  const voices = await provider.voices()
  _voiceCache[providerId] = voices
  return voices
}

export function clearVoiceCache(providerId) {
  if (providerId) delete _voiceCache[providerId]
  else for (const k in _voiceCache) delete _voiceCache[k]
}

// ─── Concurrency Limiter ───────────────────────────────────────────────────────

/**
 * Run an array of async task functions with a max concurrency limit.
 * Each task is () => Promise<T>.
 * Returns results in order (matching tasks array).
 *
 * @param {Array<() => Promise>} tasks
 * @param {number}               limit   default 2
 * @returns {Promise<any[]>}
 */
export async function withConcurrency(tasks, limit = 2) {
  const results = new Array(tasks.length)
  const executing = new Set()

  for (let i = 0; i < tasks.length; i++) {
    const idx  = i
    const task = tasks[i]

    const p = Promise.resolve().then(() => task()).then(
      val  => { results[idx] = { ok: true,  value: val  } },
      err  => { results[idx] = { ok: false, error: err  } }
    )

    executing.add(p)
    p.finally(() => executing.delete(p))

    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

// ─── Exponential Backoff Retry ─────────────────────────────────────────────────

/**
 * Call an async fn, retrying on 429 / network errors with exponential backoff.
 *
 * @param {() => Promise<T>} fn
 * @param {number}           maxRetries   default 3
 * @returns {Promise<T>}
 */
export async function withRetry(fn, maxRetries = 3) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const is429 = err?.status === 429 || err?.message?.includes('429')
      if (!is429 || attempt === maxRetries) throw err
      const delayMs = 1000 * Math.pow(2, attempt) // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastError
}
