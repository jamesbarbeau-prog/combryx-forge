/**
 * COMBRYX — Deficiency Import Page v3
 * Route: /warranty/deficiency-import
 *
 * Rules:
 * - Completed Date on a row → item status = complete
 * - Work Order Number → stored on the item (item_number), not the case
 * - Case numbers left blank — Tarion case numbers entered manually
 * - Internal case numbers auto-generated: TC-, PDI-, WO-, EM-
 *
 * Case types:
 *   warranty      → 30_DAY / INITIAL / MIDYEAR / YEAR_END / 2ND YEAR_END / MSD  (TC-)
 *   inspection    → PDI / Pre_PDI / QA                                            (PDI-)
 *   field_service → SERVICE REQUEST / Email Requests / Post-Closing               (WO-)
 *   emergency     → EMERGENCY                                                     (EM-)
 */

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/company';
import {
  Upload, CheckCircle2, AlertTriangle, RefreshCw,
  FileText, X, ChevronRight, AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── Community registry ───────────────────────────────────────────────────────

const COMMUNITIES: Record<string, { id: string; name: string }> = {
  bridlewood:    { id: '75fa72fe-332f-4dca-afbb-c2968c9d5594', name: 'Bridlewood Trails'   },
  copperwood:    { id: 'a390c161-78ae-4045-b545-3deb7e49cba0', name: 'Copperwood'           },
  iron_valley:   { id: 'd2dd2755-a598-4b42-bcfe-1af4a742a5f6', name: 'Iron Valley'          },
  lillythorne:   { id: '74fd3c76-8692-4988-a190-9283a3cd3566', name: 'Lilythorne'           },
  lilythorne:    { id: '74fd3c76-8692-4988-a190-9283a3cd3566', name: 'Lilythorne'           },
  rivers_edge:   { id: '2f24cdcb-87dc-4a5b-82a8-bb1cc704c6c3', name: "River's Edge"         },
  spring_valley: { id: '43f0c1af-0a9f-4155-aee5-f23f33970fa6', name: 'Spring Valley Trails' },
  sundance:      { id: '8ebfe175-35bb-4505-ba5e-6f19826ada9f', name: 'Sundance'             },
  watters:       { id: 'ce14b818-68a4-4357-add4-12baea2236c0', name: "Watters' Pointe"      },
  westwood:      { id: 'e1981d6e-fcf5-4d28-82f4-7e0932e9d0f4', name: 'Westwood'            },
};


function detectCommunity(filename: string): { id: string; name: string } | null {
  const base = filename.toLowerCase().replace(/\.(xlsx?|csv)$/i, '').replace(/[-\s]/g, '_');
  for (const [key, val] of Object.entries(COMMUNITIES)) {
    if (base.includes(key)) return val;
  }
  return null;
}

// ─── Category → case type mapping ────────────────────────────────────────────

const CATEGORY_MAP: Record<string, { period_type: string; case_type: string; label: string; prefix: string }> = {
  // Tarion warranty cases — case number entered manually
  '30_DAY':          { period_type: 'initial',     case_type: 'warranty',      label: 'Initial',   prefix: 'TC'  },
  'INITIAL':         { period_type: 'initial',     case_type: 'warranty',      label: 'Initial',   prefix: 'TC'  },
  'MIDYEAR':         { period_type: 'mid_year',    case_type: 'warranty',      label: 'Mid-Year',  prefix: 'TC'  },
  'YEAR_END':        { period_type: 'year_end',    case_type: 'warranty',      label: 'Year End',  prefix: 'TC'  },
  '2ND YEAR_END':    { period_type: 'second_year', case_type: 'warranty',      label: '2nd Year',  prefix: 'TC'  },
  'MSD':             { period_type: 'msd',         case_type: 'warranty',      label: 'MSD',       prefix: 'TC'  },
  // PDI / inspection — internal
  'PDI':             { period_type: 'pdi',         case_type: 'inspection',    label: 'PDI',       prefix: 'PDI' },
  'Pre_PDI':         { period_type: 'pdi',         case_type: 'inspection',    label: 'PDI',       prefix: 'PDI' },
  'QA':              { period_type: 'pdi',         case_type: 'inspection',    label: 'PDI',       prefix: 'PDI' },
  // Service — internal
  'SERVICE REQUEST': { period_type: 'service',     case_type: 'field_service', label: 'Service',   prefix: 'WO'  },
  'Email Requests':  { period_type: 'service',     case_type: 'field_service', label: 'Service',   prefix: 'WO'  },
  'Post-Closing':    { period_type: 'service',     case_type: 'field_service', label: 'Service',   prefix: 'WO'  },
  // Emergency — internal
  'EMERGENCY':       { period_type: 'emergency',   case_type: 'emergency',     label: 'Emergency', prefix: 'EM'  },
};

// ─── Status — completed date takes priority ───────────────────────────────────

function mapStatus(statusRaw: string | null, completedDate: Date | null): string {
  // If a completed date exists the work is done regardless of status text
  if (completedDate) return 'complete';
  if (!statusRaw) return 'outstanding';
  const s = statusRaw.toLowerCase().trim();
  if (['done', 'complete', 'completed', 'closed', 'fixed', 'resolved', 'close', 'dond']
    .some(k => s === k || s.startsWith(k))) return 'complete';
  if (['nw', 'not warranted', 'non warrantable', 'not valid msd', 'not msd']
    .some(k => s.includes(k))) return 'not_warranted';
  if (['duplicate', 'double', 'duplicate line item', 'duplicate item']
    .some(k => s.includes(k))) return 'duplicate';
  if (['na', 'n/a', 'wrong lot'].some(k => s === k)) return 'not_warranted';
  return 'outstanding';
}

function safeDate(val: any): Date | null {
  if (!val) return null;
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DefRow {
  lot:         string;
  trade:       string | null;
  category:    string;
  inspector:   string | null;
  wo_number:   string | null;
  description: string | null;
  status_raw:  string | null;
  date_in:     Date | null;
  completed:   Date | null;
  scheduled:   Date | null;
}

interface ParsedGroup {
  lot_number:  string;
  category:    string;
  period_type: string;
  case_type:   string;
  label:       string;
  prefix:      string;
  items:       DefRow[];
}

type FileStatus = 'pending' | 'importing' | 'done' | 'error' | 'unrecognized';

interface FileEntry {
  file:          File;
  filename:      string;
  community:     { id: string; name: string } | null;
  groups:        ParsedGroup[];
  parseError:    string | null;
  status:        FileStatus;
  cases_created: number;
  items_created: number;
  errors:        string[];
}

// ─── Excel parser ─────────────────────────────────────────────────────────────

function parseExcel(buffer: ArrayBuffer): DefRow[] {
  const wb   = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null, raw: false });

  return rows.map(r => ({
    lot:         String(r['Lot'] ?? '').trim(),
    trade:       r['Trade Name']        ? String(r['Trade Name']).trim()        : null,
    category:    String(r['Category']   ?? '').trim(),
    inspector:   r['Inspector']         ? String(r['Inspector']).trim()         : null,
    wo_number:   r['Work Order Number'] ? String(r['Work Order Number']).trim() : null,
    description: r['Description']       ? String(r['Description']).trim()       : null,
    status_raw:  r['Status']            ? String(r['Status']).trim()            : null,
    date_in:     safeDate(r['DateIn']),
    completed:   safeDate(r['Completed Date']),
    scheduled:   safeDate(r['Schedule Date']),
  })).filter(r => r.lot && r.description);
}

