/**
 * The Supabase client — auth, and the Data API that PowerSync's upload queue writes
 * through. Reads never come from here: they come from the local replica, which is the
 * whole point of ADR-0004.
 */

import { createClient } from "@supabase/supabase-js";
import Storage from "expo-sqlite/kv-store";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY must be set — see .env.example",
  );
}

export const supabase = createClient(url, key, {
  auth: {
    // expo-sqlite is already a dependency and its kv-store is AsyncStorage-compatible,
    // so the session persists across launches without adding a storage package.
    storage: Storage,
    persistSession: true,
    autoRefreshToken: true,
    // No deep-link callback to parse: sign-in is email and password for now.
    detectSessionInUrl: false,
  },
});
