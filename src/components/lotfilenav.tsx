// Strip shown on a case page: the home it belongs to, and a jump to each of the home's other files.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fileKeyOf } from '@/components/lotfileitems';

interface FileSummary { key: string; open: number; closed: number; other: number; cases: { id: string }[]; inspections: number }

const LABELS: [string, string][] = [
  ['service', 'Service'], ['pdi', 'PDI'], ['qci', 'QCI'], ['initial', 'Initial'], ['mid_year', 'Mid-Year'],
  ['year_end', '1-Year'], ['second_year', '2-Year'], ['msd', 'MSD'], ['work_orders', 'Work orders'],
];

export default function LotFileNav({ lotId, caseId, periodType }: { lotId: string; caseId: string; periodType: string | null }) {
  const nav = useNavigate();
  const [addr, setAddr] = useState('');
  const [files, setFiles] = useState<FileSummary[]>([]);
  const current = fileKeyOf(periodType);

  useEffect(() => {
    let live = true;
    (async () => {
      const [lot, sum] = await Promise.all([
        supabase.from('warranty_lots').select('lot_number, address, civic_number, street').eq('id', lotId).maybeSingle(),
        supabase.rpc('lot_file_summary', { p_lot: lotId }),
      ]);
      if (!live) return;
      const l: any = lot.data;
      if (l) setAddr((l.address ?? `${l.civic_number ?? ''} ${l.street ?? ''}`).trim() || `Lot ${l.lot_number}`);
      setFiles(((sum.data as any)?.files ?? []) as FileSummary[]);
    })();
    return () => { live = false; };
  }, [lotId]);

  const go = (key: string) => {
    const f = files.find(x => x.key === key);
    if (f && f.cases.length === 1 && key !== 'qci' && key !== 'pdi' && key !== 'work_orders') nav(`/warranty/cases/${f.cases[0].id}`);
    else nav(`/warranty/lots/${lotId}?file=${key}`);
  };

  const chips = LABELS.filter(([k]) => {
    const f = files.find(x => x.key === k);
    return k === current || (f && (f.open + f.closed + f.other > 0 || f.cases.length > 0 || f.inspections > 0));
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)', flexShrink: 0, flexWrap: 'wrap' }}>
      <button onClick={() => nav(`/warranty/lots/${lotId}`)} title="Owner's file" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#EFEBE2', color: 'var(--color-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        <Home size={13} /> {addr ? `${addr} · Owner's file` : "Owner's file"}
      </button>
      <span style={{ width: 1, height: 18, background: 'var(--color-border)' }} />
      {chips.map(([k, label]) => {
        const f = files.find(x => x.key === k);
        const on = k === current;
        return (
          <button key={k} onClick={() => (on ? undefined : go(k))} aria-current={on ? 'page' : undefined}
            style={{ height: 30, padding: '0 12px', borderRadius: 100, fontSize: 12.5, fontWeight: on ? 800 : 600, cursor: on ? 'default' : 'pointer', fontFamily: 'inherit',
              border: `1px solid ${on ? '#B08D4F' : 'var(--color-border)'}`, background: on ? 'rgba(176,141,79,0.18)' : 'transparent', color: on ? 'var(--color-text)' : 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {label}
            {f && f.open > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#9A6A16' }}>{f.open}</span>}
          </button>
        );
      })}
    </div>
  );
}
