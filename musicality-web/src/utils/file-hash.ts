/**
 * File hashing utility using Web Crypto API.
 * Computes SHA-256 hash for fingerprint matching across devices.
 */

/**
 * Compute SHA-256 hash of a File object.
 * Uses Web Crypto API (available in all modern browsers).
 *
 * @param file  The file to hash
 * @returns     Hex-encoded SHA-256 hash string
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute hash for a partial file (first 1MB + last 1MB + file size).
 * Faster for large files while still being unique enough.
 *
 * @param file  The file to hash
 * @returns     Hex-encoded SHA-256 hash string
 */
export async function computeQuickHash(file: File): Promise<string> {
  const CHUNK_SIZE = 1024 * 1024; // 1MB

  if (file.size <= CHUNK_SIZE * 2) {
    // Small file: hash the whole thing
    return computeFileHash(file);
  }

  // Large file: hash first 1MB + last 1MB + size
  const firstChunk = await file.slice(0, CHUNK_SIZE).arrayBuffer();
  const lastChunk = await file.slice(-CHUNK_SIZE).arrayBuffer();

  // Combine: first chunk + last chunk + size as bytes
  const sizeBytes = new TextEncoder().encode(String(file.size));
  const combined = new Uint8Array(
    firstChunk.byteLength + lastChunk.byteLength + sizeBytes.byteLength,
  );
  combined.set(new Uint8Array(firstChunk), 0);
  combined.set(new Uint8Array(lastChunk), firstChunk.byteLength);
  combined.set(sizeBytes, firstChunk.byteLength + lastChunk.byteLength);

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
