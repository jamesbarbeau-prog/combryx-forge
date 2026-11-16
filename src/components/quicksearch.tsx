// Quick jump: type a lot number, address, homeowner, enrolment # or Tarion case # and go straight to the file. Ctrl/Cmd+K focuses it.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Home, Scale } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Hit { key: string; kind: 'lot' | 'case'; title: string; sub: string; path: string }
const clean = (s: string) => s.replace(/[%,()]/g, ' ').trim();

export default function QuickSearch() {
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); } };
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', key); document.addEventListener('mousedown', out);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('mousedown', out); };
  }, []);

  useEffect(() => {
    const t = clean(q);
    if (t.length < 2) { setHits([]); return; }
    setBusy(true);
    const id = setTimeout(async () => {
      const like = `%${t}%`;
      const [lots, cases] = await Promise.all([
        supabase.from('warranty_lots').select('id, lot_number, address, homeowner_name, enrollment_number')
          .or(`address.ilike.${like},homeowner_name.ilike.${like},enrollment_number.ilike.${like},lot_number.ilike.${like}`).limit(6),
        supabase.from('cm_case_view').select('id, case_number, homeowner, address, community')
          .or(`case_number.ilike.${like},homeowner.ilike.${like},address.ilike.${like},enrolment.ilike.${like}`).limit(6),
      ]);
      const out: Hit[] = [
        ...(cases.data ?? []).map((c: any) => ({ key: 'c' + c.id, kind: 'case' as const, title: `${c.case_number} · ${c.homeowner || 'Conciliation'}`, sub: [c.address, c.community].filter(Boolean).join(' · '), path: `/warranty/conciliation/${c.id}` })),
        ...(lots.data ?? []).map((l: any) => ({ key: 'l' + l.id, kind: 'lot' as const, title: `${l.address || 'Lot ' + l.lot_number}`, sub: [l.homeowner_name, l.enrollment_number, l.lot_number ? `Lot ${l.lot_number}` : ''].filter(Boolean).join(' · '), path: `/warranty/lots/${l.id}` })),
      ];
      setHits(out); setBusy(false);
    }, 220);
    return () => clearTimeout(id);
  }, [q]);

  const go = (h: Hit) => { setOpen(false); setQ(''); nav(h.path); };

  return (
    <div ref={box} style={{ position: 'relative', width: 'min(420px, 100%)' }}>
      <Search size={15} style={{ position: 'absolute', left: 13, top: 12, color: '#7B8AA0', pointerEvents: 'none' }} />
      <input ref={ref} value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Enter' && hits[0]) go(hits[0]); if (e.key === 'Escape') { setOpen(false); ref.current?.blur(); } }}
        placeholder="Jump to a lot, address, owner or case #" aria-label="Quick search"
        style={{ width: '100%', height: 39, borderRadius: 10, border: '1px solid rgba(255,255,255,0.35)', background: '#fff', padding: '0 52px 0 36px', font: '500 13px var(--font-body)', color: '#0F172A', outline: 'none' }} />
      <kbd style={{ position: 'absolute', right: 10, top: 10, fontSize: 10.5, fontWeight: 700, color: '#7B8AA0', border: '1px solid #E2E8F0', borderRadius: 5, padding: '1px 6px', background: '#F8FAFC' }}>Ctrl K</kbd>
      {open && clean(q).length >= 2 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 46, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 18px 44px rgba(11,19,43,0.25)', padding: 6, zIndex: 70, maxHeight: 380, overflowY: 'auto' }}>
          {hits.map(h => (
            <button key={h.key} onClick={() => go(h)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: '9px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#EEF2F8')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {h.kind === 'lot' ? <Home size={16} color="#2563EB" /> : <Scale size={16} color="#B45309" />}
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.sub}</span>
              </span>
            </button>
          ))}
          {!hits.length && <div style={{ padding: '12px 10px', fontSize: 12.5, color: '#475569' }}>{busy ? 'Searching…' : 'No match. Try part of the street name or the case number.'}</div>}
        </div>
      )}
    </div>
  );
}
