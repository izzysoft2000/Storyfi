<template>
  <div class="project-card" @click="$emit('open')">
    <!-- Waveform thumbnail -->
    <div class="project-card__thumb">
      <svg class="project-card__waveform" viewBox="0 0 200 40" preserveAspectRatio="none">
        <g :opacity="(project.paragraphGroups ?? []).some(g => g.stitchStatus === 'ready') ? 0.6 : 0.2">
          <rect v-for="(h, i) in waveform" :key="i"
            :x="i * 5" :y="(40 - h) / 2" :width="3" :height="h"
            :fill="project.cast?.[0]?.color ?? 'var(--color-accent)'" rx="1"/>
        </g>
      </svg>
      <div class="project-card__menu" @click.stop>
        <button
          v-if="showReorder"
          class="icon-btn"
          title="Move up"
          :disabled="!canMoveUp"
          @click="$emit('move-up')"
        >↑</button>
        <button
          v-if="showReorder"
          class="icon-btn"
          title="Move down"
          :disabled="!canMoveDown"
          @click="$emit('move-down')"
        >↓</button>
        <button class="icon-btn" title="Clear audio" @click="$emit('clear-audio')">⊘</button>
        <button class="icon-btn icon-btn--danger" title="Delete project" @click="$emit('delete')">✕</button>
      </div>
    </div>

    <div class="project-card__body">
      <!-- Role avatars -->
      <div class="project-card__avatars">
        <span
          v-for="role in (project.cast ?? []).slice(0, 5)"
          :key="role.id"
          class="cast-avatar"
          :style="{ background: role.color }"
          :title="role.label"
        >{{ (role.label || '?')[0].toUpperCase() }}</span>
      </div>

      <h2 class="project-card__title">{{ project.title }}</h2>

      <div class="project-card__meta">
        <span class="meta-chip">
          {{ (project.paragraphGroups ?? []).length }} segments
        </span>
        <span v-if="project.audioSizeBytes > 0" class="meta-chip meta-chip--audio">
          {{ formatBytes(project.audioSizeBytes) }} audio
        </span>
        <span v-else class="meta-chip meta-chip--muted">No audio yet</span>
      </div>

      <div class="project-card__footer">
        <span class="project-card__date">{{ relativeDate(project.updatedAt) }}</span>
        <button class="open-btn" @click.stop="$emit('open')">Open →</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatBytes } from '@/storage/quota.js'
import { relativeDate } from '@/utils/relativeDate.js'
import { pseudoWaveform } from '@/utils/waveform.js'

const props = defineProps({
  project:     { type: Object, required: true },
  showReorder: { type: Boolean, default: false },
  canMoveUp:   { type: Boolean, default: false },
  canMoveDown: { type: Boolean, default: false },
})

defineEmits(['open', 'clear-audio', 'delete', 'move-up', 'move-down'])

const waveform = computed(() => pseudoWaveform(props.project.id))
</script>

<style scoped>
.project-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.project-card:hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.25);
}

.project-card__thumb {
  height: 72px;
  background: var(--color-surface-soft, #2a222a);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}
.project-card__waveform {
  width: 100%; height: 100%;
  display: block;
}
.project-card__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.project-card__avatars { display: flex; gap: 4px; align-items: center; }
.cast-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--font-display); font-weight: 700; font-size: 10px;
  color: #1a1418; flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

.project-card__menu {
  display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s;
  position: absolute; top: 8px; right: 8px;
}
.project-card:hover .project-card__menu { opacity: 1 }

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 4px 6px;
  border-radius: 4px;
  transition: all 0.1s;
  font-family: var(--font-ui);
}
.icon-btn:hover:not(:disabled) { background: var(--color-border); color: var(--color-text) }
.icon-btn:disabled { opacity: 0.25; cursor: not-allowed }
.icon-btn--danger:hover { background: rgba(248,113,113,0.15); color: var(--color-error) }

.project-card__title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.project-card__meta { display: flex; gap: 6px; flex-wrap: wrap }

.meta-chip {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}
.meta-chip--audio { border-color: rgba(124,92,191,0.4); color: var(--color-accent) }
.meta-chip--muted { opacity: 0.5 }

.project-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 4px;
}

.project-card__date {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.open-btn {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-accent);
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-ui);
  transition: color 0.15s;
  padding: 0;
}
.open-btn:hover { color: var(--color-highlight) }
</style>
