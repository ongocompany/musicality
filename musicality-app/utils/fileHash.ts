/**
 * File hashing utility for mobile (React Native).
 * Uses expo-crypto for SHA-256 and expo-file-system for file reading.
 *
 * Hash = SHA-256(first 64KB of file content + file size)
 * → URI-independent, same file = same hash across devices
 */

import * as Crypto from 'expo-crypto';
import { readAsStringAsync, EncodingType, getInfoAsync } from 'expo-file-system/legacy';

const HEADER_BYTES = 65536; // 64KB — enough to identify unique audio files

/**
 * Compute content-based fingerprint for a file.
 * Reads the first 64KB + file size → SHA-256.
 * Same file on different devices/paths produces the same hash.
 *
 * @param uri       File URI (file:// or content://)
 * @param fileSize  Known file size in bytes (avoids extra stat call)
 * @returns         Hex-encoded SHA-256 hash string
 */
export async function computeQuickHash(
  uri: string,
  fileSize?: number,
): Promise<string> {
  // Get file size if not provided
  let size = fileSize;
  if (!size) {
    const info = await getInfoAsync(uri);
    if (!info.exists) throw new Error('File not found');
    size = (info as any).size ?? 0;
  }

  // Read first 64KB of file content (or whole file if smaller)
  const readLength = Math.min(HEADER_BYTES, size || HEADER_BYTES);
  const header = await readAsStringAsync(uri, {
    encoding: EncodingType.Base64,
    position: 0,
    length: readLength,
  });

  // Hash: file header content + file size → unique per file, independent of path
  const hashInput = `${header}:${size}`;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    hashInput,
  );

  return hash;
}

/**
 * Compute full SHA-256 hash of a file.
 * Only use for small files (<2MB). For larger files use computeQuickHash.
 */
export async function computeFileHash(uri: string): Promise<string> {
  const base64 = await readAsStringAsync(uri, {
    encoding: EncodingType.Base64,
  });

  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64,
  );
}
