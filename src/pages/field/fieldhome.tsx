import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Search, Home, ChevronRight, ShieldCheck, Loader2, WifiOff, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCompanyId, getMe } from '@/lib/company';
import { fmtDate, type Kind } from '@/lib/inspections';
import { cacheLot, createInspection, dropLot, getCachedLot, getInsp, listCachedLots, listInspections, useLocal, useSyncStatus } from '@/lib/offline';
import LotSource from '@/components/lotsource';

interface Hit { lot_id: string; lot_number: string | null; address: string | null; community: string | null; owner: string | null; enrollment: string | null }

const card: React.CSSProperties = { background: '#F8F6F1', border: '1px solid #D9D2C5', borderRadius: 14, padding: 14 };
const street = (a: string | null) => (a ?? '').replace(/,\s*Ottawa.*$/i, '');

export default function FieldHome() {
  const nav = useNavigate(); const sync = useSyncStatus();
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Hit[]>([]); const [busy, setBusy] = useState(false);
  const [lot, setLot] = useState<Hit | null>(null);
  const [starting, setStarting] = useState<Kind | null>(null); const [err, setErr] = useState('');
  const [lineCount, setLineCount] = useState(0);
  const seq = useRef(0);
  const [rows] = useLocal(() => listInspections(), []);
  const [cached] = useLocal(() => listCachedLots(), []);

  // Bring in inspections started on another device (online only).
  useEffect(() => {
    if (!navigator.onLine) return;
    supabase.from('inspections').select('id').neq('status', 'cancelled').order('started_at', { ascending: false }).limit(25).then(async ({ data }) => {
      const have = new Set((await listInspections()).map(i => i.id));
      for (const r of (data ?? []).filter(r => !have.has(r.id)).slice(0, 8)) await getInsp(r.id);
    });
  }, []);

  useEffect(() => {
    const t = q.trim(); if (!t) { setHits([]); setBusy(false); return; }
    setBusy(true); const mine = ++seq.current;
    const id = setTimeout(async () => {
      let found: Hit[] = [];
      if (navigator.onLine) { const { data, error } = await supabase.rpc('warranty_search', { p_q: t, p_limit: 8 }); if (!error) found = (data ?? []) as Hit[]; }
      if (!found.length) { const n = t.toLowerCase().replace(/\s+/g, ''); found = (await listCachedLots()).map(c => c.hit as Hit).filter(h => [h.address, h.lot_number, h.owner, h.enrollment, h.community].join(' ').toLowerCase().replace(/\s+/g, '').includes(n)).slice(0, 8); }
      if (mine !== seq.current) return; setHits(found); setBusy(false);
    }, 160);
    return () => clearTimeout(id);
  }, [q]);

  async function pick(h: Hit) {
    setLot(h); setQ(street(h.address) || `Lot ${h.lot_number}`); setHits([]);
    const c = await cacheLot(h as any); if (c) setLineCount(c.lines.length); else setLineCount((await getCachedLot(h.lot_id))?.lines.length ?? 0);
  }

  async function start(kind: Kind) {
    if (!lot) return; setStarting(kind); setErr('');
    try {
      const existing = (await listInspections()).find(i => i.lot_id === lot.lot_id && i.kind === kind && i.status === 'in_progress');
      if (existing) { nav(`/field/inspection/${existing.id}`); return; }
      const c = (await getCachedLot(lot.lot_id)) ?? (await cacheLot(lot as any));
      if (!c?.detail) throw new Error('This home has not been downloaded yet. Connect once to download it, then it works without signal.');
      const l = c.detail; const [companyId, me] = await Promise.all([getCompanyId(), getMe()]);
      const o1 = l.homeowner_name || [l.homeowner_first, l.homeowner_last].filter(Boolean).join(' ');
      const o2 = [l.owner2_first, l.owner2_last].filter(Boolean).join(' ');
      const ins = await createInspection({
        company_id: companyId, lot_id: lot.lot_id, kind, inspector_id: me.id, inspector_name: me.name,
        address: l.address || [l.civic_number, l.street].filter(Boolean).join(' ') || lot.address, enrolment_no: l.enrollment_number,
        possession_date: l.possession_date || l.closing_date, owner_names: [o1, o2].filter(Boolean).join(' and ') || null,
        owner_emails: [l.homeowner_email, l.homeowner_email2].filter(Boolean),
        super_name: localStorage.getItem('bg-super-name'), super_email: localStorage.getItem('bg-super-email'),
      } as any);
      nav(`/field/inspection/${ins.id}`);
    } catch (e: any) { setErr(e.message ?? 'Could not start the inspection'); setStarting(null); }
  }

  const open = (rows ?? []).filter(r => r.status === 'in_progress'); const done = (rows ?? []).filter(r => r.status !== 'in_progress').slice(0, 10);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <h1 style={{ margin: '4px 0 2px', fontSize: 22, fontWeight: 800, color: '#1B2A41' }}>Start an inspection</h1>
        <div style={{ fontSize: 13.5, color: '#485163' }}>Find the home by lot, block-lot (B04-39), street or owner.</div>
      </div>

      <div style={{ position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: 13, top: 15, color: '#6C7280' }} />
        <input value={q} onChange={e => { setQ(e.target.value); setLot(null); }} placeholder="Lot, address or owner" aria-label="Search homes" autoCapitalize="none"
          style={{ width: '100%', height: 48, borderRadius: 12, border: '1px solid #B9AF9B', background: '#fff', padding: '0 14px 0 40px', font: '600 16px var(--font-body)', color: '#1F2A3C', boxSizing: 'border-box' }} />
        {busy && <Loader2 size={16} className="spin" style={{ position: 'absolute', right: 14, top: 16, color: '#6C7280' }} />}
      </div>

      {!lot && q.trim() && hits.map(h => (
        <button key={h.lot_id} onClick={() => pick(h)} style={{ ...card, display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', minHeight: 56 }}>
          <Home size={18} color="#3F6A8F" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>{street(h.address) || `Lot ${h.lot_number}`}{h.lot_number ? <span style={{ fontWeight: 500, color: '#485163' }}> · Lot {h.lot_number}</span> : null}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: '#485163' }}>{[h.community, h.owner || 'No purchaser on file'].filter(Boolean).join(' · ')}</span>
          </span>
          <ChevronRight size={18} color="#8D7140" />
        </button>
      ))}
      {!lot && q.trim() && !busy && hits.length === 0 && <div style={{ ...card, color: '#485163', fontSize: 14 }}>{sync.online ? 'No home matches that. Try the lot number or part of the street.' : 'No signal. Only homes already saved on this phone can be searched.'}</div>}

      {lot && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...card, borderLeft: '4px solid #B08D4F' }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{street(lot.address) || `Lot ${lot.lot_number}`}</div>
            <div style={{ fontSize: 13, color: '#485163' }}>{[lot.community, lot.lot_number ? `Lot ${lot.lot_number}` : '', lot.owner, lot.enrollment].filter(Boolean).join(' · ')}</div>
            <div style={{ fontSize: 12.5, color: '#4A7A55', fontWeight: 700, marginTop: 6 }}>Saved on this phone for working without signal</div>
          </div>
          {sync.online ? <LotSource lotId={lot.lot_id} compact onChange={l => { setLineCount(l.length); cacheLot(lot as any); }} />
            : <div style={{ ...card, fontSize: 13.5, color: '#485163', display: 'flex', gap: 8, alignItems: 'center' }}><WifiOff size={16} /> {lineCount} site instruction line{lineCount === 1 ? '' : 's'} saved on this phone.</div>}
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
            <button disabled={!!starting} onClick={() => start('qci')} style={{ minHeight: 72, borderRadius: 12, border: 'none', background: '#1B2A41', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center', padding: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardCheck size={19} />{starting === 'qci' ? 'Starting…' : 'Start QCI'}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#D9CFB8' }}>{lineCount ? `${lineCount} lines to check` : 'Quality check'}</span>
            </button>
            <button disabled={!!starting} onClick={() => start('pdi')} style={{ minHeight: 72, borderRadius: 12, border: 'none', background: 'linear-gradient(180deg,#B8975A,#8D7140)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center', padding: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={19} />{starting === 'pdi' ? 'Starting…' : 'Start PDI'}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#F4EBD6' }}>With the owner</span>
            </button>
          </div>
          {err && <div style={{ color: '#A5402F', fontSize: 13.5 }}>{err}</div>}
        </div>
      )}

      {!lot && !q.trim() && (
        <>
          <Section title="In progress" rows={open} empty="Nothing in progress." go={id => nav(`/field/inspection/${id}`)} />
          <Section title="Recently signed" rows={done} empty="" go={id => nav(`/field/inspection/${id}`)} />
          {!!cached?.length && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#1B2A41', margin: '6px 2px 4px' }}>Homes saved for working offline</div>
              <div style={{ fontSize: 12.5, color: '#485163', margin: '0 2px 8px' }}>Search for a home while you have signal and it is saved here automatically.</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {cached.map(c => (
                  <div key={c.lot_id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
                    <button onClick={() => pick(c.hit as Hit)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', fontFamily: 'inherit', cursor: 'pointer', minHeight: 44 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }}>{street(c.hit.address) || `Lot ${c.hit.lot_number}`}</span>
                      <span style={{ display: 'block', fontSize: 12, color: '#485163' }}>{[c.hit.community, `${c.lines.length} lines`].filter(Boolean).join(' · ')}</span>
                    </button>
                    <button onClick={() => dropLot(c.lot_id)} aria-label="Remove from this phone" style={{ border: 'none', background: 'none', color: '#8D96A6', padding: 10, cursor: 'pointer' }}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <style>{`.spin{animation:sp 0.9s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Section({ title, rows, empty, go }: { title: string; rows: { id: string; kind: Kind; status: string; address: string | null; started_at: string; completed_at: string | null }[]; empty: string; go: (id: string) => void }) {
  if (!rows.length && !empty) return null;
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#1B2A41', margin: '6px 2px 8px' }}>{title}</div>
      {!rows.length && <div style={{ fontSize: 13.5, color: '#6C7280', padding: '0 2px' }}>{empty}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(r => (
          <button key={r.id} onClick={() => go(r.id)} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', minHeight: 56 }}>
            <span style={{ fontWeight: 800, fontSize: 12, color: '#fff', background: r.kind === 'pdi' ? '#8D7140' : '#1B2A41', borderRadius: 6, padding: '3px 8px' }}>{r.kind.toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }}>{street(r.address) || 'Home'}</span>
              <span style={{ display: 'block', fontSize: 12, color: '#485163' }}>{r.status === 'in_progress' ? 'Started ' + fmtDate(r.started_at) : (r.status === 'sent' ? 'Sent ' : 'Signed ') + fmtDate(r.completed_at)}</span>
            </span>
            <ChevronRight size={18} color="#8D7140" />
          </button>
        ))}
      </div>
    </div>
  );
}
