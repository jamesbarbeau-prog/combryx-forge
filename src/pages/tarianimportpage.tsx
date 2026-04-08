/**
 * COMBRYX FORGE — Tarion Warranty Form Import
 * Parses Tarion Statutory Warranty Form PDFs (Initial, Year-End, 2nd Year, MSD)
 * Uses pdfjs-dist to extract text in the browser, then calls Supabase to import.
 *
 * INSTALL: npm install pdfjs-dist
 * USAGE: Drop this in src/pages/tarianimportpage.tsx
 * ROUTE: { path: 'import-form', element: <TarionImportPage /> }
 */

import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Upload, FileText, CheckCircle2, AlertTriangle,
  ArrowLeft, ChevronRight, Home, User, Calendar,
  Layers, RefreshCw, X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';

// Point to the PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`;

// ─── Types ────────────────────────────────────────────────────

interface ParsedItem {
  item_number: number;
  location: string;
  floor_level: string;
  room: string;
  defect_area: string;
  description: string;
}

interface ParsedForm {
  form_type: string | null;
  enrollment_number: string | null;
  vendor_builder_number: string | null;
  date_of_possession: string | null;
  date_of_signature: string | null;
  address: {
    street_number: string | null;
    street_name: string | null;
    city: string | null;
    postal_code: string | null;
    lot_number: string | null;
  };
  homeowner: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  items: ParsedItem[];
}

// ─── Form type labels ─────────────────────────────────────────

const FORM_LABELS: Record<string, string> = {
  initial:     '30-Day Initial Form',
  mid_year:    'Mid-Year Form',
  year_end:    'Year-End Form',
  second_year: '2nd Year Form',
  msd:         'Major Structural Defect Form',
};

const FORM_COLORS: Record<string, string> = {
  initial:     '#1E5FA4',
  mid_year:    '#0891B2',
  year_end:    '#D97706',
  second_year: '#7C3AED',
  msd:         '#DC2626',
};

// ─── PDF Parser ───────────────────────────────────────────────

