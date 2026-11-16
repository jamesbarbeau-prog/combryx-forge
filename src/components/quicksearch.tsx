// Live type-ahead over every home: civic address, lot (incl. townhome block-lots like B04-39), owner, enrolment # or case #.
// "124 big dipper" → the lot; opening it shows the owner file with every active and closed case. Ctrl/Cmd+K focuses it.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Home } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Hit { lot_id: string; community: string | null; lot_number: string | null; address: string | null; owner: string | null; enrollment: string | null; open_cases: number; closed_cases: number; conciliations: number; case_hit: string | null }

export default function QuickSearch() {
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); } };
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', key); document.addEventListener('mousedown', out);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('mousedown', out); };
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 1) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const mine = ++seq.current;
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc('warranty_search', { p_q: t, p_limit: 10 });
      if (mine !== seq.current) return; // a newer keystroke is already in flight
      setHits((data ?? []) as Hit[]); setSel(0); setBusy(false);
    }, 140);
    return () => clearTimeout(id);
  }, [q]);

  const go = (h: Hit) => { setOpen(false); setQ(''); nav(`/warranty/lots/${h.lot_id}`); };
  const street = (a: string | null) => (a ?? '').replace(/,\s*Ottawa.*$/i, '');

  return (
    <div ref={box} style={{ position: 'relative', width: 'min(460px, 100%)' }}>
      <Search size={15} style={{ position: 'absolute', left: 13, top: 12, color: '#7B8AA0', pointerEvents: 'none' }} />
      <input ref={ref} value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
          else if (e.key === 'Enter' && hits[sel]) go(hits[sel]);
          else if (e.key === 'Escape') { setOpen(false); ref.current?.blur(); }
        }}
        placeholder="Search lot, civic address, owner, enrolment or case #" aria-label="Search homes"
        style={{ width: '100%', height: 39, borderRadius: 10, border: '1px solid rgba(255,255,255,0.35)', background: '#fff', padding: '0 52px 0 36px', font: '500 13px var(--font-body)', color: '#0F172A', outline: 'none' }} />
      <kbd style={{ position: 'absolute', right: 10, top: 10, fontSize: 10.5, fontWeight: 700, color: '#7B8AA0', border: '1px solid #E2E8F0', borderRadius: 5, padding: '1px 6px', background: '#F8FAFC' }}>Ctrl K</kbd>
      {open && q.trim().length >= 1 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 46, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 18px 44px rgba(11,19,43,0.25)', padding: 6, zIndex: 70, maxHeight: 420, overflowY: 'auto' }}>
          {hits.map((h, i) => (
            <button key={h.lot_id} onClick={() => go(h)} onMouseEnter={() => setSel(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', border: 0, background: i === sel ? '#EEF4FF' : 'transparent', padding: '9px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Home size={16} color="#2563EB" style={{ flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {street(h.address) || `Lot ${h.lot_number}`}<span style={{ fontWeight: 500, color: '#475569' }}>{h.lot_number ? ` · Lot ${h.lot_number}` : ''}</span>
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[h.community, h.owner || 'No purchaser on file', h.enrollment, h.case_hit ? `case ${h.case_hit}` : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                {h.open_cases > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#DBEAFE', color: '#1D4ED8' }}>{h.open_cases} open</span>}
                {h.closed_cases > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#E5E7EB', color: '#374151' }}>{h.closed_cases} closed</span>}
                {h.conciliations > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#FEF3C7', color: '#92400E' }}>conc.</span>}
              </span>
            </button>
          ))}
          {!hits.length && <div style={{ padding: '12px 10px', fontSize: 12.5, color: '#475569' }}>{busy ? 'Searching…' : 'No match. Try “124 big dipper”, a lot like B04-39, an owner’s name or an H-number.'}</div>}
        </div>
      )}
    </div>
  );
}
