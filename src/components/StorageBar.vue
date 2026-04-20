<template>
  <!-- Compact (status bar): single inline row -->
  <div v-if="compact" class="storage-compact">
    <div class="storage-compact__track" :title="tooltip">
      <div
        class="storage-compact__fill"
        :class="`storage-compact__fill--${level}`"
        :style="{ width: `${Math.min(usedPercent * 100, 100)}%` }"
      />
    </div>
    <span class="storage-compact__numbers" :title="tooltip">
      {{ usedLabel }} / {{ totalLabel }}
    </span>
    <button class="storage-compact__manage" @click="$emit('manage')">Manage</button>
    <span
      v-if="level !== 'ok'"
      class="storage-compact__warn"
      :class="`storage-compact__warn--${level}`"
      :title="level === 'critical' ? 'Storage nearly full' : 'Storage getting full'"
    >⚠</span>
  </div>

  <!-- Full (standalone) -->
  <div v-else class="storage-bar">
    <div class="storage-bar__header">
      <span class="storage-bar__label">Storage</span>
      <button class="storage-bar__manage" @click="$emit('manage')">Manage</button>
    </div>
    <div class="storage-bar__track" :title="tooltip">
      <div
        class="storage-bar__fill"
        :class="`storage-bar__fill--${level}`"
        :style="{ width: `${Math.min(usedPercent * 100, 100)}%` }"
      />
    </div>
    <div class="storage-bar__numbers">
      <span>{{ usedLabel }}</span>
      <span class="storage-bar__sep">/</span>
      <span class="storage-bar__total">{{ totalLabel }}</span>
    </div>
    <div v-if="level !== 'ok'" class="storage-bar__warning" :class="`storage-bar__warning--${level}`">
      <span v-if="level === 'warning'">⚠ Storage getting full — consider clearing old audio</span>
      <span v-if="level === 'critical'">⛔ Storage nearly full — export and clear audio</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getQuotaInfo, formatBytes, quotaLevel } from '@/storage/quota.js'

defineProps({ compact: { type: Boolean, default: false } })
defineEmits(['manage'])

const quota = ref(null)

const usedPercent = computed(() => quota.value?.usedPercent ?? 0)
const level       = computed(() => quotaLevel(usedPercent.value))
const usedLabel   = computed(() => quota.value ? formatBytes(quota.value.usedBytes)  : '—')
const totalLabel  = computed(() => quota.value ? formatBytes(quota.value.quotaBytes) : '—')
const tooltip     = computed(() =>
  quota.value ? `${formatBytes(quota.value.availableBytes)} available` : 'Checking storage…'
)

async function refresh() { quota.value = await getQuotaInfo() }

let interval
onMounted(()   => { refresh(); interval = setInterval(refresh, 30_000) })
onUnmounted(() => clearInterval(interval))

defineExpose({ refresh })
</script>

<style scoped>
.storage-compact {
  display: flex; align-items: center; gap: 8px;
}
.storage-compact__track {
  width: 72px; height: 4px; background: var(--color-border);
  border-radius: 2px; overflow: hidden; flex-shrink: 0; cursor: default;
}
.storage-compact__fill {
  height: 100%; border-radius: 2px; transition: width 0.4s ease;
  background: var(--color-accent);
}
.storage-compact__fill--warning  { background: var(--color-warning) }
.storage-compact__fill--critical { background: var(--color-error)   }
.storage-compact__numbers {
  font-size: 11px; font-family: var(--font-mono);
  color: var(--color-text-muted); white-space: nowrap;
}
.storage-compact__manage {
  font-size: 11px; color: var(--color-accent); background: none;
  border: none; cursor: pointer; padding: 0; font-family: var(--font-ui);
  white-space: nowrap; transition: color 0.15s;
}
.storage-compact__manage:hover { color: var(--color-highlight) }
.storage-compact__warn { font-size: 11px; flex-shrink: 0 }
.storage-compact__warn--warning  { color: var(--color-warning) }
.storage-compact__warn--critical { color: var(--color-error)   }

.storage-bar { padding: 10px 12px; border-radius: 8px; background: var(--color-bg); border: 1px solid var(--color-border); }
.storage-bar__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.storage-bar__label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); }
.storage-bar__manage { font-size: 11px; color: var(--color-accent); background: none; border: none; cursor: pointer; padding: 0; font-family: var(--font-ui); transition: color 0.15s; }
.storage-bar__manage:hover { color: var(--color-highlight) }
.storage-bar__track { height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden; margin-bottom: 5px; }
.storage-bar__fill { height: 100%; border-radius: 2px; transition: width 0.4s ease; background: var(--color-accent); }
.storage-bar__fill--warning  { background: var(--color-warning) }
.storage-bar__fill--critical { background: var(--color-error)   }
.storage-bar__numbers { display: flex; gap: 3px; font-size: 11px; font-family: var(--font-mono); color: var(--color-text-muted); }
.storage-bar__sep   { opacity: 0.4 }
.storage-bar__total { opacity: 0.6 }
.storage-bar__warning { margin-top: 6px; font-size: 11px; line-height: 1.4; padding: 5px 8px; border-radius: 4px; }
.storage-bar__warning--warning  { background: rgba(250,204,21,0.1);  color: var(--color-warning) }
.storage-bar__warning--critical { background: rgba(248,113,113,0.1); color: var(--color-error)   }
</style>