async function parseTarionPDF(file: File): Promise<ParsedForm> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  // Extract text from all pages
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: { str: string }) => item.str)
      .join(' ');
    pages.push(text);
  }

  const page1 = pages[0] ?? '';
  const page2 = pages[1] ?? '';
  const page3 = pages[2] ?? '';

  const result: ParsedForm = {
    form_type: null,
    enrollment_number: null,
    vendor_builder_number: null,
    date_of_possession: null,
    date_of_signature: null,
    address: { street_number: null, street_name: null, city: null, postal_code: null, lot_number: null },
    homeowner: { name: null, phone: null, email: null },
    items: [],
  };

  // ── Form type ──────────────────────────────────────────────
  if (/Initial Form/i.test(page1))       result.form_type = 'initial';
  else if (/Year.End Form/i.test(page1)) result.form_type = 'year_end';
  else if (/Mid.Year Form/i.test(page1)) result.form_type = 'mid_year';
  else if (/Second.Year|2nd Year/i.test(page1)) result.form_type = 'second_year';
  else if (/Major Structural|MSD/i.test(page1))  result.form_type = 'msd';

  // ── Enrollment #, Vendor/Builder #, Date of Possession ────
  const headerMatch = page1.match(/(\d{4}-\d{2}-\d{2})\s+(B\d+)\s+(H\d+)/);
  if (headerMatch) {
    result.date_of_possession   = headerMatch[1];
    result.vendor_builder_number = headerMatch[2];
    result.enrollment_number    = headerMatch[3];
  }

  // ── Street address ─────────────────────────────────────────
  const streetMatch = page1.match(/(\d{3,5})\s+([A-Za-z][A-Za-z\s]+(?:Way|St|Ave|Rd|Dr|Blvd|Cres|Crt|Pl|Lane|Gate|Path|Trail|Terr|Circle|Close|Mews|Row))/i);
  if (streetMatch) {
    result.address.street_number = streetMatch[1];
    result.address.street_name   = streetMatch[2].trim();
  }

  // ── City ───────────────────────────────────────────────────
  const cityMatch = page1.match(/([A-Z]{2,}(?:\s+[A-Z]{2,})*)\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d/);
  if (cityMatch) result.address.city = cityMatch[1].trim();

  // ── Postal code ────────────────────────────────────────────
  const postalMatch = page1.match(/([A-Z]\d[A-Z]\s*\d[A-Z]\d)/);
  if (postalMatch) result.address.postal_code = postalMatch[1].replace(/\s/g, '');

  // ── Lot number ─────────────────────────────────────────────
  const lotMatch = page1.match(/\b(\d{1,4})\s+(?:Lot #|Project\/Subdivision)/i)
    ?? page1.match(/K\d[A-Z]\s*\d[A-Z]\d\s+(\d{1,4})/);
  if (lotMatch) result.address.lot_number = lotMatch[1];

  // ── Homeowner ──────────────────────────────────────────────
  const nameMatch = page1.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\s+Homeowner/);
  if (nameMatch) result.homeowner.name = nameMatch[1];

  const phoneMatch = page1.match(/(\+?1?\s*[\d\s\-\(\)]{9,})\s+Daytime/);
  if (phoneMatch) result.homeowner.phone = phoneMatch[1].trim();

  const emailMatch = page1.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) result.homeowner.email = emailMatch[1];

  // ── Items (page 2) ─────────────────────────────────────────
  // The pdfjs text comes out as a single string with spaces
  // Items pattern: NUMBER INTERIOR/EXTERIOR FLOOR ROOM DEFECT DESCRIPTION
  const itemRegex = /\b(\d+)\s+(INTERIOR|EXTERIOR)\s+(Floor \d+|Garage \(Interior\)|Not Applicable)\s+/g;

  // Split page2 into chunks starting at each item number
  const itemChunks: { num: number; text: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(page2)) !== null) {
    const num = parseInt(match[1]);
    const start = match.index;
    itemChunks.push({ num, text: page2.slice(start) });
  }

  for (let i = 0; i < itemChunks.length; i++) {
    const chunk = itemChunks[i];
    // End of this item = start of next item (or end of string)
    const nextStart = itemChunks[i + 1]
      ? page2.indexOf(itemChunks[i + 1].text.slice(0, 20))
      : page2.length;
    const itemText = page2.slice(page2.indexOf(chunk.text.slice(0, 20)), nextStart).trim();

    // Parse: NUM LOCATION FLOOR ROOM DEFECT_AREA DESCRIPTION
    const parts = itemText.match(
      /^\d+\s+(INTERIOR|EXTERIOR)\s+(Floor \d+|Garage \(Interior\)|Not Applicable(?:\s*\(Choose your next selection\))?)\s+(.*)/
    );

    if (!parts) continue;

    const location   = parts[1];
    const floorRaw   = parts[2].replace(/\s*\(Choose your next selection\)/gi, '').trim();
    const remainder  = parts[3].trim();

    // Known rooms to split on
    const ROOMS = [
      'Kitchen', 'Hallway', 'Bathroom', 'Mudroom', 'Living Room', 'Bedroom',
      'Garage', 'Porch', 'Deck', 'Building Face\\/Exterior', 'Laundry', 'Dining Room',
      'Basement', 'Foyer', 'Den', 'Office', 'Master', 'Family Room', 'Utility',
      'Other \\(Choose your next selection\\)',
    ];

    const DEFECTS = [
      'Wall', 'Floor', 'Ceiling', 'Windows', 'Doors', 'Trim', 'Cabinet\\(s\\)',
      'Plumbing Fixtures', 'Closet', 'Garage Floor', 'Garage Door',
      'Cladding \\(Brick, Siding, Stucco, etc\\.\\s*\\)',
      'Other \\(Please describe\\)',
    ];

    // Try to find room
    let room = '';
    let defect = '';
    let description = remainder;

    for (const r of ROOMS) {
      const rm = new RegExp(`^(${r})\\s+`, 'i');
      const m = remainder.match(rm);
      if (m) {
        room = m[1];
        const afterRoom = remainder.slice(m[0].length);
        // Try to find defect area
        for (const d of DEFECTS) {
          const dm = new RegExp(`^(${d})\\s+`, 'i');
          const dm2 = afterRoom.match(dm);
          if (dm2) {
            defect = dm2[1];
            description = afterRoom.slice(dm2[0].length)
              .replace(/\(Choose your next selection\)/gi, '')
              .replace(/\(Please describe\)/gi, '')
              .trim();
            break;
          }
        }
        if (!defect) {
          // No known defect — first word(s) are defect, rest is description
          description = afterRoom.replace(/\(Choose your next selection\)/gi, '').trim();
        }
        break;
      }
    }

    // Clean up description
    description = description
      .replace(/\(Choose your next selection\)/gi, '')
      .replace(/\(Please describe\)/gi, '')
      .replace(/The items specified.*$/i, '')
      .trim();

    if (description) {
      result.items.push({
        item_number: chunk.num,
        location,
        floor_level: floorRaw,
        room: room || 'Other',
        defect_area: defect || 'Other',
        description,
      });
    }
  }

  // ── Date of signature (page 3) ─────────────────────────────
  const sigMatch = (page3 + page2).match(/(\d{4}-\d{2}-\d{2})\s+(?:Form|Date)/);
  if (sigMatch) result.date_of_signature = sigMatch[1];
  else {
    const anyDate = page3.match(/(\d{4}-\d{2}-\d{2})/);
    if (anyDate) result.date_of_signature = anyDate[1];
  }

  return result;
}

