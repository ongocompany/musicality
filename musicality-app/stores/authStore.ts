import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
// Cloud sync disabled — library is local-only with export/import
// import { startSyncManager, stopSyncManager } from '../services/syncManager';
import { initCloudSync, teardownCloudSync } from '../services/cloudSyncManager';

WebBrowser.maybeCompleteAuthSession();

/** Sync OAuth metadata (name, avatar) to profiles table */
async function syncProfileFromMetadata(user: User) {
  try {
    const meta = user.user_metadata;
    const fullName = meta?.full_name || meta?.name;
    const avatarUrl = meta?.avatar_url || meta?.picture;
    if (!fullName && !avatarUrl) return;

    // Check current profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single();

    if (!profile) return;

    const updates: Record<string, string> = {};
    // Update display_name if it looks like an email (not set by user)
    if (fullName && (!profile.display_name || profile.display_name.includes('@'))) {
      updates.display_name = fullName;
    }
    // Update avatar if missing
    if (avatarUrl && !profile.avatar_url) {
      updates.avatar_url = avatarUrl;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('profiles').update(updates).eq('id', user.id);
      console.log('[Auth] Profile synced from OAuth:', updates);
    }
  } catch (e: any) {
    console.warn('[Auth] Profile sync failed:', e?.message);
  }
}

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  guestMode: boolean;

  initialize: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  enterGuestMode: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  guestMode: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({
        session,
        user: session?.user ?? null,
        loading: false,
      });

      // Already logged in → start cloud sync
      if (session?.user) {
        initCloudSync();
      }

      // Listen for auth state changes
      supabase.auth.onAuthStateChange((_event, session) => {
        const prevUser = get().user;
        set({
          session,
          user: session?.user ?? null,
        });
        // On login: sync OAuth metadata → profile (name, avatar)
        if (session?.user && !prevUser) {
          syncProfileFromMetadata(session.user);
          initCloudSync();  // Start cloud library sync
        }
        // On logout: stop cloud sync
        if (!session?.user && prevUser) {
          teardownCloudSync();
        }
      });

      // Sync profile on initial load if already logged in
      if (session?.user) {
        syncProfileFromMetadata(session.user);
      }
    } catch (error) {
      console.error('Auth init error:', error);
      set({ loading: false });
    }
  },

  signInWithGoogle: async () => {
    try {
      set({ loading: true });
      // Expo Go uses exp:// scheme, standalone builds use musicality://
      const isExpoGo = Constants.appOwnership === 'expo';
      const redirectUrl = isExpoGo
        ? makeRedirectUri()
        : makeRedirectUri({ scheme: 'musicality' });
      console.log('[Auth] Google redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        if (result.type === 'success') {
          const url = new URL(result.url);
          // Handle hash fragment (Supabase returns tokens in hash)
          const params = new URLSearchParams(url.hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
        }
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signInWithApple: async () => {
    if (Platform.OS !== 'ios') return;

    try {
      set({ loading: true });
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) throw error;
      }
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled — not an error
        return;
      }
      console.error('Apple sign-in error:', error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      // 1. Reset all stores first (before signOut clears auth context)
      const { resetAllStores } = require('./resetAllStores');
      await resetAllStores();
      // 2. Sign out from Supabase
      await supabase.auth.signOut();
      // 3. Clear auth state
      set({ user: null, session: null, guestMode: false });
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  },

  enterGuestMode: () => {
    set({ guestMode: true, loading: false });
  },
}));