function groupRows(rows: DefRow[]): ParsedGroup[] {
  const map = new Map<string, ParsedGroup>();
  const ORDER = ['pdi', 'initial', 'mid_year', 'year_end', 'second_year', 'msd', 'service', 'emergency'];

  for (const row of rows) {
    const cat = CATEGORY_MAP[row.category] ?? {
      period_type: 'service', case_type: 'field_service', label: row.category || 'General', prefix: 'WO',
    };
    // lot + period_type + case_type = unique case
    const key = `${row.lot}::${cat.period_type}::${cat.case_type}`;
    if (!map.has(key)) {
      map.set(key, {
        lot_number:  row.lot,
        category:    row.category,
        period_type: cat.period_type,
        case_type:   cat.case_type,
        label:       cat.label,
        prefix:      cat.prefix,
        items:       [],
      });
    }
    map.get(key)!.items.push(row);
  }

  return Array.from(map.values()).sort((a, b) => {
    const lotCmp = a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true });
    if (lotCmp !== 0) return lotCmp;
    return ORDER.indexOf(a.period_type) - ORDER.indexOf(b.period_type);
  });
}

// ─── Supabase import ──────────────────────────────────────────────────────────

async function importGroups(communityId: string, groups: ParsedGroup[]) {
  const COMPANY_ID = await getCompanyId();
  let cases_created = 0;
  let items_created = 0;
  const errors: string[] = [];

  // Get lots for this community
  const { data: lots } = await supabase
    .from('warranty_lots')
    .select('id, lot_number')
    .eq('community_id', communityId);

  const lotMap: Record<string, string> = {};
  (lots ?? []).forEach((l: { id: string; lot_number: string }) => { lotMap[l.lot_number] = l.id; });

  // Get existing cases to avoid duplicates
  const lotIds = Object.values(lotMap);
  const { data: existingCases } = lotIds.length
    ? await supabase.from('cases').select('id, lot_id, period_type, case_type').eq('company_id', COMPANY_ID).in('lot_id', lotIds)
    : { data: [] };

  const existingCaseMap: Record<string, string> = {};
  (existingCases ?? []).forEach((c: any) => {
    existingCaseMap[`${c.lot_id}::${c.period_type}::${c.case_type}`] = c.id;
  });

  // Sequence counters per prefix
  const seqMap: Record<string, number> = { TC: 1000, PDI: 1, WO: 1, EM: 1 };
  const { data: lastCases } = await supabase
    .from('cases').select('case_number').eq('company_id', COMPANY_ID)
    .order('created_at', { ascending: false }).limit(200);

  for (const c of (lastCases ?? []) as { case_number: string }[]) {
    for (const prefix of Object.keys(seqMap)) {
      if (c.case_number?.startsWith(prefix + '-')) {
        const num = parseInt(c.case_number.slice(prefix.length + 1));
        if (!isNaN(num) && num >= seqMap[prefix]) seqMap[prefix] = num + 1;
      }
    }
  }

  // Process each group
  for (const group of groups) {
    const lotId = lotMap[group.lot_number];
    if (!lotId) continue;

    const caseKey = `${lotId}::${group.period_type}::${group.case_type}`;
    let caseId = existingCaseMap[caseKey];

    if (!caseId) {
      const prefix     = group.prefix;
      const caseNumber = `${prefix}-${String(seqMap[prefix] ?? 1).padStart(5, '0')}`;
      seqMap[prefix]   = (seqMap[prefix] ?? 1) + 1;

      const { data: newCase, error: caseErr } = await supabase
        .from('cases')
        .insert({
          company_id:        COMPANY_ID,
          lot_id:            lotId,
          case_number:       caseNumber,
          // tarion_case_number left blank — entered manually by coordinator
          case_type:         group.case_type,
          period_type:       group.period_type,
          status:            'open',
          priority:          3,
          title:             `Lot ${group.lot_number} — ${group.label}`,
          opened_at:         group.items[0]?.date_in?.toISOString() ?? new Date().toISOString(),
          interaction_count: 0,
          document_count:    0,
        })
        .select('id')
        .single();

      if (caseErr) {
        errors.push(`Lot ${group.lot_number} ${group.label}: ${caseErr.message}`);
        continue;
      }

      caseId = newCase.id;
      existingCaseMap[caseKey] = caseId;
      cases_created++;
    }

    // Insert items in batches of 50
    const BATCH = 50;
    for (let i = 0; i < group.items.length; i += BATCH) {
      const batch    = group.items.slice(i, i + BATCH);
      const itemRows = batch.map((item, idx) => ({
        company_id:       COMPANY_ID,
        case_id:          caseId,
        // Store the trade's WO number on the item — this is their work order reference
        item_number:      item.wo_number
          ? String(item.wo_number)
          : `${group.lot_number}-${group.period_type.toUpperCase().slice(0, 3)}-${String(i + idx + 1).padStart(3, '0')}`,
        description:      item.description,
        trade_required:   item.trade,
        // Completed date = item is done, regardless of status text
        status:           mapStatus(item.status_raw, item.completed),
        assessment_notes: item.status_raw && item.status_raw.length > 3 ? item.status_raw : null,
        assessed_at:      item.date_in?.toISOString()   ?? null,
        completed_at:     item.completed?.toISOString() ?? null,
        visit_count:      0,
        parts_required:   false,
        source_period:    group.period_type,
      }));

      const { error: itemErr } = await supabase
        .from('warranty_items')
        .insert(itemRows);

      if (itemErr) {
        errors.push(`Items Lot ${group.lot_number} ${group.label}: ${itemErr.message}`);
      } else {
        items_created += batch.length;
      }
    }
  }

  return { cases_created, items_created, errors };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DeficiencyImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [entries,   setEntries]   = useState<FileEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const processFiles = useCallback((files: File[]) => {
    files.filter(f => /\.(xlsx?|csv)$/i.test(f.name)).forEach(file => {
      const community = detectCommunity(file.name);
      const reader    = new FileReader();
      reader.onload   = e => {
        let groups: ParsedGroup[] = [];
        let parseError: string | null = null;
        let status: FileStatus = community ? 'pending' : 'unrecognized';
        try {
          const rows = parseExcel(e.target?.result as ArrayBuffer);
          groups     = groupRows(rows);
          if (!groups.length) { parseError = 'No valid rows found.'; status = 'error'; }
        } catch (err: any) { parseError = err.message ?? 'Parse failed.'; status = 'error'; }

        setEntries(prev => [...prev.filter(e => e.filename !== file.name), {
          file, filename: file.name, community, groups, parseError,
          status, cases_created: 0, items_created: 0, errors: [],
        }]);
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
    e.target.value = '';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) processFiles(Array.from(e.dataTransfer.files));
  };

  const runAll = async () => {
    setImporting(true);
    for (const entry of entries.filter(e => e.status === 'pending' && e.community)) {
      setEntries(prev => prev.map(e =>
        e.filename === entry.filename ? { ...e, status: 'importing' as FileStatus } : e
      ));
      try {
        const r = await importGroups(entry.community!.id, entry.groups);
        setEntries(prev => prev.map(e =>
          e.filename === entry.filename
            ? { ...e, status: r.errors.length ? 'error' : 'done', cases_created: r.cases_created, items_created: r.items_created, errors: r.errors }
            : e
        ));
      } catch (err: any) {
        setEntries(prev => prev.map(e =>
          e.filename === entry.filename
            ? { ...e, status: 'error', errors: [err.message ?? 'Import failed'] }
            : e
        ));
      }
    }
    setImporting(false);
  };

  const removeEntry = (fn: string) => setEntries(prev => prev.filter(e => e.filename !== fn));

  const pending       = entries.filter(e => e.status === 'pending').length;
  const done          = entries.filter(e => e.status === 'done').length;
  const errored       = entries.filter(e => e.status === 'error').length;
  const totalGroups   = entries.reduce((s, e) => s + e.groups.length, 0);
  const totalItems    = entries.reduce((s, e) => s + e.groups.reduce((g, gr) => g + gr.items.length, 0), 0);
  const totalCases    = entries.reduce((s, e) => s + e.cases_created, 0);
  const totalImported = entries.reduce((s, e) => s + e.items_created, 0);

  const SC: Record<FileStatus, { label: string; color: string; bg: string }> = {
    pending:      { label: 'Ready',      color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)'   },
    importing:    { label: 'Importing…', color: '#D97706', bg: 'rgba(217,119,6,0.10)'   },
    done:         { label: 'Done',       color: '#16A34A', bg: 'rgba(22,163,74,0.10)'   },
    error:        { label: 'Error',      color: '#DC2626', bg: 'rgba(220,38,38,0.10)'   },
    unrecognized: { label: 'Unknown',    color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
  };

  const TYPE_COLOR: Record<string, string> = {
    warranty:      '#1E5FA4',
    inspection:    '#7C3AED',
    field_service: '#D97706',
    emergency:     '#DC2626',
  };

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1100, fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>Deficiency import</h1>
        <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          Completed date = item closed · WO number stored on item · Tarion case numbers entered manually after import
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
        style={{ border: '2px dashed var(--color-border)', borderRadius: 12, padding: entries.length ? '18px 24px' : '44px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 20, background: 'var(--color-panel)', transition: 'border-color 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#4A9EFF'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)'; }}
      >
        <Upload size={18} color="var(--color-muted)" style={{ marginBottom: 8 }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 3 }}>
          {entries.length ? 'Drop more files to add' : 'Drop all 9 deficiency Excel files here'}
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          Name files with community — <code style={{ fontSize: 10, background: 'var(--color-mist)', padding: '1px 5px', borderRadius: 4 }}>deficiency_bridlewood_trails.xlsx</code>
        </p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple onChange={onFileChange} style={{ display: 'none' }} />
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Files',    value: entries.length, color: 'var(--color-text)' },
            { label: 'Cases',    value: totalGroups,    color: 'var(--color-text)' },
            { label: 'Items',    value: totalItems,     color: 'var(--color-text)' },
            { label: 'Ready',    value: pending,        color: '#1E5FA4'            },
            { label: 'Done',     value: done,           color: '#16A34A'            },
            { label: 'Errors',   value: errored,        color: errored ? '#DC2626' : 'var(--color-muted)' },
            { label: 'Created',  value: totalCases,     color: '#16A34A'            },
            { label: 'Imported', value: totalImported,  color: '#16A34A'            },
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 80px 80px 80px 36px', padding: '9px 16px', background: 'var(--color-mist)', borderBottom: '1px solid var(--color-border)' }}>
            {['File / Community', 'Status', 'Cases', 'Items', 'Imported', ''].map(h => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
            ))}
          </div>

          {entries.map((entry, idx) => {
            const sc      = SC[entry.status];
            const isExp   = expanded === entry.filename;
            const isLast  = idx === entries.length - 1;
            const itemCount = entry.groups.reduce((s, g) => s + g.items.length, 0);

            return (
              <div key={entry.filename}>
                <div
                  style={{ display: 'grid', gridTemplateColumns: '1fr 150px 80px 80px 80px 36px', padding: '12px 16px', alignItems: 'center', borderBottom: (!isLast || isExp) ? '1px solid var(--color-border)' : 'none', cursor: entry.groups.length ? 'pointer' : 'default' }}
                  onClick={() => entry.groups.length && setExpanded(isExp ? null : entry.filename)}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <FileText size={12} color="var(--color-muted)" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{entry.filename}</span>
                    </div>
                    {entry.community
                      ? <span style={{ fontSize: 10, color: '#4A9EFF', fontWeight: 600, display: 'block', marginTop: 2 }}>{entry.community.name}</span>
                      : <span style={{ fontSize: 10, color: '#DC2626', display: 'block', marginTop: 2 }}>Community not recognised — rename file</span>
                    }
                  </div>

                  <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 100, background: sc.bg, fontSize: 10, fontWeight: 700, color: sc.color }}>
                      {entry.status === 'importing' && <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />}
                      {entry.status === 'done'      && <CheckCircle2 size={9} />}
                      {entry.status === 'error'     && <AlertTriangle size={9} />}
                      {sc.label}
                    </span>
                    {entry.status === 'done' && (
                      <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 2 }}>{entry.cases_created} cases · {entry.items_created} items</p>
                    )}
                  </div>

                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{entry.groups.length || '—'}</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>{itemCount || '—'}</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: '#16A34A' }}>{entry.items_created || '—'}</span>

                  <button onClick={e => { e.stopPropagation(); removeEntry(entry.filename); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: 4, display: 'flex' }}>
                    <X size={13} />
                  </button>
                </div>

                {isExp && (
                  <div style={{ borderBottom: !isLast ? '1px solid var(--color-border)' : 'none' }}>
                    {(entry.parseError || entry.errors.length > 0) && (
                      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: 'rgba(220,38,38,0.04)', borderBottom: '1px solid rgba(220,38,38,0.15)' }}>
                        <AlertCircle size={13} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                        <div>
                          {entry.parseError && <p style={{ fontSize: 11, color: '#DC2626' }}>{entry.parseError}</p>}
                          {entry.errors.slice(0, 5).map((e, i) => <p key={i} style={{ fontSize: 11, color: '#DC2626' }}>{e}</p>)}
                          {entry.errors.length > 5 && <p style={{ fontSize: 11, color: '#DC2626' }}>…and {entry.errors.length - 5} more</p>}
                        </div>
                      </div>
                    )}

                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: 'var(--color-mist)', position: 'sticky', top: 0 }}>
                            {['Lot', 'Type', 'Period', 'Label', 'Prefix', 'Items', 'Complete / Open / NW'].map(h => (
                              <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {entry.groups.slice(0, 40).map((g, i) => {
                            const complete    = g.items.filter(it => mapStatus(it.status_raw, it.completed) === 'complete').length;
                            const outstanding = g.items.filter(it => mapStatus(it.status_raw, it.completed) === 'outstanding').length;
                            const nw          = g.items.filter(it => mapStatus(it.status_raw, it.completed) === 'not_warranted').length;
                            const typeColor   = TYPE_COLOR[g.case_type] ?? 'var(--color-muted)';
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{g.lot_number}</td>
                                <td style={{ padding: '7px 12px' }}>
                                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700, color: typeColor, background: typeColor + '15', whiteSpace: 'nowrap' }}>{g.case_type}</span>
                                </td>
                                <td style={{ padding: '7px 12px', color: 'var(--color-muted)', fontSize: 10, whiteSpace: 'nowrap' }}>{g.period_type}</td>
                                <td style={{ padding: '7px 12px', color: 'var(--color-text)', fontWeight: 600 }}>{g.label}</td>
                                <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', fontSize: 10 }}>{g.prefix}-</td>
                                <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text)' }}>{g.items.length}</td>
                                <td style={{ padding: '7px 12px' }}>
                                  <div style={{ display: 'flex', gap: 5 }}>
                                    {complete > 0    && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(22,163,74,0.1)',   color: '#16A34A', fontWeight: 700 }}>{complete} done</span>}
                                    {outstanding > 0 && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(217,119,6,0.1)',   color: '#D97706', fontWeight: 700 }}>{outstanding} open</span>}
                                    {nw > 0          && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(107,114,128,0.1)', color: '#6B7280', fontWeight: 700 }}>{nw} NW</span>}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {entry.groups.length > 40 && (
                        <p style={{ padding: '8px 12px', fontSize: 10, color: 'var(--color-muted)', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                          Showing 40 of {entry.groups.length} case groups — all will be imported
                        </p>
                      )}
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
              ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Importing — this may take a few minutes…</>
              : <>Import {pending} {pending === 1 ? 'file' : 'files'} · {totalGroups} cases · {totalItems} items <ChevronRight size={14} /></>
            }
          </button>
          <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>Existing cases skipped · Tarion numbers added manually after</p>
        </div>
      )}

      {/* Done banner */}
      {entries.length > 0 && pending === 0 && done > 0 && !importing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 10, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
          <CheckCircle2 size={22} color="#16A34A" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>
              {done} {done === 1 ? 'file' : 'files'} imported — {totalCases} cases created, {totalImported} items imported
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
              Go to each case and enter the Tarion case number manually.
            </p>
          </div>
          <button onClick={() => window.location.href = '/warranty/cases'} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            View cases <ChevronRight size={12} />
          </button>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}