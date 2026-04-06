/**
 * Generate a RFC 4122 UUID using the Web Crypto API.
 */
export function uuid() {
  return crypto.randomUUID()
}
