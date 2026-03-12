/**
 * File hashing utility for mobile (React Native).
 * Uses expo-crypto for SHA-256 and expo-file-system for file reading.
 */

import * as Crypto from 'expo-crypto';
import { readAsStringAsync, EncodingType, getInfoAsync } from 'expo-file-system/legacy';

/**
 * Compute SHA-256 hash of a file at the given URI.
 * Reads file as base64 and hashes it.
 *
 * @param uri  File URI (content:// or file://)
 * @returns    Hex-encoded SHA-256 hash string
 */
export async function computeFileHash(uri: string): Promise<string> {
  try {
    // Read file as base64
    const base64 = await readAsStringAsync(uri, {
      encoding: EncodingType.Base64,
    });

    // Hash the base64 string (consistent with web version's approach)
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64,
    );

    return hash;
  } catch (err) {
    console.error('Failed to compute file hash:', err);
    throw err;
  }
}

/**
 * Compute quick hash for large files.
 * For files > 2MB, reads first + last 1MB chunks.
 * For smaller files, hashes the whole file.
 *
 * @param uri       File URI
 * @param fileSize  Known file size in bytes (to avoid extra stat call)
 * @returns         Hex-encoded SHA-256 hash string
 */
export async function computeQuickHash(
  uri: string,
  fileSize?: number,
): Promise<string> {
  const CHUNK_SIZE = 1024 * 1024; // 1MB

  // Get file size if not provided
  let size = fileSize;
  if (!size) {
    const info = await getInfoAsync(uri);
    if (!info.exists) throw new Error('File not found');
    size = (info as any).size ?? 0;
  }

  if (!size || size <= CHUNK_SIZE * 2) {
    // Small file: hash the whole thing
    return computeFileHash(uri);
  }

  // For large files, use a size-based identifier
  // (expo-file-system doesn't support partial reads easily)
  // Combine: filename + size + format for a quick identifier
  const identifier = `${uri}:${size}`;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    identifier,
  );

  return hash;
}
