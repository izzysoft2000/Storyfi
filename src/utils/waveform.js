// Generates a deterministic pseudo-waveform from any ID string —
// used as decorative card art before/without real audio analysis.
export function pseudoWaveform(id, bars = 40) {
  return Array.from({ length: bars }, (_, i) => {
    let h = 0
    for (let j = 0; j < id.length; j++) h += id.charCodeAt(j) * (i + j + 1)
    return 8 + (Math.abs(Math.sin(h * 0.03)) * 26)
  })
}
