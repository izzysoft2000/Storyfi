/**
 * storage/quota.js
 * Wrapper around the StorageManager API.
 * Provides quota info and persistent storage requests.
 */

/**
 * Returns current storage quota and usage for this origin.
 * Returns null if StorageManager is not supported.
 */
export async function getQuotaInfo() {
  if (!navigator.storage?.estimate) return null

  const { quota, usage, usageDetails } = await navigator.storage.estimate()
  return {
    quotaBytes:     quota,
    usedBytes:      usage,
    availableBytes: quota - usage,
    usedPercent:    usage / quota,            // 0.0 – 1.0
    indexedDBBytes: usageDetails?.indexedDB ?? null,
  }
}

/**
 * Requests persistent storage so the browser won't evict
 * IndexedDB data under storage pressure (critical for Safari).
 * Returns true if granted, false if denied or unsupported.
 */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false
  return await navigator.storage.persist()
}

/**
 * Checks whether storage is already marked persistent.
 */
export async function isPersistent() {
  if (!navigator.storage?.persisted) return false
  return await navigator.storage.persisted()
}

/**
 * Returns a human-readable string for a byte count.
 * e.g. 1_200_000 → "1.2 MB"
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/**
 * Quota warning thresholds.
 * Returns 'ok' | 'warning' | 'critical'
 */
export function quotaLevel(usedPercent) {
  if (usedPercent >= 0.95) return 'critical'
  if (usedPercent >= 0.80) return 'warning'
  return 'ok'
}
