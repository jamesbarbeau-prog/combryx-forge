// White-label: the company's own logo and name replace the Builder Guardian shield and wordmark.
// Remembered on the device so it paints instantly and still shows offline in the Field app.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/company';

export interface Brand { logo: string | null; name: string | null }
const LS = 'bg-brand';
const subs = new Set<(b: Brand) => void>();

function read(): Brand {
  try { const b = JSON.parse(localStorage.getItem(LS) ?? 'null'); if (b) return { logo: b.logo ?? null, name: b.name ?? null }; } catch { /* ignore */ }
  return { logo: null, name: null };
}
let current: Brand = read();

export async function refreshBrand() {
  try {
    const id = await getCompanyId();
    const [s, c] = await Promise.all([
      supabase.from('company_settings').select('settings').eq('company_id', id).maybeSingle(),
      supabase.from('companies').select('name').eq('id', id).maybeSingle(),
    ]);
    const st = (s.data?.settings ?? {}) as any;
    current = { logo: st.logo_url || null, name: (st.name || (c.data as any)?.name || '').trim() || null };
    try { localStorage.setItem(LS, JSON.stringify(current)); } catch { /* ignore */ }
    subs.forEach(f => f(current));
  } catch { /* offline or signed out: keep what we have */ }
}

export function useBrand(): Brand {
  const [b, setB] = useState<Brand>(current);
  useEffect(() => { subs.add(setB); refreshBrand(); return () => { subs.delete(setB); }; }, []);
  return b;
}
