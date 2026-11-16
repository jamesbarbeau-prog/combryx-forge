// Where a lot's site instructions, selections and upgrades come from. Pluggable: a Box link (or any URL), pasted lines, or an uploaded text/CSV list.
import { useEffect, useState } from 'react';
import { ExternalLink, Link2, Trash2, Upload, ListPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/company';
import { loadLotSource, type LotDoc, type SiLine } from '@/lib/inspections';

const card: React.CSSProperties = { background: '#F8F6F1', border: '1px solid #D9D2C5', borderRadius: 12, padding: 14 };
const inp: React.CSSProperties = { width: '100%', minHeight: 44, borderRadius: 9, border: '1px solid #CFC7B8', background: '#fff', padding: '0 12px', font: '500 15px var(--font-body)', color: '#1F2A3C', boxSizing: 'border-box' };
const btn = (primary = false): React.CSSProperties => ({ minHeight: 44, borderRadius: 9, border: primary ? 'none' : '1px solid #B9AF9B', background: primary ? '#1B2A41' : '#F8F6F1', color: primary ? '#fff' : '#1F2A3C', fontWeight: 700, fontSize: 14, padding: '0 14px', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center' });

const KIND_LABEL = { site_instruction: 'Site instruction', selection: 'Selection', upgrade: 'Upgrade' } as const;

/** Turn pasted text or a CSV/TXT upload into lines. A leading "SI-12:" or "SI-12 -" becomes the reference. */
export function parseLines(raw: string): { ref: string | null; text: string }[] {
  return raw.split(/\r?\n/).map(s => s.replace(/^["'\s•\-*]+|["'\s]+$/g, '').trim()).filter(Boolean).map(s => {
    const m = s.match(/^([A-Za-z]{1,4}[-\s]?\d{1,5}[A-Za-z]?)\s*[:\-–]\s+(.+)$/);
    return m ? { ref: m[1], text: m[2] } : { ref: null, text: s };
  });
}

export default function LotSource({ lotId, onChange, compact = false }: { lotId: string; onChange?: (lines: SiLine[]) => void; compact?: boolean }) {
  const [docs, setDocs] = useState<LotDoc[]>([]);
  const [lines, setLines] = useState<SiLine[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(''); const [url, setUrl] = useState('');
  const [paste, setPaste] = useState(''); const [kind, setKind] = useState<SiLine['kind']>('site_instruction');
  const [open, setOpen] = useState<'' | 'link' | 'paste'>('');

  async function load() { const r = await loadLotSource(lotId); setDocs(r.docs); setLines(r.lines); onChange?.(r.lines); }
  useEffect(() => { load().catch(e => setErr(e.message)); /* eslint-disable-next-line */ }, [lotId]);

  async function addLink() {
    if (!url.trim()) return; setBusy(true); setErr('');
    try {
      const u = /^https?:\/\//i.test(url.trim()) ? url.trim() : 'https://' + url.trim();
      const { error } = await supabase.from('lot_documents').insert({ company_id: await getCompanyId(), lot_id: lotId, kind: 'site_instructions', title: title.trim() || 'Site instructions', url: u });
      if (error) throw error; setTitle(''); setUrl(''); setOpen(''); await load();
    } catch (e: any) { setErr(e.message ?? 'Could not save the link'); } finally { setBusy(false); }
  }
  async function addLines(raw: string) {
    const parsed = parseLines(raw); if (!parsed.length) return; setBusy(true); setErr('');
    try {
      const companyId = await getCompanyId(); const base = lines.length;
      const { error } = await supabase.from('lot_si_lines').insert(parsed.map((p, n) => ({ company_id: companyId, lot_id: lotId, kind, ref: p.ref, text: p.text, sort: base + n })));
      if (error) throw error; setPaste(''); setOpen(''); await load();
    } catch (e: any) { setErr(e.message ?? 'Could not save the lines'); } finally { setBusy(false); }
  }
  async function upload(f: File | undefined) { if (!f) return; await addLines(await f.text()); }
  async function delLine(id: string) { await supabase.from('lot_si_lines').delete().eq('id', id); await load(); }
  async function delDoc(id: string) { await supabase.from('lot_documents').delete().eq('id', id); await load(); }

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 15, color: '#1B2A41', marginBottom: 2 }}>Site instructions and selections</div>
      <div style={{ fontSize: 12.5, color: '#485163', marginBottom: 10 }}>Link the sheets where they live (Box or anywhere else) and list the lines to check on site.</div>

      {docs.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #E4DDCF' }}>
          <a href={d.url ?? '#'} target="_blank" rel="noreferrer" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, color: '#2F5576', fontWeight: 700, fontSize: 14, textDecoration: 'none', minHeight: 44 }}>
            <ExternalLink size={16} /> {d.title}
          </a>
          <button onClick={() => delDoc(d.id)} aria-label="Remove link" style={{ ...btn(), minHeight: 36, padding: '0 10px' }}><Trash2 size={14} /></button>
        </div>
      ))}

      {!compact && lines.length > 0 && (
        <div style={{ borderTop: '1px solid #E4DDCF', marginTop: 4 }}>
          {lines.map(l => (
            <div key={l.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #EDE7DA', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, fontSize: 13.5, color: '#1F2A3C' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#8D7140', marginRight: 6 }}>{KIND_LABEL[l.kind]}{l.ref ? ` ${l.ref}` : ''}</span>{l.text}
              </div>
              <button onClick={() => delLine(l.id)} aria-label="Remove line" style={{ border: 'none', background: 'none', color: '#A5402F', cursor: 'pointer', padding: 6 }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {compact && lines.length > 0 && <div style={{ fontSize: 13, color: '#485163', marginTop: 6 }}>{lines.length} line{lines.length === 1 ? '' : 's'} ready to check.</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button onClick={() => setOpen(open === 'link' ? '' : 'link')} style={btn()}><Link2 size={15} /> Add Box link</button>
        <button onClick={() => setOpen(open === 'paste' ? '' : 'paste')} style={btn()}><ListPlus size={15} /> Paste lines</button>
        <label style={{ ...btn(), cursor: 'pointer' }}><Upload size={15} /> Upload list<input type="file" accept=".txt,.csv,text/plain,text/csv" hidden onChange={e => upload(e.target.files?.[0])} /></label>
      </div>

      {open === 'link' && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input style={inp} placeholder="Name (e.g. Site instructions, Lot 39)" value={title} onChange={e => setTitle(e.target.value)} />
          <input style={inp} placeholder="Link (https://claridge.box.com/...)" inputMode="url" autoCapitalize="none" value={url} onChange={e => setUrl(e.target.value)} />
          <button style={btn(true)} disabled={busy || !url.trim()} onClick={addLink}>Save link</button>
        </div>
      )}
      {open === 'paste' && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <select style={inp} value={kind} onChange={e => setKind(e.target.value as SiLine['kind'])}>
            <option value="site_instruction">Site instructions</option><option value="selection">Selections</option><option value="upgrade">Upgrades</option>
          </select>
          <textarea style={{ ...inp, minHeight: 130, padding: 12 }} placeholder={'One per line, e.g.\nSI-12: Move kitchen island 6" left\nUpgrade: Oak stairs with black spindles'} value={paste} onChange={e => setPaste(e.target.value)} />
          <button style={btn(true)} disabled={busy || !paste.trim()} onClick={() => addLines(paste)}>Add {parseLines(paste).length || ''} line{parseLines(paste).length === 1 ? '' : 's'}</button>
        </div>
      )}
      {err && <div style={{ marginTop: 8, color: '#A5402F', fontSize: 13 }}>{err}</div>}
    </div>
  );
}
