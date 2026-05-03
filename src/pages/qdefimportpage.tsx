/**
 * COMBRYX — QDef Purchaser Import Page  v2
 * Route: /warranty/qdef-import
 *
 * Drop all 9 community CSVs at once.
 * Community is auto-detected from the filename:
 *   bridlewood_trails.csv    → Bridlewood Trails
 *   copperwood.csv           → Copperwood
 *   iron_valley.csv          → Iron Valley
 *   lillythorne.csv          → Lilythorne
 *   rivers_edge.csv          → River's Edge
 *   spring_valley_trails.csv → Spring Valley Trails
 *   sundance.csv             → Sundance
 *   watters_pointe.csv       → Watters' Pointe
 *   westwood.csv             → Westwood
 *
 * Each file previews independently — click a row to expand.
 * "Import all" upserts on (community_id, lot_number) — safe to re-run.
 */

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Upload, CheckCircle2, AlertTriangle, RefreshCw,
  FileText, X, Home, ChevronRight, AlertCircle,
} from 'lucide-react';

// ─── Community registry ─────────────────────────────────────────────────────
// Keyword → Supabase community row
// Update IDs to match your actual warranty_communities table

const COMMUNITIES: Record<string, { id: string; name: string }> = {
  bridlewood:   { id: '75fa72fe-332f-4dca-afbb-c2968c9d5594', name: 'Bridlewood Trails'    },
  copperwood:   { id: 'a390c161-78ae-4045-b545-3deb7e49cba0', name: 'Copperwood'            },
  iron_valley:  { id: 'd2dd2755-a598-4b42-bcfe-1af4a742a5f6', name: 'Iron Valley'           },
  lillythorne:  { id: '74fd3c76-8692-4988-a190-9283a3cd3566', name: 'Lilythorne'            },
  lilythorne:   { id: '74fd3c76-8692-4988-a190-9283a3cd3566', name: 'Lilythorne'            },
  rivers_edge:  { id: '2f24cdcb-87dc-4a5b-82a8-bb1cc704c6c3', name: "River's Edge"          },
  spring_valley:{ id: '43f0c1af-0a9f-4155-aee5-f23f33970fa6', name: 'Spring Valley Trails'  },
  sundance:     { id: '8ebfe175-35bb-4505-ba5e-6f19826ada9f', name: 'Sundance'              },
  watters:      { id: 'ce14b818-68a4-4357-add4-12baea2236c0', name: "Watters' Pointe"       },
  westwood:     { id: 'e1981d6e-fcf5-4d28-82f4-7e0932e9d0f4', name: 'Westwood'             },
};

const COMPANY_ID = 'c8bd8b99-090d-4379-86cd-95c3844c09f9';

