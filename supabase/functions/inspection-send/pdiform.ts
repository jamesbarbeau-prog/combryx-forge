// Builds the Tarion Standard Pre-Delivery Inspection form as a PDF, laid out like the official form:
// header, builder instructions, vendor/builder and home information, the deficiencies table (item, room, description, three photos, initial),
// then the purchaser acknowledgement and signatures. Letter size, one item per row block.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'npm:pdf-lib@1.17.1';

type Rec = Record<string, any>;
const PW = 612, PH = 792, L = 17, TW = 578, BOTTOM = 46;
const INK = rgb(0.05, 0.05, 0.05), GREY = rgb(0.35, 0.35, 0.35), LINE = rgb(0.1, 0.1, 0.1), SHADE = rgb(0.9, 0.9, 0.9);
const clean = (s: unknown) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF\u2022]/g, '?');
const b64 = (s: string) => { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
const dataUrl = (u: string) => { const m = /^data:(image\/\w+);base64,(.+)$/.exec(u ?? ''); return m ? { mime: m[1], bytes: b64(m[2]) } : null; };
const ymd = (s: string | null | undefined) => s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/-/g, '/') : '';
const dmy = (s: string | null | undefined) => s ? ymd(s).split('/').reverse().join('-') : '';

const LEFT = ['Windows, side lights and other glazing. Window and door screens', 'Bathtub sinks and toilets', 'Bathroom accessories if provided', 'Mirrors, counter tops and cabinetry', 'Flooring (hardwood, vinyl, ceramic tiles, carpeting)', 'Interior finishes and trim carpentry', 'Furnace', 'Hot water heater, if provided (not rental)', 'Exterior finishes, driveways, walkways, decks and landscaping are complete'];
const RIGHT = ['Windows, interior and exterior doors (including garage overhead doors) Door locks', 'Faucets: kitchen, bathroom, laundry room', 'Exhaust fans (kitchen, bathrooms), if provided', 'Electrical outlets and fixtures', 'Gas fireplaces, incl. circulation fans, if provided', 'Heat Recovery Ventilation system, if provided', 'Heating system', 'Hot water heater, if provided (not rental)', 'Air conditioning system, if provided and if conditions permit'];

export interface PdiInput {
  builderName: string; licence: string;
  insp: Rec; lot: { community: string; lotNumber: string; municipality: string; phone: string; address: string };
  items: { seq: number; room: string | null; description: string; photoPaths: string[] }[];
  logos: { tarion: Uint8Array | null; builder: Uint8Array | null };
  sigs: Rec[]; getPhoto: (path: string) => Promise<Uint8Array | null>;
}

