/**
 * COMBRYX — Trades Import Page v2
 * Route: /warranty/trades-import
 */

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Upload, CheckCircle2, AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';

const COMPANY_ID = 'c8bd8b99-090d-4379-86cd-95c3844c09f9';

function safeStr(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' || s === 'null' ? null : s;
}

interface TradeRow {
  company_id:     string;
  trade_name:     string;
  trade_type:     string | null;
  address:        string | null;
  city:           string | null;
  province:       string | null;
  postal_code:    string | null;
  contact_person: string | null;
  phone:          string | null;
  cell:           string | null;
  fax:            string | null;
  email:          string | null;
  email2:         string | null;
  notes:          string | null;
  is_internal:    boolean;
  is_active:      boolean;
}

function parseExcel(buffer: ArrayBuffer): TradeRow[] {
  const wb   = XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null, raw: false });

  return rows
    .map(r => {
      const name = safeStr(r['Trade Name']);
      if (!name) return null;
      const tradeType = safeStr(r['Trade Type']) ?? '';
      return {
        company_id:     COMPANY_ID,
        trade_name:     name,
        trade_type:     tradeType || null,
        address:        safeStr(r['Address1']),
        city:           safeStr(r['City']),
        province:       safeStr(r['State/Province']),
        postal_code:    safeStr(r['Post Code']),
        contact_person: safeStr(r['Contact Person']),
        phone:          safeStr(r['Phone Number']),
        cell:           safeStr(r['Cell Number']),
        fax:            safeStr(r['Fax Number']),
        email:          safeStr(r['Email']),
        email2:         safeStr(r['Email2']),
        notes:          safeStr(r['Notes']),
        is_internal:    tradeType.toLowerCase().includes('technician') || tradeType.toLowerCase().includes('inspector'),
        is_active:      true,
      } as TradeRow;
    })
    .filter(Boolean) as TradeRow[];
}

export default function TradesImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [trades,    setTrades]    = useState<TradeRow[]>([]);
  const [filename,  setFilename]  = useState('');
  const [importing, setImporting] = useState(false);
  const [done,      setDone]      = useState(false);
  const [inserted,  setInserted]  = useState(0);
  const [errors,    setErrors]    = useState<string[]>([]);
  const [parseError, setParseError] = useState('');

  const processFile = useCallback((file: File) => {
    setDone(false); setErrors([]); setInserted(0); setParseError('');
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const rows = parseExcel(e.target?.result as ArrayBuffer);
        if (!rows.length) {
          setParseError('No trades found in this file — check it is the QDef trades export.');
          return;
        }
        setTrades(rows);
      } catch (err: any) {
        setParseError(err.message ?? 'Parse failed');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
    e.target.value = '';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const runImport = async () => {
    if (!trades.length) return;
    setImporting(true);
    setErrors([]);
    const errs: string[] = [];
    let count = 0;

    try {
      // Delete existing trades for this company
      const { error: delErr } = await supabase
        .from('trades')
        .delete()
        .eq('company_id', COMPANY_ID);

      if (delErr) {
        errs.push(`Delete failed: ${delErr.message}`);
        setErrors(errs);
        setImporting(false);
        return;
      }

      // Insert in batches of 25
      const BATCH = 25;
      for (let i = 0; i < trades.length; i += BATCH) {
        const batch = trades.slice(i, i + BATCH);
        const { error: insErr, data } = await supabase
          .from('trades')
          .insert(batch)
          .select('id');

        if (insErr) {
          errs.push(`Batch ${Math.floor(i / BATCH) + 1}: ${insErr.message}`);
        } else {
          count += (data?.length ?? batch.length);
        }
      }

      setInserted(count);
      if (!errs.length) setDone(true);
      else setErrors(errs);

    } catch (err: any) {
      setErrors([err.message ?? 'Import failed']);
    }

    setImporting(false);
  };

  const internal = trades.filter(t => t.is_internal).length;
  const external = trades.filter(t => !t.is_internal).length;

  return (
    <div style={{ padding: '28px 36px', maxWidth: 900, fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>Trades import</h1>
        <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Import your QDef trades Excel export. Replaces all existing trades for this company.</p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
        style={{ border: '2px dashed var(--color-border)', borderRadius: 12, padding: trades.length ? '18px 24px' : '44px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 20, background: 'var(--color-panel)', transition: 'border-color 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#5B87AD'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)'; }}
      >
        <Upload size={18} color="var(--color-muted)" style={{ marginBottom: 8 }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 3 }}>
          {filename || 'Drop your Trades Excel file here'}
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          {trades.length ? `${trades.length} trades parsed — ready to import` : 'Exported from QDef → Trades list → Export'}
        </p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} style={{ display: 'none' }} />
      </div>

      {/* Parse error */}
      {parseError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', marginBottom: 16 }}>
          <AlertTriangle size={13} color="#A5402F" />
          <span style={{ fontSize: 12, color: '#A5402F' }}>{parseError}</span>
        </div>
      )}

      {/* Summary + preview */}
      {trades.length > 0 && !done && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total',    value: trades.length, color: 'var(--color-text)' },
              { label: 'External', value: external,      color: '#3F6A8F'            },
              { label: 'Internal', value: internal,      color: '#9A6A16'            },
            ].map(s => (
              <div key={s.label} style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--color-panel)', border: '1px solid var(--color-border)', textAlign: 'center', minWidth: 90 }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontSize: 24, fontWeight: 900, color: s.color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 150px 180px', padding: '9px 16px', background: 'var(--color-mist)', borderBottom: '1px solid var(--color-border)' }}>
              {['Trade name', 'Type', 'Contact', 'Email'].map(h => (
                <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
              ))}
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {trades.slice(0, 30).map((t, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 180px 150px 180px', padding: '10px 16px', borderBottom: i < Math.min(trades.length, 30) - 1 ? '1px solid var(--color-border)' : 'none', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.trade_name}</p>
                    {t.city && <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t.city}{t.province ? ', ' + t.province : ''}</p>}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.trade_type ?? '—'}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.contact_person ?? '—'}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.email ?? '—'}</span>
                </div>
              ))}
              {trades.length > 30 && (
                <p style={{ padding: '8px 16px', fontSize: 10, color: 'var(--color-muted)', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                  Showing 30 of {trades.length} — all will be imported
                </p>
              )}
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', marginBottom: 16 }}>
              {errors.map((e, i) => (
                <p key={i} style={{ fontSize: 11, color: '#A5402F', marginBottom: 2 }}>{e}</p>
              ))}
            </div>
          )}

          <button
            onClick={runImport} disabled={importing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: importing ? 'default' : 'pointer', fontFamily: 'var(--font-body)', color: '#fff', background: importing ? '#6C7280' : '#3F6A8F', border: 'none', opacity: importing ? 0.8 : 1 }}
          >
            {importing
              ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Importing {trades.length} trades…</>
              : <>Import {trades.length} trades <ChevronRight size={14} /></>
            }
          </button>
        </>
      )}

      {/* Done */}
      {done && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 10, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
          <CheckCircle2 size={22} color="#4A7A55" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#4A7A55' }}>{inserted} trades imported successfully</p>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>Trades are now available in the trade dropdown on case items.</p>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}