function detectCommunity(filename: string): { id: string; name: string } | null {
  const base = filename.toLowerCase().replace(/\.(csv|xlsx?)$/i, '').replace(/[-\s]/g, '_');
  for (const [key, val] of Object.entries(COMMUNITIES)) {
    if (base.includes(key)) return val;
  }
  return null;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParsedLot {
  lot_number: string; model: string | null;
  first_name: string | null; last_name: string | null;
  first_name2: string | null; last_name2: string | null;
  homeowner_name: string | null;
  civic_number: string | null; street: string | null;
  city: string | null; province: string | null; postal_code: string | null;
  address: string | null;
  phone_primary: string | null; phone_secondary: string | null; phone_tertiary: string | null;
  email: string | null; email2: string | null;
  enrollment_number: string | null; closing_date: string | null;
  notes: string | null; is_assigned: boolean;
}

type FileStatus = 'pending' | 'importing' | 'done' | 'error' | 'unrecognized';

interface FileEntry {
  file: File; filename: string;
  community: { id: string; name: string } | null;
  lots: ParsedLot[]; parseError: string | null;
  status: FileStatus;
  inserted: number; updated: number; errors: string[];
}

// ─── CSV parser ─────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur); return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? '').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

function mapRow(row: Record<string, string>): ParsedLot {
  const g = (...keys: string[]) => { for (const k of keys) { const v = row[k]?.trim(); if (v) return v; } return null; };
  const fn = g('First Name'), ln = g('Last Name');
  const fn2 = g('First Name2'), ln2 = g('Last Name2');
  const num = g('Number'), street = g('Street'), city = g('City'), prov = g('State/Province'), postal = g('Zip Postal');
  const closingRaw = g('Clsoing', 'Closing');
  let closingDate: string | null = null;
  if (closingRaw) { const m = closingRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) closingDate = `${m[3]}-${m[2]}-${m[1]}`; }
  const homeownerName = [fn, ln].filter(Boolean).join(' ') || null;
  const address = num && street ? `${num} ${street}${city ? ', '+city : ''}${prov ? ', '+prov : ''}` : null;
  return {
    lot_number: g('Unit/Lot') ?? '', model: g('Model'),
    first_name: fn, last_name: ln, first_name2: fn2, last_name2: ln2,
    homeowner_name: homeownerName, civic_number: num, street, city, province: prov, postal_code: postal, address,
    phone_primary: g('Primary Phone'), phone_secondary: g('Primary Phone2'), phone_tertiary: g('Secondary Phone'),
    email: g('Email'), email2: g('Email2'), enrollment_number: g('Enrollment'),
    closing_date: closingDate, notes: g('Notes'), is_assigned: !!(fn || ln || g('Email')),
  };
}

// ─── Supabase upsert ─────────────────────────────────────────────────────────

