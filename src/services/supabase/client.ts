import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { supabaseEnv } from '../../config/env';
import { LargeSecureStore } from './sessionStorage';

let client: SupabaseClient | null = null;
let appStateBound = false;

/** The Supabase client, or null when cloud features are not configured. */
export function getSupabase(): SupabaseClient | null {
  if (supabaseEnv.status !== 'configured') return null;
  if (!client) {
    client = createClient(supabaseEnv.url, supabaseEnv.key, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : new LargeSecureStore(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  if (!appStateBound && Platform.OS !== 'web') {
    appStateBound = true;
    // Only refresh tokens while the app is in the foreground.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