export async function buildPdiForm(inp: PdiInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const tarion = inp.logos.tarion ? await doc.embedJpg(inp.logos.tarion).catch(() => null) : null;
  const crest = inp.logos.builder ? await doc.embedJpg(inp.logos.builder).catch(() => null) : null;
  let page!: PDFPage; let y = 0;

  const wrap = (t: string, size: number, maxW: number, f: PDFFont = font): string[] => {
    const out: string[] = [];
    for (const para of clean(t).split(/\r?\n/)) {
      let line = '';
      for (const w of para.split(/\s+/)) {
        const tryL = line ? line + ' ' + w : w;
        if (f.widthOfTextAtSize(tryL, size) <= maxW) line = tryL;
        else { if (line) out.push(line); line = w; while (f.widthOfTextAtSize(line, size) > maxW && line.length > 1) { let k = line.length; while (k > 1 && f.widthOfTextAtSize(line.slice(0, k), size) > maxW) k--; out.push(line.slice(0, k)); line = line.slice(k); } }
      }
      out.push(line);
    }
    return out;
  };
  const text = (t: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const center = (t: string, cx: number, yy: number, size: number, f: PDFFont = font) => text(t, cx - f.widthOfTextAtSize(clean(t), size) / 2, yy, size, f);
  const box = (x: number, top: number, w: number, h: number, fill?: ReturnType<typeof rgb>, bw = 0.7) => page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: LINE, borderWidth: bw, color: fill });

  const newPage = () => {
    page = doc.addPage([PW, PH]);
    if (tarion) page.drawImage(tarion, { x: 24, y: PH - 14 - 36, width: 157, height: 36 }); else text('TARION', 24, PH - 40, 22, bold);
    center('Pre-Delivery Inspection', 306, PH - 42, 16, bold);
    if (crest) page.drawImage(crest, { x: 506, y: PH - 10 - 70, width: 67, height: 70 });
    else center(inp.builderName.toUpperCase(), 540, PH - 42, 9, bold);
    y = PH - 92;
  };
  const ensure = (h: number) => { if (y - h < BOTTOM) newPage(); };
  const para = (t: string, size: number, f: PDFFont = font, x = L, w = TW, gap = 2) => { for (const l of wrap(t, size, w, f)) { text(l, x, y - size, size, f); y -= size + gap; } };

  newPage();
  // ── instructions ──
  para('Instructions to Builders regarding the Standard Pre-Delivery Inspection Form', 11.5, bold, L, TW, 6); y -= 3;
  para('Please list below any damaged, incomplete, or missing items, as well as anything that is not operating properly. Also note any "substitutions" of items referred to in, or to be selected under, the Agreement of Purchase and Sale (APS) or construction contract. Please initial all changes and deletions. As a minimum, check the following:', 7.4, font, L, TW, 2.6); y -= 2;
  para('Please note the above excludes Resale Agreements.  Please refer to your Agreement of Purchase and Sale for the balance of your warranty period (if applicable).', 7.4, font, L, TW, 2.6); y -= 6;

  const half = TW / 2; const lh = LEFT.map(t => wrap('- ' + t, 6.9, half - 8)).flat().length, rh = RIGHT.map(t => wrap('- ' + t, 6.9, half - 8)).flat().length;
  const listH = Math.max(lh, rh) * 8.4 + 8;
  box(L, y, half, 15, SHADE); box(L + half, y, half, 15, SHADE);
  center('DAMAGED, INCOMPLETE OR MISSING', L + half / 2, y - 11, 8.4, bold); center('OPERATING CONDITION', L + half * 1.5, y - 11, 8.4, bold); y -= 15;
  box(L, y, half, listH); box(L + half, y, half, listH);
  [[LEFT, L], [RIGHT, L + half]].forEach(([arr, x]) => { let yy = y - 4; for (const t of arr as string[]) for (const l of wrap('- ' + t, 6.9, half - 8)) { text(l.replace(/^- /, '• ').replace(/^(?!• )/, '  '), (x as number) + 4, yy - 6.9, 6.9); yy -= 8.4; } });
  y -= listH + 14;

  // ── vendor / builder and home ──
  para('Vendor/Builder and Home Address Information:', 10.5, bold, L, TW, 4); y -= 2;
  const names = String(inp.insp.owner_names ?? '').split(/\s+(?:and|&)\s+|\s*\/\s*/i).map((s: string) => s.trim()).filter(Boolean);
  const sigName = (role: string) => inp.sigs.find(s => s.role === role)?.name as string | undefined;
  const p1 = names[0] ?? sigName('purchaser') ?? '', p2 = names[1] ?? sigName('purchaser2') ?? '';
  const cells: [string, string][][] = [
    [['Date of Inspection', ymd(inp.insp.completed_at ?? inp.insp.started_at)], ['Purchaser:', p1]],
    [['Project Name', inp.lot.community], ['Purchaser:', p2]],
    [['LOT/ BLK', inp.lot.lotNumber], ['Civic address', inp.lot.address]],
    [['Tarion Vendor No:', inp.licence], ['Vendor/Builder:', inp.builderName]],
    [['Enrollment No:', inp.insp.enrolment_no ?? ''], ['Municipality', inp.lot.municipality]],
    [['Date of Possession', dmy(inp.insp.possession_date)], ['Phone Number', inp.lot.phone]],
  ];
  const rowH = 29; box(L, y, TW, rowH * cells.length);
  cells.forEach((r, i) => r.forEach(([k, v], c) => { const x = L + c * half + 5, top = y - i * rowH; text(k, x, top - 11, 7, bold, INK); text(v, x, top - 23, 9, bold); }));
  y -= rowH * cells.length + 6;
  para('This section should be completed and signed by all persons who are shown as purchasers on the APS for the home, or as owners of land in a construction contract (and/or by their designate * ).', 7, bold, L, TW, 2.4); y -= 6;
  para('Deficiencies', 10, bold, L, TW, 4); y -= 2;

  // ── deficiencies table ──
  const COLS = [52, 71, 89, 100, 100, 100, 66]; const HEAD = ['Item#', 'Room/Location', 'Description', 'Image', 'Image', 'Image', 'Initial'];
  const IMG_H = 100;
  const header = () => { let x = L; COLS.forEach((w, i) => { box(x, y, w, 16); center(HEAD[i], x + w / 2, y - 11, 7.6, bold); x += w; }); y -= 16; };
  const cellText = (t: string, x: number, w: number, top: number, h: number, size = 7.6) => { const ls = wrap(t, size, w - 8); const th = ls.length * (size + 1.6); let yy = top - (h - th) / 2 - size; for (const l of ls) { center(l, x + w / 2, yy, size); yy -= size + 1.6; } };
  const embed = async (path: string): Promise<PDFImage | null> => { const b = await inp.getPhoto(path); if (!b) return null; try { return await doc.embedJpg(b); } catch { try { return await doc.embedPng(b); } catch { return null; } } };

  if (!inp.items.length) { ensure(60); header(); box(L, y, TW, 30); center('No damaged, incomplete or missing items were listed.', L + TW / 2, y - 19, 8.5); y -= 30; }
  for (const it of inp.items) {
    const desc = `${it.room ? it.room + ' | ' : ''}${it.description}`;
    const descLines = wrap(desc, 7.6, COLS[2] - 8).length; const rowHgt = Math.max(IMG_H, descLines * 9.2 + 14);
    ensure(16 + rowHgt); header();
    const imgs: (PDFImage | null)[] = []; for (const p of it.photoPaths) imgs.push(await embed(p));
    const rows = Math.max(1, Math.ceil(imgs.length / 3));
    for (let r = 0; r < rows; r++) {
      if (r > 0) ensure(IMG_H);
      const top = y, h = r === 0 ? rowHgt : IMG_H; let x = L;
      COLS.forEach((w, i) => { box(x, top, w, h); if (r === 0) { if (i === 0) cellText(String(it.seq), x, w, top, h, 8); if (i === 1) cellText(it.room ?? '', x, w, top, h); if (i === 2) cellText(desc, x, w, top, h); } x += w; });
      for (let k = 0; k < 3; k++) { const im = imgs[r * 3 + k]; if (!im) continue; const cx = L + COLS[0] + COLS[1] + COLS[2] + k * 100; const s = Math.min(98 / im.width, (h - 2) / im.height); const w = im.width * s, hh = im.height * s; page.drawImage(im, { x: cx + (100 - w) / 2, y: top - (h + hh) / 2, width: w, height: hh }); }
      y -= h;
    }
  }

  // ── acknowledgement and signatures ──
  ensure(330); y -= 14; if (y > PH - 130) y = PH - 100;
  const present = !!inp.insp.purchaser_present; const sg = (role: string) => inp.sigs.find(s => s.role === role);
  box(L, y, TW, 20); text('I have inspected my new home and I agree that the descriptions of the items listed on this form are accurate.', L + 5, y - 13, 7.6, bold); y -= 20;
  const ckH = 56; box(L, y, TW, ckH);
  if (present) {
    page.drawRectangle({ x: L + 8, y: y - 20, width: 11, height: 11, borderColor: rgb(0.2, 0.4, 0.7), borderWidth: 1 }); text('X', L + 10.2, y - 18, 9, bold, rgb(0.2, 0.4, 0.7));
    let yy = y - 8; for (const l of wrap("I / We the undersigned Purchaser(s) certify that the above referenced unit has been physically inspected by myself / ourselves and the builder has advised that the Tarion Homeowner's Learning Hub can be accessed at the below link.", 7.2, TW - 40)) { text(l, L + 26, yy - 7.2, 7.2); yy -= 9; }
    text('https://www.tarion.com/homeowners/learning-hub', L + 26, y - 46, 7.2, font, INK);
  } else {
    let yy = y - 8; for (const l of wrap(`The purchaser or designate did not attend the inspection. Efforts made to have the purchaser attend: ${inp.insp.absent_note ?? ''}`, 8, TW - 20)) { text(l, L + 8, yy - 8, 8); yy -= 10; }
  }
  y -= ckH;
  const SW = TW / 4; const sigH = 62, nameH = 30;
  const slots: [string, string, string | undefined, string][] = [["Purchaser's Signature", "Purchaser's Name", 'purchaser', p1], ["Purchaser's Signature", "Purchaser's Name", 'purchaser2', p2], ["Representative's Signature", "Representative's Name", 'builder', inp.insp.inspector_name ?? ''], ["Designate's Signature", "Designate's Name", 'designate', '']];
  box(L, y, TW, sigH); box(L, y - sigH, TW, nameH);
  for (let i = 0; i < 4; i++) {
    const [sl, nl, role, nm] = slots[i]; const x = L + i * SW; const s = role ? sg(role) : undefined;
    text(sl, x + 5, y - 11, 7.2, bold);
    if (s) { const d = dataUrl(s.signature); if (d) { try { const im = d.mime.includes('png') ? await doc.embedPng(d.bytes) : await doc.embedJpg(d.bytes); const sc = Math.min((SW - 14) / im.width, 44 / im.height); page.drawImage(im, { x: x + 6, y: y - 16 - im.height * sc, width: im.width * sc, height: im.height * sc }); } catch { /* skip */ } } }
    text(nl, x + 5, y - sigH - 11, 7.2, bold); text((s?.name as string) ?? nm, x + 5, y - sigH - 23, 8.5, bold);
  }
  y -= sigH + nameH;
  box(L, y, TW, 30); text('Date (YYYY/MM/DD)', L + 5, y - 11, 7.2, bold); text(ymd(inp.insp.completed_at), L + 5, y - 23, 8.5, bold); y -= 30;
  box(L, y, TW, 24);
  let yy = y - 5; for (const l of wrap("Purchasers or owners who intend to designate someone to conduct the PDI in their place should ensure they provide written authority to the vendor/builder authorizing the designate to sign this form on their behalf.", 7.2, TW - 12, bold)) { text(l, L + 6, yy - 7.2, 7.2, bold); yy -= 9; }
  y -= 24 + 14;
  text('I, the homeowner, confirm that all repair work listed has been completed, except for exterior seasonal items.', L + 4, y - 8, 7.6, bold); y -= 44;
  text('X', L + 4, y, 12); page.drawLine({ start: { x: L + 16, y: y - 2 }, end: { x: L + 232, y: y - 2 }, thickness: 0.8, color: LINE });
  text('Date', L + 290, y + 8, 7.2, bold); page.drawLine({ start: { x: L + 290, y: y - 2 }, end: { x: L + 480, y: y - 2 }, thickness: 0.8, color: LINE });

  doc.getPages().forEach((pg, i, all) => { const t = `Page ${i + 1} of ${all.length}`; pg.drawText(t, { x: PW - 24 - font.widthOfTextAtSize(t, 9), y: 24, size: 9, font, color: INK }); });
  return await doc.save();
}