async function importLots(communityId: string, lots: ParsedLot[]) {
  const result = { inserted: 0, updated: 0, errors: [] as string[] };
  const { data: existing } = await supabase.from('warranty_lots').select('lot_number').eq('community_id', communityId);
  const existingSet = new Set((existing ?? []).map((e: { lot_number: string }) => e.lot_number));
  const BATCH = 50;
  for (let i = 0; i < lots.length; i += BATCH) {
    const batch = lots.slice(i, i + BATCH);
    const rows = batch.map(lot => ({
      company_id: COMPANY_ID, community_id: communityId,
      lot_number: lot.lot_number, model: lot.model,
      address: lot.address, civic_number: lot.civic_number,
      street: lot.street, city: lot.city, province: lot.province, postal_code: lot.postal_code,
      homeowner_name: lot.homeowner_name, homeowner_first: lot.first_name, homeowner_last: lot.last_name,
      owner2_first: lot.first_name2, owner2_last: lot.last_name2,
      homeowner_email: lot.email, homeowner_email2: lot.email2,
      phone_primary: lot.phone_primary, phone_secondary: lot.phone_secondary, phone_tertiary: lot.phone_tertiary,
      enrollment_number: lot.enrollment_number, closing_date: lot.closing_date,
      notes: lot.notes, is_assigned: lot.is_assigned, qdef_imported_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('warranty_lots').upsert(rows, { onConflict: 'community_id,lot_number', ignoreDuplicates: false });
    if (error) { result.errors.push(`Batch ${Math.floor(i/BATCH)+1}: ${error.message}`); }
    else { batch.forEach(lot => { if (existingSet.has(lot.lot_number)) result.updated++; else result.inserted++; }); }
  }
  return result;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function QDefImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const processFiles = useCallback((files: File[]) => {
    files.filter(f => f.name.toLowerCase().endsWith('.csv')).forEach(file => {
      const community = detectCommunity(file.name);
      const reader = new FileReader();
      reader.onload = e => {
        let lots: ParsedLot[] = []; let parseError: string | null = null;
        let status: FileStatus = community ? 'pending' : 'unrecognized';
        try {
          lots = parseCSV(e.target?.result as string).map(mapRow).filter(l => l.lot_number);
          if (!lots.length) { parseError = 'No lot rows found.'; status = 'error'; }
        } catch (err: any) { parseError = err.message ?? 'Parse failed.'; status = 'error'; }
        setEntries(prev => [...prev.filter(e => e.filename !== file.name), { file, filename: file.name, community, lots, parseError, status, inserted: 0, updated: 0, errors: [] }]);
      };
      reader.readAsText(file);
    });
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) processFiles(Array.from(e.target.files)); e.target.value = ''; };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.files) processFiles(Array.from(e.dataTransfer.files)); };

  const runAll = async () => {
    setImporting(true);
    for (const entry of entries.filter(e => e.status === 'pending' && e.community)) {
      setEntries(prev => prev.map(e => e.filename === entry.filename ? { ...e, status: 'importing' as FileStatus } : e));
      try {
        const r = await importLots(entry.community!.id, entry.lots);
        setEntries(prev => prev.map(e => e.filename === entry.filename ? { ...e, status: r.errors.length ? 'error' : 'done', inserted: r.inserted, updated: r.updated, errors: r.errors } : e));
      } catch (err: any) {
        setEntries(prev => prev.map(e => e.filename === entry.filename ? { ...e, status: 'error', errors: [err.message ?? 'Import failed'] } : e));
      }
    }
    setImporting(false);
  };

  const removeEntry = (fn: string) => setEntries(prev => prev.filter(e => e.filename !== fn));

  const pending = entries.filter(e => e.status === 'pending').length;
  const done    = entries.filter(e => e.status === 'done').length;
  const errored = entries.filter(e => e.status === 'error').length;
  const totalLots = entries.reduce((s, e) => s + e.lots.length, 0);
  const totalInserted = entries.reduce((s, e) => s + e.inserted, 0);
  const totalUpdated  = entries.reduce((s, e) => s + e.updated, 0);

  const SC: Record<FileStatus, { label: string; color: string; bg: string }> = {
    pending:      { label: 'Ready',      color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)'   },
    importing:    { label: 'Importing…', color: '#D97706', bg: 'rgba(217,119,6,0.10)'   },
    done:         { label: 'Done',       color: '#16A34A', bg: 'rgba(22,163,74,0.10)'   },
    error:        { label: 'Error',      color: '#DC2626', bg: 'rgba(220,38,38,0.10)'   },
    unrecognized: { label: 'Unknown',    color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
  };

  const p = { page: { padding: '28px 36px', maxWidth: 1000, fontFamily: 'var(--font-body)', color: 'var(--color-text)' } as React.CSSProperties };

  return (
    <div style={p.page}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>QDef purchaser import</h1>
        <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Drop all 9 community CSVs at once — community detected from filename automatically.</p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
        style={{ border: '2px dashed var(--color-border)', borderRadius: 12, padding: entries.length ? '18px 24px' : '44px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 20, background: 'var(--color-panel)', transition: 'border-color 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#4A9EFF'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)'; }}
      >
        <Upload size={18} color="var(--color-muted)" style={{ marginBottom: 8 }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 3 }}>{entries.length ? 'Drop more files to add' : 'Drop all 9 community CSVs here'}</p>
        <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>Files are matched by name — <code style={{ fontSize: 10, background: 'var(--color-mist)', padding: '1px 5px', borderRadius: 4 }}>copperwood.csv</code>, <code style={{ fontSize: 10, background: 'var(--color-mist)', padding: '1px 5px', borderRadius: 4 }}>rivers_edge.csv</code>, etc.</p>
        <input ref={fileRef} type="file" accept=".csv" multiple onChange={onFileChange} style={{ display: 'none' }} />
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Files',    value: entries.length, color: 'var(--color-text)' },
            { label: 'Lots',     value: totalLots,      color: 'var(--color-text)' },
            { label: 'Ready',    value: pending,        color: '#1E5FA4'            },
            { label: 'Done',     value: done,           color: '#16A34A'            },
            { label: 'Errors',   value: errored,        color: errored ? '#DC2626' : 'var(--color-muted)' },
            { label: 'Inserted', value: totalInserted,  color: '#16A34A'            },
            { label: 'Updated',  value: totalUpdated,   color: '#1E5FA4'            },
          ].map(s => (
            <div key={s.label} style={{ padding: '8px 14px', borderRadius: 8, textAlign: 'center', background: 'var(--color-panel)', border: '1px solid var(--color-border)', minWidth: 68 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 2 }}>{s.label}</p>
              <p style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* File list */}
      {entries.length > 0 && (
        <div style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 70px 70px 70px 70px 36px', padding: '9px 16px', background: 'var(--color-mist)', borderBottom: '1px solid var(--color-border)' }}>
            {['File / Community', 'Status', 'Lots', 'Owned', 'Emails', 'Tarion', ''].map(h => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
            ))}
          </div>

          {entries.map((entry, idx) => {
            const sc     = SC[entry.status];
            const owned  = entry.lots.filter(l => l.is_assigned).length;
            const emails = entry.lots.filter(l => l.email).length;
            const tarion = entry.lots.filter(l => l.enrollment_number).length;
            const isExp  = expanded === entry.filename;
            const isLast = idx === entries.length - 1;

            return (
              <div key={entry.filename}>
                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 150px 70px 70px 70px 70px 36px', padding: '12px 16px', alignItems: 'center', borderBottom: (!isLast || isExp) ? '1px solid var(--color-border)' : 'none', cursor: entry.lots.length ? 'pointer' : 'default' }}
                  onClick={() => entry.lots.length && setExpanded(isExp ? null : entry.filename)}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <FileText size={12} color="var(--color-muted)" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{entry.filename}</span>
                    </div>
                    {entry.community
                      ? <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}><Home size={10} color="#4A9EFF" /><span style={{ fontSize: 10, color: '#4A9EFF', fontWeight: 600 }}>{entry.community.name}</span></div>
                      : <span style={{ fontSize: 10, color: '#DC2626', display: 'block', marginTop: 3 }}>Community not recognised — rename file</span>
                    }
                  </div>

                  <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 100, background: sc.bg, fontSize: 10, fontWeight: 700, color: sc.color }}>
                      {entry.status === 'importing' && <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />}
                      {entry.status === 'done' && <CheckCircle2 size={9} />}
                      {entry.status === 'error' && <AlertTriangle size={9} />}
                      {sc.label}
                    </span>
                    {entry.status === 'done' && <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 2 }}>{entry.inserted} new · {entry.updated} updated</p>}
                  </div>

                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{entry.lots.length || '—'}</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{owned || '—'}</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{emails || '—'}</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{tarion || '—'}</span>

                  <button onClick={e => { e.stopPropagation(); removeEntry(entry.filename); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: 4, borderRadius: 4, display: 'flex' }}>
                    <X size={13} />
                  </button>
                </div>

                {/* Expanded preview */}
                {isExp && (
                  <div style={{ borderBottom: !isLast ? '1px solid var(--color-border)' : 'none' }}>
                    {(entry.parseError || entry.errors.length > 0) && (
                      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: 'rgba(220,38,38,0.04)', borderBottom: '1px solid rgba(220,38,38,0.15)' }}>
                        <AlertCircle size={13} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                        <div>{entry.parseError && <p style={{ fontSize: 11, color: '#DC2626' }}>{entry.parseError}</p>}{entry.errors.map((e, i) => <p key={i} style={{ fontSize: 11, color: '#DC2626' }}>{e}</p>)}</div>
                      </div>
                    )}
                    <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: 'var(--color-mist)', position: 'sticky', top: 0 }}>
                            {['Lot', 'Owner', 'Address', 'Email', 'Phone', 'Closing', ''].map(h => (
                              <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {entry.lots.slice(0, 30).map((lot, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)', background: !lot.is_assigned ? 'rgba(232,160,64,0.03)' : 'transparent' }}>
                              <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{lot.lot_number}</td>
                              <td style={{ padding: '7px 12px', color: lot.homeowner_name ? 'var(--color-text)' : 'var(--color-muted)', fontStyle: lot.homeowner_name ? 'normal' : 'italic', whiteSpace: 'nowrap' }}>
                                {lot.homeowner_name ?? 'Unassigned'}
                                {lot.first_name2 && <div style={{ fontSize: 9, color: 'var(--color-muted)' }}>+ {lot.first_name2} {lot.last_name2}</div>}
                              </td>
                              <td style={{ padding: '7px 12px', color: 'var(--color-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lot.civic_number} {lot.street}</td>
                              <td style={{ padding: '7px 12px', color: lot.email ? 'var(--color-text)' : 'var(--color-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {lot.email ?? '—'}
                                {lot.email2 && <div style={{ fontSize: 9, color: 'var(--color-muted)' }}>{lot.email2}</div>}
                              </td>
                              <td style={{ padding: '7px 12px', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{lot.phone_primary ?? '—'}</td>
                              <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{lot.closing_date?.slice(0, 7) ?? '—'}</td>
                              <td style={{ padding: '7px 12px' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, color: lot.is_assigned ? '#27500A' : '#8A7600', background: lot.is_assigned ? 'rgba(92,207,160,0.12)' : 'rgba(232,160,64,0.12)' }}>
                                  {lot.is_assigned ? 'Owner' : 'Empty'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {entry.lots.length > 30 && <p style={{ padding: '8px 12px', fontSize: 10, color: 'var(--color-muted)', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>Showing 30 of {entry.lots.length} lots — all will be imported</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Import button */}
      {entries.length > 0 && pending > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <button
            onClick={runAll} disabled={importing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: importing ? 'default' : 'pointer', fontFamily: 'var(--font-body)', color: '#fff', background: importing ? '#6B7280' : '#1E5FA4', border: `1px solid ${importing ? '#6B7280' : '#1a52a0'}`, opacity: importing ? 0.8 : 1 }}
          >
            {importing
              ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Importing…</>
              : <>Import {pending} {pending === 1 ? 'community' : 'communities'} · {totalLots} lots total <ChevronRight size={14} /></>
            }
          </button>
          <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>Safe to re-run — upserts on lot number, no duplicates</p>
        </div>
      )}

      {/* All done banner */}
      {entries.length > 0 && pending === 0 && done > 0 && !importing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 10, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
          <CheckCircle2 size={22} color="#16A34A" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>{done} {done === 1 ? 'community' : 'communities'} imported — {totalInserted} lots added, {totalUpdated} updated</p>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>Next: upload the deficiency CSVs to complete the migration.</p>
          </div>
          <button onClick={() => window.location.href = '/warranty/communities'} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            View communities <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Filename guide — shown when empty */}
      {entries.length === 0 && (
        <div style={{ padding: '16px 20px', borderRadius: 10, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Name your files like this</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              ['bridlewood_trails.csv',    'Bridlewood Trails'   ],
              ['copperwood.csv',           'Copperwood'          ],
              ['iron_valley.csv',          'Iron Valley'         ],
              ['lillythorne.csv',          'Lilythorne'          ],
              ['rivers_edge.csv',          "River's Edge"        ],
              ['spring_valley_trails.csv', 'Spring Valley Trails'],
              ['sundance.csv',             'Sundance'            ],
              ['watters_pointe.csv',       "Watters' Pointe"     ],
              ['westwood.csv',             'Westwood'            ],
            ].map(([file, community]) => (
              <div key={file} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ fontSize: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: 4, color: 'var(--color-text)', whiteSpace: 'nowrap' as const }}>{file}</code>
                <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>→ {community}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}