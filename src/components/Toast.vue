<template>
  <Teleport to="body">
    <div class="toast-stack">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast"
          :class="`toast--${t.type}`"
          @click="dismiss(t.id)"
        >
          <span class="toast__icon">{{ icons[t.type] }}</span>
          <span class="toast__message">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const toasts = ref([])
let nextId = 0

const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' }

function show(message, type = 'info', duration = 3500) {
  const id = ++nextId
  toasts.value.push({ id, message, type })
  if (duration > 0) setTimeout(() => dismiss(id), duration)
  return id
}

function dismiss(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

// Expose so parent or composable can call toast.show(...)
defineExpose({ show, dismiss })
</script>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-family: var(--font-ui);
  backdrop-filter: blur(12px);
  pointer-events: all;
  cursor: pointer;
  border: 1px solid transparent;
  max-width: 360px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}

.toast--info    { background: rgba(26,22,37,0.95); border-color: var(--color-border); color: var(--color-text) }
.toast--success { background: rgba(74,222,128,0.15); border-color: rgba(74,222,128,0.3); color: #4ade80 }
.toast--warning { background: rgba(250,204,21,0.15); border-color: rgba(250,204,21,0.3); color: var(--color-warning) }
.toast--error   { background: rgba(248,113,113,0.15); border-color: rgba(248,113,113,0.3); color: var(--color-error) }

.toast__icon { font-size: 14px; flex-shrink: 0 }

/* Transitions */
.toast-enter-active { transition: all 0.25s ease }
.toast-leave-active { transition: all 0.2s ease }
.toast-enter-from   { opacity: 0; transform: translateY(12px) scale(0.95) }
.toast-leave-to     { opacity: 0; transform: translateX(20px) }
</style>
