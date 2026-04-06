/** Default Voice Role colours in document order. */
export const ROLE_COLORS = [
  '#6B7FD4', // Narrator  — cool blue-grey
  '#E07B54', // Actor 1   — warm amber
  '#5CB85C', // Actor 2   — sage green
  '#D4A017', // Actor 3   — gold
  '#C45C8A', // Actor 4   — rose
  '#4ECDC4', // Actor 5   — teal
  '#FF6B6B', // Actor 6   — coral
  '#A78BFA', // Actor 7   — violet
  '#34D399', // Actor 8   — emerald
  '#FB923C', // Actor 9   — orange
]

/**
 * Return the next available colour not already used by existing roles.
 * Falls back to cycling through ROLE_COLORS if all are taken.
 */
export function nextRoleColor(existingColors = []) {
  const used = new Set(existingColors)
  for (const color of ROLE_COLORS) {
    if (!used.has(color)) return color
  }
  return ROLE_COLORS[existingColors.length % ROLE_COLORS.length]
}

/**
 * Add alpha to a hex colour: '#6B7FD4' + 0.15 → 'rgba(107,127,212,0.15)'
 */
export function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
