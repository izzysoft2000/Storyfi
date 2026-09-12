// Next available "{prefix} N" name given a list of existing titles —
// e.g. nextDefaultName('Solution', ['Solution 1']) -> 'Solution 2'
export function nextDefaultName(prefix, existingTitles) {
  const taken = new Set(existingTitles.map(t => t.trim().toLowerCase()))
  let n = 1
  while (taken.has(`${prefix} ${n}`.toLowerCase())) n++
  return `${prefix} ${n}`
}
