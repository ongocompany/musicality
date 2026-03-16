import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import CryptoJS from 'crypto-js';
import * as ExpoCrypto from 'expo-crypto';

// ─── Encryption (same key as phraseNoteService) ───
const RITMO_FILE_KEY = 'R1tm0-2026!Lat1n-D4nc3-Mus1c@lity';
const BACKUP_MAGIC = 'RITMOBK1'; // distinct from RITMO1 (note files)

// Ensure secure random for crypto-js
CryptoJS.lib.WordArray.random = (nBytes: number) => {
  const bytes = ExpoCrypto.getRandomBytes(nBytes);
  const words: number[] = [];
  for (let i = 0; i < nBytes; i += 4) {
    words.push(
      ((bytes[i] || 0) << 24) |
      ((bytes[i + 1] || 0) << 16) |
      ((bytes[i + 2] || 0) << 8) |
      (bytes[i + 3] || 0)
    );
  }
  return CryptoJS.lib.WordArray.create(words, nBytes);
};

// ─── Backup data structure ───
export interface LibraryBackup {
  version: 1;
  createdAt: number;
  player: {
    tracks: any[];
    folders: any[];
    sortBy: string;
    sortOrder: string;
  };
  settings: {
    downbeatOffsets: Record<string, number>;
    beatTimeOffsets: Record<string, number>;
    bpmOverrides: Record<string, number>;
    phraseMarks: Record<string, number[]>;
    trackEditions: Record<string, any>;
    cellNotes: Record<string, Record<string, string>>;
    importedNotes: any[];
    trackFormations: Record<string, any>;
    stageConfig: any;
  };
}

function encrypt(data: LibraryBackup): string {
  const json = JSON.stringify(data);
  const encrypted = CryptoJS.AES.encrypt(json, RITMO_FILE_KEY).toString();
  return BACKUP_MAGIC + encrypted;
}

function decrypt(content: string): LibraryBackup {
  if (!content.startsWith(BACKUP_MAGIC)) {
    throw new Error('Invalid backup file format');
  }
  const encrypted = content.slice(BACKUP_MAGIC.length);
  const bytes = CryptoJS.AES.decrypt(encrypted, RITMO_FILE_KEY);
  const json = bytes.toString(CryptoJS.enc.Utf8);
  if (!json) throw new Error('Failed to decrypt backup. Invalid or corrupted file.');
  return JSON.parse(json) as LibraryBackup;
}

// ─── Export ───
export async function exportLibraryBackup(backup: LibraryBackup): Promise<void> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const trackCount = backup.player.tracks.length;
  const filename = `ritmo_backup_${dateStr}_${trackCount}tracks`;

  const encrypted = encrypt(backup);
  const file = new File(Paths.cache, `${filename}.ritmo-backup`);
  if (file.exists) file.delete();
  file.create();
  file.write(encrypted);

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) throw new Error('Sharing is not available on this device');

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Export Ritmo Library Backup',
  });
}

// ─── Import ───
export async function importLibraryBackup(): Promise<LibraryBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const file = new File(asset.uri);
  if (!file.exists) throw new Error('Selected file does not exist');

  const content = await file.text();
  return decrypt(content);
}
