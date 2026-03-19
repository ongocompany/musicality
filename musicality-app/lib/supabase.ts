import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gcrlzzbyxclswryauuwz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9hi4Lbmk-UUTo2Jl9TJs0w_mOSXuVd1';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