// ─── Main component ───────────────────────────────────────────

export default function TarionImportPage() {
  const { lotId } = useParams<{ lotId: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedForm | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importResult, setImportResult] = useState<{ caseId: string; caseNumber: string; itemCount: number } | null>(null);

  // ── File drop / select ────────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setParseError('Please upload a PDF file.');
      return;
    }
    setFile(f);
    setParseError(null);
    setParsing(true);

    try {
      const result = await parseTarionPDF(f);
      if (!result.enrollment_number) {
        setParseError('Could not find an Enrolment Number in this PDF. Make sure it is a Tarion Statutory Warranty Form.');
        setParsing(false);
        return;
      }
      setParsed(result);
      setStep('preview');
    } catch (err) {
      setParseError('Failed to parse PDF: ' + String(err));
    }
    setParsing(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // ── Import ────────────────────────────────────────────────

  async function handleImport() {
    if (!parsed || !lotId) return;
    setStep('importing');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('users')
      .select('company_id, first_name, last_name')
      .eq('id', user.id)
      .single();
    if (!profile) return;

    // Create import record
    const { data: importRec } = await supabase
      .from('pdf_imports')
      .insert({
        company_id:            profile.company_id,
        imported_by_id:        user.id,
        file_name:             file?.name ?? 'unknown.pdf',
        file_size_bytes:       file?.size ?? 0,
        enrollment_number:     parsed.enrollment_number,
        vendor_builder_number: parsed.vendor_builder_number,
        form_type:             parsed.form_type,
        date_of_possession:    parsed.date_of_possession,
        status:                'pending',
        parsed_data:           parsed as unknown,
      })
      .select('id')
      .single();

    const importId = importRec?.id;

    // Call the database function
    const { data, error } = await supabase.rpc('import_tarion_form', {
      p_company_id:          profile.company_id,
      p_user_id:             user.id,
      p_user_name:           `${profile.first_name} ${profile.last_name}`,
      p_lot_id:              lotId,
      p_import_id:           importId,
      p_enrollment_number:   parsed.enrollment_number,
      p_vendor_builder_num:  parsed.vendor_builder_number,
      p_form_type:           parsed.form_type ?? 'initial',
      p_date_of_possession:  parsed.date_of_possession,
      p_date_of_signature:   parsed.date_of_signature,
      p_case_number:         parsed.enrollment_number + '-' + (parsed.form_type ?? 'initial').toUpperCase(),
      p_title:               (FORM_LABELS[parsed.form_type ?? ''] ?? 'Warranty') + ' — ' + (parsed.address.street_number ?? '') + ' ' + (parsed.address.street_name ?? ''),
      p_homeowner_name:      parsed.homeowner.name,
      p_homeowner_phone:     parsed.homeowner.phone,
      p_homeowner_email:     parsed.homeowner.email,
      p_street_number:       parsed.address.street_number,
      p_street_name:         parsed.address.street_name,
      p_city:                parsed.address.city,
      p_postal_code:         parsed.address.postal_code,
      p_lot_number:          parsed.address.lot_number,
      p_items:               parsed.items,
    });

    if (error || !data?.success) {
      setParseError(data?.error ?? error?.message ?? 'Import failed.');
      setStep('preview');
      return;
    }

    setImportResult({
      caseId:    data.caseId,
      caseNumber: data.caseNumber,
      itemCount: data.itemCount,
    });
    setStep('done');
  }

  const formColor = FORM_COLORS[parsed?.form_type ?? ''] ?? '#1E5FA4';

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, padding: 0, fontFamily: 'var(--font-body)' }}
        >
          <ArrowLeft size={13} /> Back
        </button>
        <ChevronRight size={12} color="var(--color-muted)" />
        <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Import Tarion Warranty Form
        </h1>
      </div>

      {/* ── STEP: Upload ──────────────────────────────────── */}
      {step === 'upload' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 24, lineHeight: 1.6 }}>
            Upload a Statutory Warranty Form PDF downloaded from BuilderLink or MyHome.
            Combryx will extract all items and create the case automatically.
            Supports: Initial, Mid-Year, Year-End, 2nd Year, and MSD forms.
          </p>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('pdf-input')?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#1E5FA4' : 'var(--color-border)'}`,
              borderRadius: 12,
              padding: '60px 40px',
              textAlign: 'center',
              background: dragOver ? 'rgba(30,95,164,0.04)' : 'var(--color-panel)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <input
              id="pdf-input"
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {parsing ? (
              <>
                <RefreshCw size={36} color="#1E5FA4" style={{ marginBottom: 16, animation: 'spin 1s linear infinite' }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Parsing PDF…</p>
              </>
            ) : (
              <>
                <Upload size={36} color="var(--color-muted)" strokeWidth={1.5} style={{ marginBottom: 16 }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
                  Drop your Tarion PDF here
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  or click to browse · PDF files only
                </p>
              </>
            )}
          </div>

          {parseError && (
            <div style={{
              marginTop: 16, padding: '12px 16px', borderRadius: 8,
              background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <AlertTriangle size={14} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: '#DC2626' }}>{parseError}</p>
            </div>
          )}

          <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
        </div>
      )}

      {/* ── STEP: Preview ─────────────────────────────────── */}
      {step === 'preview' && parsed && (
        <div>
          {/* Form type badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 100,
              background: `${formColor}15`, border: `1px solid ${formColor}40`,
            }}>
              <FileText size={14} color={formColor} />
              <span style={{ fontSize: 13, fontWeight: 700, color: formColor }}>
                {FORM_LABELS[parsed.form_type ?? ''] ?? 'Warranty Form'}
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
              {parsed.enrollment_number}
            </span>
            <button
              onClick={() => { setStep('upload'); setParsed(null); setFile(null); }}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 11, fontFamily: 'var(--font-body)' }}
            >
              <X size={12} /> Use different file
            </button>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>

            {/* Property */}
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Home size={12} color="var(--color-muted)" />
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>Property</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                {parsed.address.street_number} {parsed.address.street_name}
              </p>
              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{parsed.address.city}</p>
              {parsed.address.lot_number && (
                <p style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>Lot {parsed.address.lot_number}</p>
              )}
            </div>

            {/* Homeowner */}
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <User size={12} color="var(--color-muted)" />
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>Homeowner</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{parsed.homeowner.name ?? '—'}</p>
              {parsed.homeowner.email && <p style={{ fontSize: 11, color: '#1E5FA4' }}>{parsed.homeowner.email}</p>}
              {parsed.homeowner.phone && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{parsed.homeowner.phone}</p>}
            </div>

            {/* Dates */}
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Calendar size={12} color="var(--color-muted)" />
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>Dates</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { label: 'Possession', value: parsed.date_of_possession },
                  { label: 'Submitted',  value: parsed.date_of_signature  },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{r.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{r.value ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Items preview */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={14} color="var(--color-muted)" />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Warranty Items</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                  background: `${formColor}15`, color: formColor,
                }}>{parsed.items.length} items</span>
              </div>
            </div>

            <div style={{
              background: 'var(--color-panel)', borderRadius: 10,
              border: '1px solid var(--color-border)', overflow: 'hidden',
            }}>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '36px 80px 90px 110px 1fr',
                padding: '8px 14px', background: 'var(--color-mist)',
                borderBottom: '1px solid var(--color-border)',
              }}>
                {['#', 'Location', 'Floor', 'Room', 'Description'].map(h => (
                  <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
                ))}
              </div>

              {/* Item rows */}
              {parsed.items.map((item, i) => (
                <div
                  key={item.item_number}
                  style={{
                    display: 'grid', gridTemplateColumns: '36px 80px 90px 110px 1fr',
                    padding: '10px 14px',
                    borderBottom: i < parsed.items.length - 1 ? '1px solid var(--color-border)' : 'none',
                    alignItems: 'start',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                    {String(item.item_number).padStart(2, '0')}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: item.location === 'INTERIOR' ? 'rgba(30,95,164,0.10)' : 'rgba(22,163,74,0.10)',
                    color: item.location === 'INTERIOR' ? '#1E5FA4' : '#16A34A',
                    alignSelf: 'start',
                  }}>
                    {item.location}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    {item.floor_level.replace('Floor 0', 'Floor ')}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>
                    {item.room}
                  </span>
                  <div>
                    <p style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.5 }}>
                      {item.description}
                    </p>
                    {item.defect_area && item.defect_area !== 'Other' && (
                      <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{item.defect_area}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {parseError && (
            <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <p style={{ fontSize: 12, color: '#DC2626' }}>{parseError}</p>
            </div>
          )}

          {/* Import button */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleImport}
              style={{
                padding: '12px 28px', borderRadius: 9,
                background: formColor, color: '#fff',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)',
              }}
            >
              Import {parsed.items.length} Items into Combryx →
            </button>
            <button
              onClick={() => { setStep('upload'); setParsed(null); setFile(null); }}
              style={{
                padding: '12px 20px', borderRadius: 9,
                background: 'var(--color-mist)', color: 'var(--color-muted)',
                border: '1px solid var(--color-border)', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--font-body)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: Importing ───────────────────────────────── */}
      {step === 'importing' && (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <RefreshCw size={36} color="#1E5FA4" style={{ marginBottom: 16, animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Importing warranty form…</p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 6 }}>Creating case and items in Combryx</p>
          <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
        </div>
      )}

      {/* ── STEP: Done ────────────────────────────────────── */}
      {step === 'done' && importResult && (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <CheckCircle2 size={48} color="#16A34A" strokeWidth={1.5} style={{ marginBottom: 20 }} />
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>
            Import Complete
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 4 }}>
            Case <strong style={{ color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>#{importResult.caseNumber}</strong> created
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 32 }}>
            <strong>{importResult.itemCount}</strong> warranty items imported and ready to schedule
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => navigate(`/warranty/cases/${importResult.caseId}`)}
              style={{
                padding: '12px 24px', borderRadius: 9,
                background: '#1E5FA4', color: '#fff',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)',
              }}
            >
              Open Case →
            </button>
            <button
              onClick={() => { setStep('upload'); setParsed(null); setFile(null); setImportResult(null); }}
              style={{
                padding: '12px 20px', borderRadius: 9,
                background: 'var(--color-mist)', color: 'var(--color-muted)',
                border: '1px solid var(--color-border)', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--font-body)',
              }}
            >
              Import Another Form
            </button>
          </div>
        </div>
      )}
    </div>
  );
}