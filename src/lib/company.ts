import { supabase } from '@/lib/supabase';

let cached: { userId: string; companyId: string } | null = null;
const LS = 'bg-company';

/** The signed-in user's company, read from their user row. Never hardcode a company id.
 *  The answer is remembered on the device so the Field app can keep working without signal. */
export async function getCompanyId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user; if (!user) throw new Error('Not signed in');
  if (cached?.userId === user.id) return cached.companyId;
  try { const m = JSON.parse(localStorage.getItem(LS) ?? 'null'); if (m?.userId === user.id && !navigator.onLine) { cached = m; return m.companyId; } } catch { /* ignore */ }
  const { data, error } = await supabase.from('users').select('company_id').eq('id', user.id).maybeSingle();
  if (error || !data?.company_id) {
    try { const m = JSON.parse(localStorage.getItem(LS) ?? 'null'); if (m?.userId === user.id) { cached = m; return m.companyId; } } catch { /* ignore */ }
    throw new Error('Your account is not linked to a company yet');
  }
  cached = { userId: user.id, companyId: data.company_id };
  try { localStorage.setItem(LS, JSON.stringify(cached)); } catch { /* ignore */ }
  return cached.companyId;
}

/** The signed-in person (from the stored session, no network). */
export async function getMe(): Promise<{ id: string; email: string; name: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const u = session?.user; if (!u) throw new Error('Not signed in');
  let name = '';
  if (navigator.onLine) {
    const { data } = await supabase.from('users').select('first_name,last_name').eq('id', u.id).maybeSingle();
    name = [data?.first_name, data?.last_name].filter(Boolean).join(' ');
    if (name) try { localStorage.setItem('bg-name:' + u.id, name); } catch { /* ignore */ }
  }
  if (!name) try { name = localStorage.getItem('bg-name:' + u.id) ?? ''; } catch { /* ignore */ }
  return { id: u.id, email: u.email ?? '', name: name || u.email || '' };
}
