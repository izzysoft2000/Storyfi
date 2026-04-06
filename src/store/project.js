/**
 * store/project.js
 * Pinia store for the currently open project.
 * Handles loading, saving, and mutations to the active project.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getProject, saveProject } from './db.js'
import { debounce } from '@/utils/debounce.js'
import { uuid } from '@/utils/uuid.js'
import { ROLE_COLORS, nextRoleColor } from '@/utils/colors.js'

export const useProjectStore = defineStore('project', () => {
  // ─── State ──────────────────────────────────────────────────────────────────
  const project      = ref(null)   // Full Project record
  const isLoading    = ref(false)
  const isSaving     = ref(false)
  const isDirty      = ref(false)

  // ─── Getters ────────────────────────────────────────────────────────────────
  const isOpen       = computed(() => project.value !== null)
  const cast         = computed(() => project.value?.cast ?? [])
  const groups       = computed(() => project.value?.paragraphGroups ?? [])
  const projectTitle = computed(() => project.value?.title ?? '')

  // ─── Load / Save ────────────────────────────────────────────────────────────

  async function loadProject(id) {
    isLoading.value = true
    try {
      project.value = await getProject(id)
      isDirty.value = false
    } finally {
      isLoading.value = false
    }
  }

  async function persistProject() {
    if (!project.value) return
    isSaving.value = true
    try {
      await saveProject(project.value)
      isDirty.value = false
    } finally {
      isSaving.value = false
    }
  }

  // Debounced auto-save — called whenever project state mutates
  const debouncedSave = debounce(persistProject, 2000)

  function markDirty() {
    isDirty.value = true
    debouncedSave()
  }

  function closeProject() {
    project.value = null
    isDirty.value = false
  }

  // ─── Project Mutations ───────────────────────────────────────────────────────

  function setTitle(title) {
    if (!project.value) return
    project.value.title = title
    markDirty()
  }

  function setEditorState(state) {
    if (!project.value) return
    project.value.editorState = state
    markDirty()
  }

  function setOutputFolder(handle, name) {
    if (!project.value) return
    project.value.outputFolderHandle = handle
    project.value.outputFolderName   = name
    project.value.outputFolderPromptDismissed = false
    markDirty()
  }

  function dismissFolderPrompt() {
    if (!project.value) return
    project.value.outputFolderHandle           = null
    project.value.outputFolderName             = null
    project.value.outputFolderPromptDismissed  = true
    markDirty()
  }

  // ─── Cast (Voice Roles) Mutations ───────────────────────────────────────────

  function addRole(labelOverride) {
    if (!project.value) return
    const existingColors = project.value.cast.map(r => r.color)
    const idx   = project.value.cast.length
    const id    = `actor_${idx}`
    const label = labelOverride ?? (idx === 0 ? 'Narrator' : `Actor ${idx}`)
    const color = nextRoleColor(existingColors)

    project.value.cast.push({
      id,
      label,
      color,
      voiceAssignment: null,
    })
    markDirty()
    return project.value.cast[project.value.cast.length - 1]
  }

  function updateRoleLabel(roleId, label) {
    if (!project.value) return
    const role = project.value.cast.find(r => r.id === roleId)
    if (role) { role.label = label; markDirty() }
  }

  function updateRoleColor(roleId, color) {
    if (!project.value) return
    const role = project.value.cast.find(r => r.id === roleId)
    if (role) { role.color = color; markDirty() }
  }

  function updateRoleVoice(roleId, voiceAssignment) {
    if (!project.value) return
    const role = project.value.cast.find(r => r.id === roleId)
    if (role) { role.voiceAssignment = voiceAssignment; markDirty() }
  }

  function deleteRole(roleId) {
    if (!project.value) return
    project.value.cast = project.value.cast.filter(r => r.id !== roleId)
    markDirty()
  }

  // ─── Factory: create a new blank project ────────────────────────────────────

  function createBlankProject(title = 'Untitled Project') {
    const now = Date.now()
    return {
      id:           uuid(),
      title,
      createdAt:    now,
      updatedAt:    now,
      sourceMarkdown: '',
      editorState:  null,
      cast: [
        { id: 'narrator', label: 'Narrator', color: ROLE_COLORS[0], voiceAssignment: null },
        { id: 'actor_1',  label: 'Actor 1',  color: ROLE_COLORS[1], voiceAssignment: null },
        { id: 'actor_2',  label: 'Actor 2',  color: ROLE_COLORS[2], voiceAssignment: null },
      ],
      paragraphGroups:              [],
      audioSizeBytes:               0,
      persistenceGranted:           false,
      outputFolderHandle:           null,
      outputFolderName:             null,
      outputFolderPromptDismissed:  false,
    }
  }

  return {
    // state
    project, isLoading, isSaving, isDirty,
    // getters
    isOpen, cast, groups, projectTitle,
    // actions
    loadProject, persistProject, closeProject, markDirty,
    setTitle, setEditorState, setOutputFolder, dismissFolderPrompt,
    addRole, updateRoleLabel, updateRoleColor, updateRoleVoice, deleteRole,
    createBlankProject,
  }
})
