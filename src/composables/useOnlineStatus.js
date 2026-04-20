/**
 * src/composables/useOnlineStatus.js
 * Reactive online/offline status driven by browser events.
 * Uses a module-level shared ref so the event listeners are only
 * registered once regardless of how many components use this.
 */

import { ref, onMounted, onUnmounted } from 'vue'

// Shared across all callers — one source of truth
const isOnline = ref(navigator.onLine)

let _listenerCount = 0

function handleOnline()  { isOnline.value = true  }
function handleOffline() { isOnline.value = false }

export function useOnlineStatus() {
  onMounted(() => {
    if (_listenerCount === 0) {
      window.addEventListener('online',  handleOnline)
      window.addEventListener('offline', handleOffline)
    }
    _listenerCount++
  })

  onUnmounted(() => {
    _listenerCount--
    if (_listenerCount === 0) {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  })

  return { isOnline }
}
