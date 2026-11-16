// Items for one statutory or service file on a lot (Initial, Mid-Year, Year-End, 2-Year, MSD, Service, legacy PDI).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export const STATUTORY = ['initial', 'mid_year', 'year_end', 'second_year', 'msd', 'pdi'];
export const fileKeyOf = (period: string | null) => (period && STATUTORY.includes(period) ? period : 'service');

interface CaseRow { id: string; case_number: string; status: string; period_type: string | null; opened_at: string | null }
interface Item { id: string; case_id: string; item_number: string | null; room: string | null; description: string | null; owner_description: string | null; status: string; trade_required: string | null; created_at: string; completed_at: string | null }

const ageOf = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const STATE: Record<string, [string, string, string]> = {
  outstanding: ['Open', '#9A6A16', '#F6ECD3'],
  complete: ['Closed', '#4A7A55', '#E8F0E7'],
  not_warranted: ['Not warranted', '#6C7280', '#EFEBE2'],
  duplicate: ['Duplicate', '#6C7280', '#EFEBE2'],
};

export default function LotFileItems({ lotId, fileKey }: { lotId: string; fileKey: string }) {
  const nav = useNavigate();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [show, setShow] = useState<'open' | 'closed' | 'all'>('open');

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: cs } = await supabase.from('cases').select('id,case_number,status,period_type,opened_at').eq('lot_id', lotId).is('deleted_at', null).order('opened_at', { ascending: false });
      const mine = ((cs ?? []) as CaseRow[]).filter(c => fileKeyOf(c.period_type) === fileKey);
      if (!live) return;
      setCases(mine);
      if (!mine.length) { setItems([]); return; }
      const { data: it } = await supabase.from('warranty_items').select('id,case_id,item_number,room,description,owner_description,status,trade_required,created_at,completed_at').in('case_id', mine.map(c => c.id)).is('deleted_at', null).order('created_at');
      if (live) setItems((it ?? []) as Item[]);
    })();
    return () => { live = false; };
  }, [lotId, fileKey]);

  const counts = useMemo(() => ({ open: items.filter(i => i.status === 'outstanding').length, closed: items.filter(i => i.status === 'complete').length, all: items.length }), [items]);
  const shown = items.filter(i => show === 'all' || (show === 'open' ? i.status === 'outstanding' : i.status !== 'outstanding'));

  if (!cases) return <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading…</div>;
  if (!cases.length) return (
    <div style={{ padding: 36, textAlign: 'center', background: 'var(--color-panel)', borderRadius: 10, border: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: 13 }}>
      Nothing has been filed here for this home yet.
    </div>
  );

  const chip = (k: 'open' | 'closed' | 'all', label: string) => (
    <button key={k} onClick={() => setShow(k)} style={{ height: 32, padding: '0 14px', borderRadius: 16, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--color-border-hard)', background: show === k ? '#1B2A41' : '#fff', color: show === k ? '#fff' : 'var(--color-text)' }}>{label} {counts[k]}</button>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {chip('open', 'Open')}{chip('closed', 'Closed')}{chip('all', 'All')}
        <span style={{ flex: 1 }} />
        {cases.map(c => (
          <button key={c.id} onClick={() => nav(`/warranty/cases/${c.id}`)} style={{ height: 32, padding: '0 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--color-border-hard)', background: '#EFEBE2', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Open case {c.case_number} <ChevronRight size={13} />
          </button>
        ))}
      </div>
      {!shown.length ? (
        <div style={{ padding: 28, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, background: 'var(--color-panel)', borderRadius: 10, border: '1px solid var(--color-border)' }}>
          {show === 'open' ? 'No open items. Everything in this file is closed.' : 'No items to show.'}
        </div>
      ) : (
        <div style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
          {shown.map((i, n) => {
            const [label, color, bg] = STATE[i.status] ?? [i.status, '#6C7280', '#EFEBE2'];
            const text = i.description || i.owner_description || '—';
            const age = i.status === 'outstanding' ? ageOf(i.created_at) : null;
            return (
              <div key={i.id} onClick={() => nav(`/warranty/cases/${i.case_id}`)} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', borderTop: n ? '1px solid var(--color-border)' : 'none', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14 }}>{i.room ? <b>{i.room}: </b> : null}{text}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginTop: 2 }}>
                    {[i.item_number ? `Item ${i.item_number}` : '', i.trade_required, i.completed_at ? `Closed ${fmt(i.completed_at)}` : ''].filter(Boolean).join('  ·  ')}
                  </div>
                </div>
                {age !== null && <span style={{ fontSize: 12, fontWeight: 700, color: age > 90 ? '#A5402F' : age > 30 ? '#9A6A16' : 'var(--color-text-sub)', whiteSpace: 'nowrap', paddingTop: 3 }}>{age} days</span>}
                <span style={{ fontWeight: 700, fontSize: 12, color, background: bg, borderRadius: 8, padding: '3px 9px', whiteSpace: 'nowrap' }}>{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
