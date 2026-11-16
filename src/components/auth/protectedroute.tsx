import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, isInstalledApp } from '@/lib/supabase';

const IDLE_MINUTES = 30;
const NO_COMPANY = 'Your account is not linked to a company yet. Ask your administrator to invite you.';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [authed,   setAuthed]   = useState(false);
  const [notice,   setNotice]   = useState('');

  // A login only counts if it belongs to a company; anyone else is signed straight back out.
  // With no signal the stored sign-in is trusted (the Field app must open in a basement with no bars).
  // The server still checks every request when the phone reconnects.
  const storedUser = (): { id: string; company: string | null } | null => {
    try {
      const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x)); if (!k) return null;
      const id = JSON.parse(localStorage.getItem(k) ?? 'null')?.user?.id; if (!id) return null;
      const m = JSON.parse(localStorage.getItem('bg-company') ?? 'null'); return { id, company: m?.userId === id ? m.companyId : null };
    } catch { return null; }
  };
  async function verify(session: { user: { id: string } } | null) {
    if (!session) {
      const u = !navigator.onLine && isInstalledApp() ? storedUser() : null;
      setAuthed(!!u?.company); return;
    }
    if (!navigator.onLine) { setAuthed(storedUser()?.company != null); return; }
    const { data, error } = await supabase.from('users').select('company_id').eq('id', session.user.id).maybeSingle();
    if (error) { setAuthed(storedUser()?.company != null); return; }
    if (!data?.company_id) { setNotice(NO_COMPANY); setAuthed(false); await supabase.auth.signOut(); return; }
    try { localStorage.setItem('bg-company', JSON.stringify({ userId: session.user.id, companyId: data.company_id })); } catch { /* ignore */ }
    setAuthed(true);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => { await verify(session); setChecking(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setAuthed(false);
      else if (!session) { if (navigator.onLine || !isInstalledApp()) setAuthed(false); }
      else if (event === 'SIGNED_IN') setTimeout(() => { verify(session); }, 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Sign out after a stretch with no activity.
  useEffect(() => {
    if (!authed || isInstalledApp()) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(async () => { setNotice('You were signed out after ' + IDLE_MINUTES + ' minutes of inactivity.'); await supabase.auth.signOut(); }, IDLE_MINUTES * 60_000); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [authed]);

  if (checking) return null;

  if (!authed) {
    return <Navigate to="/warranty/login" state={{ from: location.pathname, notice }} replace />;
  }

  return <>{children}</>;
}
