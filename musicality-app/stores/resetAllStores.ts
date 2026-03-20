import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Reset ALL stores to initial state.
 * Must be called on: logout, account deletion, account switch.
 * Clears both in-memory Zustand state and persisted AsyncStorage data.
 */
export async function resetAllStores(): Promise<void> {
  // 1. Reset in-memory stores (order doesn't matter)
  const { useCommunityStore } = require('./communityStore');
  const { useMessageStore } = require('./messageStore');
  const { useSocialStore } = require('./socialStore');
  const { usePlayerStore } = require('./playerStore');
  const { useSettingsStore } = require('./settingsStore');
  const { useCalendarStore } = require('./calendarStore');
  const { useTapTempoStore } = require('./tapTempoStore');

  // Community & Social
  useCommunityStore.getState().resetAll();
  useMessageStore.getState().resetAll?.();
  useSocialStore.getState().resetAll();

  // Player — reset library, playback state
  usePlayerStore.getState().resetAll();

  // Settings — reset track-specific data but keep language/UI prefs
  useSettingsStore.getState().resetUserData();

  // Calendar
  useCalendarStore.getState().resetAll();

  // TapTempo
  useTapTempoStore.getState().resetAll();

  // 2. Clear persisted AsyncStorage (playerStore, settingsStore)
  await AsyncStorage.multiRemove([
    'musicality-tracks',
    'musicality-settings',
  ]);

  console.log('[ResetAllStores] All stores reset successfully');
}
