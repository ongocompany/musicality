/**
 * Deleted User — ghost avatar + localized "Deleted User" name.
 * Use when profile is null/undefined (user_id was set to NULL on account deletion).
 */
import i18n from '../i18n';

// Ghost avatar asset (cute casper)
export const GHOST_AVATAR = require('../assets/ghost-avatar.png');

/** Get localized "Deleted User" display name */
export function getDeletedUserName(): string {
  return i18n.t('common.deletedUser');
}

/** Check if a profile represents a deleted user (null sender_id → no profile) */
export function isDeletedUser(profile: unknown): boolean {
  return !profile;
}
