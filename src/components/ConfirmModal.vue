<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-backdrop" @click.self="cancel">
        <div class="modal">
          <h3 class="modal__title">{{ title }}</h3>
          <p class="modal__body">{{ message }}</p>
          <div class="modal__actions">
            <button class="btn btn--ghost" @click="cancel">{{ cancelLabel }}</button>
            <button class="btn" :class="`btn--${variant}`" @click="confirm">{{ confirmLabel }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const visible      = ref(false)
const title        = ref('')
const message      = ref('')
const confirmLabel = ref('Confirm')
const cancelLabel  = ref('Cancel')
const variant      = ref('danger')  // 'danger' | 'accent'

let _resolve = null

function open(opts = {}) {
  title.value        = opts.title        ?? 'Are you sure?'
  message.value      = opts.message      ?? ''
  confirmLabel.value = opts.confirmLabel ?? 'Confirm'
  cancelLabel.value  = opts.cancelLabel  ?? 'Cancel'
  variant.value      = opts.variant      ?? 'danger'
  visible.value      = true
  return new Promise(resolve => { _resolve = resolve })
}

function confirm() { visible.value = false; _resolve?.(true)  }
function cancel()  { visible.value = false; _resolve?.(false) }

defineExpose({ open })
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(14,12,24,0.75);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 28px 32px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}

.modal__title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 10px;
}

.modal__body {
  font-size: 14px;
  color: var(--color-text-muted);
  line-height: 1.6;
  margin: 0 0 24px;
}

.modal__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.btn {
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-ui);
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.btn--ghost {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text-muted);
}
.btn--ghost:hover { border-color: var(--color-text-muted); color: var(--color-text) }

.btn--danger {
  background: rgba(248,113,113,0.15);
  border-color: rgba(248,113,113,0.4);
  color: var(--color-error);
}
.btn--danger:hover { background: rgba(248,113,113,0.25) }

.btn--accent {
  background: var(--color-accent);
  color: #fff;
}
.btn--accent:hover { background: var(--color-highlight) }

/* Transitions */
.modal-enter-active, .modal-leave-active { transition: all 0.2s ease }
.modal-enter-from, .modal-leave-to       { opacity: 0; transform: scale(0.96) }
</style>
