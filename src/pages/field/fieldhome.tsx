import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Search, Home, ChevronRight, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/company';
import { fmtDate, type Kind } from '@/lib/inspections';
import LotSource from '@/components/lotsource';

interface Hit { lot_id: string; lot_number: string | null; address: string | null; community: string | null; owner: string | null; enrollment: string | null }
interface Row { id: string; kind: Kind; status: string; address: string | null; started_at: string; completed_at: string | null }

const card: React.CSSProperties = { background: '#F8F6F1', border: '1px solid #D9D2C5', borderRadius: 14, padding: 14 };
const street = (a: string | null) => (a ?? '').replace(/,\s*Ottawa.*$/i, '');

export default function FieldHome() {
  const nav = useNavigate();
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Hit[]>([]); const [busy, setBusy] = useState(false);
  const [lot, setLot] = useState<Hit | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [starting, setStarting] = useState<Kind | null>(null); const [err, setErr] = useState('');
  const [lineCount, setLineCount] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    supabase.from('inspections').select('id,kind,status,address,started_at,completed_at').neq('status', 'cancelled').order('started_at', { ascending: false }).limit(25)
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, []);

  useEffect(() => {
    const t = q.trim(); if (!t) { setHits([]); setBusy(false); return; }
    setBusy(true); const mine = ++seq.current;
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc('warranty_search', { p_q: t, p_limit: 8 });
      if (mine !== seq.current) return; setHits((data ?? []) as Hit[]); setBusy(false);
    }, 160);
    return () => clearTimeout(id);
  }, [q]);

  async function start(kind: Kind) {
    if (!lot) return; setStarting(kind); setErr('');
    try {
      const { data: existing } = await supabase.from('inspections').select('id').eq('lot_id', lot.lot_id).eq('kind', kind).eq('status', 'in_progress').maybeSingle();
      if (existing) { nav(`/field/inspection/${existing.id}`); return; }
      const [{ data: l, error: le }, { data: { user } }, companyId] = await Promise.all([
        supabase.from('warranty_lots').select('address,civic_number,street,enrollment_number,closing_date,homeowner_name,homeowner_first,homeowner_last,owner2_first,owner2_last,homeowner_email,homeowner_email2').eq('id', lot.lot_id).single(),
        supabase.auth.getUser(), getCompanyId(),
      ]);
      if (le || !l) throw le ?? new Error('Lot not found');
      let inspector = '';
      if (user) { const { data: u } = await supabase.from('users').select('first_name,last_name').eq('id', user.id).maybeSingle(); inspector = [u?.first_name, u?.last_name].filter(Boolean).join(' '); }
      const o1 = l.homeowner_name || [l.homeowner_first, l.homeowner_last].filter(Boolean).join(' ');
      const o2 = [l.owner2_first, l.owner2_last].filter(Boolean).join(' ');
      const { data: ins, error } = await supabase.from('inspections').insert({
        company_id: companyId, lot_id: lot.lot_id, kind, inspector_id: user?.id, inspector_name: inspector || user?.email || null,
        address: l.address || [l.civic_number, l.street].filter(Boolean).join(' ') || lot.address, enrolment_no: l.enrollment_number,
        possession_date: l.closing_date, owner_names: [o1, o2].filter(Boolean).join(' and ') || null,
        owner_emails: [l.homeowner_email, l.homeowner_email2].filter(Boolean),
        super_name: localStorage.getItem('bg-super-name'), super_email: localStorage.getItem('bg-super-email'),
      }).select('id').single();
      if (error) throw error;
      nav(`/field/inspection/${ins!.id}`);
    } catch (e: any) { setErr(e.message ?? 'Could not start the inspection'); setStarting(null); }
  }

  const open = rows.filter(r => r.status === 'in_progress'); const done = rows.filter(r => r.status !== 'in_progress');

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
        <button key={h.lot_id} onClick={() => { setLot(h); setQ(street(h.address) || `Lot ${h.lot_number}`); setHits([]); }}
          style={{ ...card, display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', minHeight: 56 }}>
          <Home size={18} color="#3F6A8F" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>{street(h.address) || `Lot ${h.lot_number}`}{h.lot_number ? <span style={{ fontWeight: 500, color: '#485163' }}> · Lot {h.lot_number}</span> : null}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: '#485163' }}>{[h.community, h.owner || 'No purchaser on file'].filter(Boolean).join(' · ')}</span>
          </span>
          <ChevronRight size={18} color="#8D7140" />
        </button>
      ))}
      {!lot && q.trim() && !busy && hits.length === 0 && <div style={{ ...card, color: '#485163', fontSize: 14 }}>No home matches that. Try the lot number or part of the street.</div>}

      {lot && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...card, borderLeft: '4px solid #B08D4F' }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{street(lot.address) || `Lot ${lot.lot_number}`}</div>
            <div style={{ fontSize: 13, color: '#485163' }}>{[lot.community, lot.lot_number ? `Lot ${lot.lot_number}` : '', lot.owner, lot.enrollment].filter(Boolean).join(' · ')}</div>
          </div>
          <LotSource lotId={lot.lot_id} compact onChange={l => setLineCount(l.length)} />
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
        </>
      )}
      <style>{`.spin{animation:sp 0.9s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Section({ title, rows, empty, go }: { title: string; rows: Row[]; empty: string; go: (id: string) => void }) {
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
