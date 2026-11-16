// Work Orders page panel: every work order sent through the portal, what the trade and owner said, and the end-of-day check button.
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check, Send, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { WO_COLS, statusOf, tradeLink, ownerLink, type WOFull } from '@/components/sendworkorder';

type Row = WOFull & { address: string | null; visit_check_sent_at: string | null; visit_reminder_sent_at: string | null; visit_escalated_at: string | null };
type Result = { eod: { checked: number; emailed: number; needsManualSend: number }; sweep: { reminded: number; escalated: number; noShowNotified: number }; errors: string[] } | { error: string };

const TONE: Record<string, { c: string; bg: string }> = {
  ok: { c: '#4A7A55', bg: 'rgba(74,122,85,0.10)' },
  warn: { c: '#9A6A16', bg: 'rgba(154,106,22,0.10)' },
  bad: { c: '#A5402F', bg: 'rgba(165,64,47,0.10)' },
  idle: { c: '#6C7280', bg: 'rgba(108,114,128,0.10)' },
};
const yn = (v: boolean | null, yes: string, no: string, none: string) => v === true ? { t: yes, tone: 'ok' } : v === false ? { t: no, tone: 'bad' } : { t: none, tone: 'idle' };
const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '';

function Chip({ text, tone }: { text: string; tone: string }) {
  const t = TONE[tone] ?? TONE.idle;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: t.c, background: t.bg, whiteSpace: 'nowrap' }}>{text}</span>;
}

function CopyBtn({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { window.prompt('Copy this link', text); } }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '4px 9px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
      {done ? <Check size={10} /> : <Copy size={10} />} {done ? 'Copied' : label}
    </button>
  );
}

export function VisitChecksPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('work_orders').select(WO_COLS + ',address,visit_check_sent_at,visit_reminder_sent_at,visit_escalated_at')
      .not('portal_sent_at', 'is', null).order('portal_sent_at', { ascending: false }).limit(60);
    setRows((data ?? []) as unknown as Row[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runChecks() {
    setBusy(true); setResult(null);
    const { data, error } = await supabase.functions.invoke('visit-followup', { body: { mode: 'all' } });
    setResult(error ? { error: error.message } : (data as Result));
    setBusy(false); load();
  }

  const needsAttention = rows.filter(r => r.status === 'no_show' || (r.owner_attended === true && r.owner_satisfied === false) || r.visit_escalated_at || r.response === 'reschedule_requested').length;
  const awaiting = rows.filter(r => r.status === 'scheduled' && !r.visit_check_sent_at).length;

  return (
    <div style={{ borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
        <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)', padding: 0 }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Visit checks
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{rows.length} sent{awaiting ? ` · ${awaiting} accepted, check not yet sent` : ''}</span>
        {needsAttention > 0 && <Chip text={`${needsAttention} need attention`} tone="bad" />}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={load} title="Refresh" style={{ padding: '6px 9px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}><RefreshCw size={11} /></button>
          <button onClick={runChecks} disabled={busy}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, background: '#3F6A8F', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
            <Send size={11} /> {busy ? 'Sending…' : 'Send end-of-day checks now'}
          </button>
        </span>
      </div>

      {result && (
        <div style={{ margin: '0 16px 12px', padding: '10px 12px', borderRadius: 8, fontSize: 11, lineHeight: 1.5, background: 'error' in result ? 'rgba(165,64,47,0.08)' : 'rgba(74,122,85,0.08)', color: 'error' in result ? '#A5402F' : '#2F5A3A' }}>
          {'error' in result ? result.error : (
            <>
              Checked {result.eod.checked} visit{result.eod.checked === 1 ? '' : 's'}, {result.eod.emailed} email{result.eod.emailed === 1 ? '' : 's'} sent.
              {result.sweep.reminded ? ` ${result.sweep.reminded} reminder${result.sweep.reminded === 1 ? '' : 's'}.` : ''}
              {result.sweep.escalated ? ` ${result.sweep.escalated} escalated to the office.` : ''}
              {result.sweep.noShowNotified ? ` ${result.sweep.noShowNotified} no-show notice${result.sweep.noShowNotified === 1 ? '' : 's'} sent.` : ''}
              {result.eod.needsManualSend ? ` ${result.eod.needsManualSend} could not be emailed (email is not set up or an address is missing). Copy the links below and send them yourself.` : ''}
              {result.errors.length ? ` Errors: ${result.errors.join('; ')}` : ''}
            </>
          )}
        </div>
      )}

      {open && (rows.length === 0
        ? <p style={{ padding: '4px 16px 16px', fontSize: 12, color: 'var(--color-muted)' }}>Nothing sent yet. Open an item, go to Trade &amp; work order, and create a link.</p>
        : (
          <div style={{ padding: '0 16px 14px', display: 'grid', gap: 8 }}>
            {rows.map(r => {
              const s = statusOf(r);
              const trade = yn(r.trade_attended, 'Trade attended', 'Trade did not attend', 'Trade: no answer');
              const owner = yn(r.owner_attended, 'Owner: they came', 'Owner: nobody came', 'Owner: no answer');
              const sat = r.owner_attended === true ? yn(r.owner_satisfied, 'Satisfied', 'Not satisfied', '') : null;
              const visited = r.visit_check_sent_at != null;
              return (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,2fr) auto', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.issue}</p>
                    <p style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.recipient_name ?? 'Unassigned'}{r.address ? ` · ${r.address}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <Chip text={s.text} tone={s.tone} />
                    {visited && <Chip text={trade.t} tone={trade.tone} />}
                    {visited && <Chip text={owner.t} tone={owner.tone} />}
                    {visited && sat && sat.t && <Chip text={sat.t} tone={sat.tone} />}
                    {visited && !r.trade_attended && !r.owner_attended && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>check sent {when(r.visit_check_sent_at)}{r.visit_reminder_sent_at ? `, reminded ${when(r.visit_reminder_sent_at)}` : ''}</span>}
                    {r.owner_comment && <span style={{ fontSize: 10, color: 'var(--color-text)', fontStyle: 'italic' }}>“{r.owner_comment}”</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <CopyBtn label="Trade link" text={tradeLink(r)} />
                    <CopyBtn label="Owner link" text={ownerLink(r)} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
