// Reads the QDEF "Outstanding Aging - Details" report (.xls) into one section per community.
// The report prints the age in days of each open work order under one of five columns (under 31, 31-60, 61-90, 91-120, over 120);
// the age is the number in whichever column is filled. Phone numbers on the report are never read.
import * as XLSX from 'xlsx';

export interface QWO { wo: string; lot: string; category: string; trade: string; closing: string; scheduled: string; owner: string; address: string; description: string; age: number }
export interface QSection { community: string; reportDate: string; declared: number; rows: QWO[] }

const iso = (s: string) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec((s ?? '').trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const DATE = /^\d{2}-\d{2}-\d{4}$/;

export function parseAgingReport(buf: ArrayBuffer): QSection[] {
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('The file has no sheet.');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
  const sections: QSection[] = [];
  let cur: QSection | null = null;
  let lot = '';
  const people = new Map<string, { owner: string; address: string }>();
  for (const row of grid) {
    const c = row.map(v => String(v ?? '').trim());
    const td = c.findIndex(x => /^Total Deficiencies/i.test(x));
    if (td >= 0) {
      const community = c.find((x, i) => i !== td && x && !/^Total/i.test(x) && !DATE.test(x) && !/^[\d.]+$/.test(x)) ?? '';
      const declared = parseInt(c.slice(td + 1).find(x => /^\d+(\.0+)?$/.test(x)) ?? '0', 10);
      cur = { community, reportDate: iso(c.find(x => DATE.test(x)) ?? ''), declared, rows: [] };
      sections.push(cur); lot = ''; continue;
    }
    if (!cur) continue;
    const wo = c[15];
    if (/^\d+$/.test(wo) && c[1]) {
      const age = [16, 20, 23, 26, 31].reduce((a, i) => a + (parseFloat(c[i]) || 0), 0);
      const p = people.get(c[1]);
      cur.rows.push({ wo, lot: c[1], category: c[12], trade: c[8], closing: iso(c[5]), scheduled: iso(c[10]), owner: p?.owner ?? '', address: p?.address ?? '',
        description: c[35].replace(/\s+/g, ' ').slice(0, 600), age: Math.round(age) });
    } else if (c[2] && !c[1] && !wo) {
      lot = c[2];
    } else if (c[35] && !c[1] && !wo && lot) {
      const parts = c[35].split(' - ');
      people.set(lot, { owner: (parts[0] ?? '').replace(/\s+,/g, ',').trim(), address: parts.length >= 3 ? `${parts[1].trim()} ${parts[2].trim()}` : '' });
    }
  }
  return sections.filter(s => s.rows.length || s.declared);
}
