/**
 * Returns a debounced version of fn that delays invocation
 * until after `wait` ms have elapsed since the last call.
 */
export function debounce(fn, wait = 300) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}
