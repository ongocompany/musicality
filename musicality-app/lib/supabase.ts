import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pglaxqvsqlzarcjyvczt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnbGF4cXZzcWx6YXJjanl2Y3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MzgwODksImV4cCI6MjA4OTUxNDA4OX0.rwc-8QoWtQCZOzJBkgg6trjUOjomnSHHozRMHqvku5o';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
