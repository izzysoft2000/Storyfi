/**
 * storage/filesystem.js
 * File System Access API wrapper.
 * Handles folder picking, permission management, and file writes.
 */

/**
 * Returns true if the File System Access API is available in this browser.
 */
export const hasFileSystemAccess = () =>
  'showDirectoryPicker' in window && window.isSecureContext

/**
 * Opens the directory picker and returns a FileSystemDirectoryHandle.
 * Returns null if the user cancels.
 */
export async function pickOutputFolder() {
  if (!hasFileSystemAccess()) return null
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (err) {
    // User cancelled (AbortError) — not an error
    if (err.name === 'AbortError') return null
    throw err
  }
}

/**
 * Requests read-write permission on a stored FileSystemDirectoryHandle.
 * Returns 'granted' | 'denied' | 'prompt'
 */
export async function requestFolderPermission(handle) {
  if (!handle) return 'denied'
  try {
    return await handle.requestPermission({ mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

/**
 * Queries current permission state without prompting.
 * Returns 'granted' | 'denied' | 'prompt'
 */
export async function queryFolderPermission(handle) {
  if (!handle) return 'denied'
  try {
    return await handle.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

/**
 * Writes a Blob to a file inside a directory handle.
 * Creates the file if it doesn't exist; overwrites if it does.
 * Returns true on success, false on failure.
 */
export async function writeFileToFolder(dirHandle, filename, blob) {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
    const writable   = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch (err) {
    console.error(`[filesystem] Failed to write ${filename}:`, err)
    return false
  }
}

/**
 * Reads a file from a directory handle back as a Blob.
 * Returns null if the file doesn't exist.
 */
export async function readFileFromFolder(dirHandle, filename) {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename)
    return await fileHandle.getFile()
  } catch {
    return null
  }
}

/**
 * Checks whether a file exists in a directory handle.
 */
export async function fileExistsInFolder(dirHandle, filename) {
  try {
    await dirHandle.getFileHandle(filename)
    return true
  } catch {
    return false
  }
}

/**
 * Sanitise a role label into a safe filename fragment.
 * e.g. "The King!" → "the-king"
 */
export function sanitizeLabel(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Build the disk filename for a stitched paragraph MP3.
 * e.g. order=3, role="Narrator", paragraphIndex=2 → "003_narrator_p2.mp3"
 */
export function buildDiskFilename(order, roleLabel, paragraphIndex) {
  const n   = String(order).padStart(3, '0')
  const lbl = sanitizeLabel(roleLabel)
  return `${n}_${lbl}_p${paragraphIndex}.mp3`
}
