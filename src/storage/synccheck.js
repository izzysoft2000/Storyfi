/**
 * storage/synccheck.js
 * Sync-on-open divergence detection (Q10 / §6.9 of CLAUDE.md).
 *
 * Runs when a project is opened. Compares:
 *   - IndexedDB "audio_stitched" blobs
 *   - Disk files in the project's output folder (if linked)
 *
 * Returns a SyncReport describing any divergences found.
 */

import { hasAudioStitched } from '@/store/db.js'
import {
  requestFolderPermission,
  fileExistsInFolder,
} from '@/storage/filesystem.js'

/**
 * @typedef {'ok'|'missing_from_disk'|'missing_from_idb'|'missing_both'} DivergenceType
 *
 * @typedef {{ groupId: string, diskFilename: string, type: DivergenceType }} Divergence
 *
 * @typedef {{ hasDivergences: boolean, divergences: Divergence[],
 *             folderPermission: 'granted'|'denied'|'none' }} SyncReport
 */

/**
 * Check all "ready" paragraph groups for storage divergences.
 *
 * @param {import('@/store/project.js').Project} project
 * @returns {Promise<SyncReport>}
 */
export async function syncCheckOnOpen(project) {
  const groups = (project.paragraphGroups ?? [])
    .filter(g => g.stitchStatus === 'ready' && !g.livePlayback)

  if (groups.length === 0) {
    return { hasDivergences: false, divergences: [], folderPermission: 'none' }
  }

  // Check folder permission if a folder is linked
  let folderPermission = 'none'
  let folderHandle     = project.outputFolderHandle ?? null

  if (folderHandle) {
    folderPermission = await requestFolderPermission(folderHandle)
    if (folderPermission !== 'granted') {
      // Can't check disk — treat as folder unavailable, not a hard divergence
      folderHandle = null
    }
  }

  const divergences = []

  for (const group of groups) {
    const hasIDB  = await hasAudioStitched(group.id)
    let   hasDisk = true // assume ok if no folder linked

    if (folderHandle && group.stitchedDiskFilename) {
      hasDisk = await fileExistsInFolder(folderHandle, group.stitchedDiskFilename)
    } else if (folderHandle && !group.stitchedDiskFilename) {
      // Group was generated before folder was linked — not a divergence
      hasDisk = true
    }

    if (!hasIDB && !hasDisk) {
      divergences.push({ groupId: group.id, diskFilename: group.stitchedDiskFilename, type: 'missing_both' })
    } else if (!hasIDB && hasDisk) {
      divergences.push({ groupId: group.id, diskFilename: group.stitchedDiskFilename, type: 'missing_from_idb' })
    } else if (hasIDB && folderHandle && !hasDisk) {
      divergences.push({ groupId: group.id, diskFilename: group.stitchedDiskFilename, type: 'missing_from_disk' })
    }
    // hasIDB && hasDisk → 'ok', no action
  }

  return {
    hasDivergences: divergences.length > 0,
    divergences,
    folderPermission,
  }
}
