// Automatic AI triage for a warranty item: runs when the item is opened, attaches the applicable OBC / Tarion CPG sections.
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles, ShieldAlert, BookOpen, Camera, Scale } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Assessment {
  category?: string; finding?: string;
  obc?: { sections?: string[]; interpretation?: string; tolerance?: string; mandatory?: boolean };
  cpg?: { sections?: string[]; interpretation?: string; threshold?: string };
  responsibility?: { determination?: string; reasoning?: string; exceptions?: string[] | string };
  defense_language?: string; risk_level?: string; risk_reasoning?: string;
  recommended_evidence?: string[]; warranty_period?: string; confidence?: string; check_notes?: string[];
  _cached?: boolean; _obc_found?: number; _cpg_found?: number; error?: string;
}

const memo = new Map<string, Assessment>();
const RISK: Record<string, { bg: string; fg: string }> = {
  low: { bg: '#ECFDF3', fg: '#4A7A55' }, medium: { bg: '#F6ECD3', fg: '#B45309' },
  high: { bg: '#FEECEC', fg: '#A5402F' }, critical: { bg: '#FEECEC', fg: '#A5402F' },
};
const list = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
const label: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5E6575', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 };
const body: React.CSSProperties = { fontSize: 12, lineHeight: 1.55, color: '#1F2A3C' };

export function ItemAssessment({ itemId, description, room }: { itemId: string; description: string; room: string | null }) {
  const [a, setA] = useState<Assessment | null>(memo.get(itemId) ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-run skips the saved answer and uses the larger model.
  const run = useCallback(async (again = false) => {
    setBusy(true); setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('interpret-warranty-item', { body: { description, room, item_id: itemId, force: again, deep: again } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      memo.set(itemId, data as Assessment); setA(data as Assessment);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }, [itemId, description, room]);

  useEffect(() => { if (!memo.has(itemId) && description?.trim()) run(false); }, [itemId, description, run]);

  const risk = RISK[(a?.risk_level ?? '').toLowerCase()] ?? { bg: '#EFEBE2', fg: '#485163' };
  const resp = a?.responsibility;

  return (
    <div style={{ marginBottom: 14, borderRadius: 10, border: '1px solid #D6E2F5', background: 'linear-gradient(180deg,#EDF2F6,#FFFFFF)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: a || busy ? 10 : 0 }}>
        <Sparkles size={14} color="#2F5576" />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#1F2A3C' }}>AI assessment</span>
        {a?.category && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#E6EEFB', color: '#2F5576' }}>{a.category}</span>}
        {a?.confidence && <span title="How sure the assessment is" style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#EFEBE2', color: '#485163' }}>{a.confidence} confidence</span>}
        {a?.risk_level && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: risk.bg, color: risk.fg }}>{a.risk_level} risk</span>}
        <button onClick={() => run(true)} disabled={busy} title="Re-run with the deeper model" style={{ marginLeft: 'auto', border: 0, background: 'transparent', cursor: busy ? 'wait' : 'pointer', color: '#5E6575', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'inherit' }}>
          <RefreshCw size={12} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} />{busy ? 'Assessing…' : 'Re-run'}
        </button>
      </div>

      {err && <div style={{ ...body, color: '#A5402F' }}>Could not assess this item: {err}</div>}
      {busy && !a && <div style={{ ...body, color: '#5E6575' }}>Checking the description against the Ontario Building Code and the Tarion Construction Performance Guidelines…</div>}

      {a && (
        <div style={{ display: 'grid', gap: 12 }}>
          {a.finding && <div style={{ ...body, fontWeight: 600 }}>{a.finding}</div>}
          {list(a.check_notes).map(n => <div key={n} style={{ ...body, background: '#FEECEC', border: '1px solid #E7B9B0', color: '#A5402F', borderRadius: 6, padding: '6px 10px' }}>{n}</div>)}

          {resp?.determination && (
            <div>
              <div style={label}><Scale size={11} />Likely responsibility</div>
              <div style={{ ...body, fontWeight: 700 }}>{resp.determination}</div>
              {resp.reasoning && <div style={{ ...body, color: '#2F394A', marginTop: 2 }}>{resp.reasoning}</div>}
              {list(resp.exceptions).length > 0 && <div style={{ ...body, color: '#5E6575', marginTop: 2 }}>Exceptions: {list(resp.exceptions).join('; ')}</div>}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>
            <div style={{ background: '#fff', border: '1px solid #DDD6C9', borderRadius: 8, padding: 10 }}>
              <div style={label}><BookOpen size={11} />Tarion CPG</div>
              {list(a.cpg?.sections).length ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>{list(a.cpg?.sections).map(s => <span key={s} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#F6ECD3', color: '#B45309' }}>{s}</span>)}</div> : <div style={{ ...body, color: '#5E6575' }}>No matching CPG section.</div>}
              {a.cpg?.interpretation && <div style={body}>{a.cpg.interpretation}</div>}
              {a.cpg?.threshold && <div style={{ ...body, color: '#2F394A', marginTop: 3 }}><b>Threshold:</b> {a.cpg.threshold}</div>}
            </div>
            <div style={{ background: '#fff', border: '1px solid #DDD6C9', borderRadius: 8, padding: 10 }}>
              <div style={label}><BookOpen size={11} />Ontario Building Code</div>
              {list(a.obc?.sections).length ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>{list(a.obc?.sections).map(s => <span key={s} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#E6EEFB', color: '#2F5576' }}>{s}</span>)}</div> : <div style={{ ...body, color: '#5E6575' }}>No matching OBC section.</div>}
              {a.obc?.interpretation && <div style={body}>{a.obc.interpretation}</div>}
              {a.obc?.tolerance && <div style={{ ...body, color: '#2F394A', marginTop: 3 }}><b>Tolerance:</b> {a.obc.tolerance}</div>}
            </div>
          </div>

          {a.risk_reasoning && <div><div style={label}><ShieldAlert size={11} />Risk</div><div style={body}>{a.risk_reasoning}</div></div>}
          {a.defense_language && <div><div style={label}>Suggested position</div><div style={{ ...body, fontStyle: 'italic', color: '#2F394A' }}>{a.defense_language}</div></div>}
          {list(a.recommended_evidence).length > 0 && (
            <div><div style={label}><Camera size={11} />Evidence to capture</div>
              <ul style={{ ...body, margin: 0, paddingLeft: 16 }}>{list(a.recommended_evidence).map((e, i) => <li key={i}>{e}</li>)}</ul></div>
          )}
          <div style={{ fontSize: 10, color: '#94A3B8' }}>{a.warranty_period ? `Warranty period: ${a.warranty_period} · ` : ''}AI triage from the code text{a._cached ? ' (saved result)' : ''}. Confirm before relying on it.</div>
        </div>
      )}
    </div>
  );
}
