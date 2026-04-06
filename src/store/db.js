/**
 * store/db.js
 * Opens and manages the Storyfi IndexedDB database.
 * Uses the `idb` library for a clean promise-based API.
 *
 * Schema (v1):
 *   projects        — keyPath: "id"
 *   sentences       — keyPath: "id", index: "paragraphGroupId"
 *   audio_sentences — keyPath: "sentenceId"   (MP3 Blobs — raw sentences)
 *   audio_stitched  — keyPath: "groupId"      (MP3 Blobs — stitched paragraphs)
 *   api_keys        — keyPath: "providerId"
 *   settings        — keyPath: "key"
 */

import { openDB } from 'idb'

const DB_NAME    = 'storyfi_db'
const DB_VERSION = 1

let _db = null

export async function getDB() {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('sentences')) {
        const s = db.createObjectStore('sentences', { keyPath: 'id' })
        s.createIndex('paragraphGroupId', 'paragraphGroupId', { unique: false })
      }
      if (!db.objectStoreNames.contains('audio_sentences')) {
        db.createObjectStore('audio_sentences', { keyPath: 'sentenceId' })
      }
      if (!db.objectStoreNames.contains('audio_stitched')) {
        db.createObjectStore('audio_stitched', { keyPath: 'groupId' })
      }
      if (!db.objectStoreNames.contains('api_keys')) {
        db.createObjectStore('api_keys', { keyPath: 'providerId' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    }
  })
  return _db
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function getAllProjects() {
  const db = await getDB()
  return db.getAll('projects')
}

export async function getProject(id) {
  const db = await getDB()
  return db.get('projects', id)
}

export async function saveProject(project) {
  const db = await getDB()

  // Strip Vue reactivity Proxy wrappers — IDB structured clone can't handle them.
  // We round-trip through JSON for all serializable data, then re-attach the
  // FileSystemDirectoryHandle separately (it IS cloneable but NOT JSON-serializable).
  const { outputFolderHandle, ...serializable } = project

  let plain
  try {
    plain = JSON.parse(JSON.stringify(serializable))
  } catch (e) {
    console.error('[db] saveProject JSON serialization failed:', e)
    plain = { ...serializable }
  }

  await db.put('projects', {
    ...plain,
    outputFolderHandle: outputFolderHandle ?? null,
    updatedAt: Date.now(),
  })
}

export async function deleteProject(id) {
  const db = await getDB()
  // Delete project record
  await db.delete('projects', id)
  // Delete all sentence records for this project's groups
  const sentences = await db.getAllFromIndex('sentences', 'paragraphGroupId')
  // We'll clean by iterating — in practice groups store sentenceIds
  // so we handle cleanup via the project's paragraphGroups list
}

/**
 * Fully delete a project and all its associated data.
 */
export async function deleteProjectFull(project) {
  const db = await getDB()
  const tx = db.transaction(
    ['projects', 'sentences', 'audio_sentences', 'audio_stitched'],
    'readwrite'
  )

  // Collect all sentence IDs from all paragraph groups
  const sentenceIds = (project.paragraphGroups ?? [])
    .flatMap(g => g.sentenceIds ?? [])

  const groupIds = (project.paragraphGroups ?? []).map(g => g.id)

  // Delete sentences
  for (const sid of sentenceIds) {
    await tx.objectStore('sentences').delete(sid)
    await tx.objectStore('audio_sentences').delete(sid)
  }

  // Delete stitched blobs
  for (const gid of groupIds) {
    await tx.objectStore('audio_stitched').delete(gid)
  }

  // Delete project record
  await tx.objectStore('projects').delete(project.id)
  await tx.done
}

/**
 * Clear all audio blobs for a project without deleting
 * the project, sentences, tags, or timing metadata.
 * Resets all sentence statuses to "pending".
 */
export async function clearProjectAudio(project) {
  const db = await getDB()

  const sentenceIds = (project.paragraphGroups ?? [])
    .flatMap(g => g.sentenceIds ?? [])
  const groupIds = (project.paragraphGroups ?? []).map(g => g.id)

  const tx = db.transaction(
    ['sentences', 'audio_sentences', 'audio_stitched', 'projects'],
    'readwrite'
  )

  // Clear sentence blobs
  for (const sid of sentenceIds) {
    await tx.objectStore('audio_sentences').delete(sid)
    // Reset sentence status
    const sentence = await tx.objectStore('sentences').get(sid)
    if (sentence) {
      await tx.objectStore('sentences').put({
        ...sentence,
        status: 'pending',
        audioKey: null,
        durationMs: null,
        startMs: null,
        endMs: null,
        wordTimings: null,
      })
    }
  }

  // Clear stitched blobs and reset group status
  const updatedGroups = (project.paragraphGroups ?? []).map(g => ({
    ...g,
    stitchStatus: 'pending',
    stitchedAudioKey: null,
    stitchedDiskFilename: null,
    totalDurationMs: null,
    startMs: null,
    endMs: null,
  }))

  for (const gid of groupIds) {
    await tx.objectStore('audio_stitched').delete(gid)
  }

  const updatedProject = {
    ...project,
    paragraphGroups: updatedGroups,
    audioSizeBytes: 0,
    updatedAt: Date.now(),
  }
  await tx.objectStore('projects').put(updatedProject)
  await tx.done

  return updatedProject
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key) {
  const db = await getDB()
  const row = await db.get('settings', key)
  return row?.value ?? null
}

export async function setSetting(key, value) {
  const db = await getDB()
  await db.put('settings', { key, value })
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export async function getApiKey(providerId) {
  const db = await getDB()
  return db.get('api_keys', providerId)
}

export async function saveApiKey(record) {
  const db = await getDB()
  await db.put('api_keys', record)
}

export async function deleteApiKey(providerId) {
  const db = await getDB()
  await db.delete('api_keys', providerId)
}

// ─── Audio Blobs ──────────────────────────────────────────────────────────────

export async function saveAudioSentence(sentenceId, blob) {
  const db = await getDB()
  await db.put('audio_sentences', { sentenceId, blob })
}

export async function getAudioSentence(sentenceId) {
  const db = await getDB()
  const row = await db.get('audio_sentences', sentenceId)
  return row?.blob ?? null
}

export async function saveAudioStitched(groupId, blob) {
  const db = await getDB()
  await db.put('audio_stitched', { groupId, blob })
}

export async function getAudioStitched(groupId) {
  const db = await getDB()
  const row = await db.get('audio_stitched', groupId)
  return row?.blob ?? null
}

export async function hasAudioStitched(groupId) {
  const db = await getDB()
  const count = await db.count('audio_stitched', groupId)
  return count > 0
}
