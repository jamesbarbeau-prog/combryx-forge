import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Supabase calls will fail until env vars are set.'
  );
}

/** True inside the installed phone app (Android app or home-screen install). */
export const isInstalledApp = (): boolean => {
  try { return !!(window as any).Capacitor?.isNativePlatform?.() || window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true; } catch { return false; }
};
const installed = isInstalledApp();

// In a browser the sign-in lives in sessionStorage: closing the tab signs you out. The installed phone app keeps the
// sign-in so the Field app opens straight away, with or without signal (it signs out only when the person taps Sign out).
if (!installed) { try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)); } catch { /* storage blocked */ } }

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  { auth: { storage: installed ? window.localStorage : window.sessionStorage, persistSession: true, autoRefreshToken: true } }
);