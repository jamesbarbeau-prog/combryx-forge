// inspection-send — builds the signed QCI report or Tarion-layout PDI form as a PDF, stores it privately, and emails the links.
// Body: { inspection_id }. Signed-in user of the same company only. The inspection must already be signed.
//   PDI -> superintendent (findings link) + owner (their copy). The CCP itself is completed in Tarion BuilderLink within 15 days of possession.
//   QCI -> superintendent (findings link).
// TEST MODE (default): all email goes only to MAIL_TEST_TO. Real sending needs the secret MAIL_LIVE=true.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'npm:pdf-lib@1.17.1';

type Rec = Record<string, any>;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const LIVE = Deno.env.get('MAIL_LIVE') === 'true';
const TEST_TO = Deno.env.get('MAIL_TEST_TO') ?? 'james.barbeau@claridgehomes.com';

async function sendMail(realTo: string[], realSubject: string, realHtml: string): Promise<string> {
  const to = LIVE ? realTo : [TEST_TO];
  const subject = LIVE ? realSubject : `[TEST] ${realSubject}`;
  const html = LIVE ? realHtml : `<p style="background:#FFF4D6;border:1px solid #E0C36A;padding:8px 10px;font:12px Arial,sans-serif;color:#5B4A10;margin:0 0 14px">TEST MODE. This would have gone to: ${esc(realTo.join(', ') || 'nobody (no address on file)')}.</p>${realHtml}`;
  const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('MAIL_FROM'), hook = Deno.env.get('MAIL_WEBHOOK_URL');
  try {
    if (key && from) {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, subject, html }) });
      return r.ok ? 'sent' : `Resend HTTP ${r.status}`;
    }
    if (hook) {
      const r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'follow', body: JSON.stringify({ secret: Deno.env.get('MAIL_WEBHOOK_SECRET') ?? '', to, subject, html }) });
      const t = await r.text(); return r.ok && /ok/i.test(t) ? 'sent' : `mail webhook HTTP ${r.status}`;
    }
  } catch (e) { return (e as Error).message.slice(0, 120); }
  return 'not_configured';
}

// ───────── PDF helpers ─────────
const NAVY = rgb(0.106, 0.165, 0.255), BRASS = rgb(0.553, 0.443, 0.251), GREY = rgb(0.39, 0.42, 0.47), LINE = rgb(0.78, 0.75, 0.68), RED = rgb(0.647, 0.251, 0.184), GREEN = rgb(0.29, 0.478, 0.333);
const W = 612, H = 792, M = 42;
const clean = (s: unknown) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
const fmtD = (s: string | null) => s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/-/g, '/') : '';

class Pdf {
  doc!: PDFDocument; font!: PDFFont; bold!: PDFFont; page!: PDFPage; y = 0; title = ''; sub = ''; n = 0;
  static async make(title: string, sub: string) { const p = new Pdf(); p.doc = await PDFDocument.create(); p.font = await p.doc.embedFont(StandardFonts.Helvetica); p.bold = await p.doc.embedFont(StandardFonts.HelveticaBold); p.title = title; p.sub = sub; p.add(); return p; }
  add() {
    this.page = this.doc.addPage([W, H]); this.n++;
    this.page.drawRectangle({ x: 0, y: H - 34, width: W, height: 34, color: NAVY });
    this.page.drawText(clean(this.title), { x: M, y: H - 22, size: 11, font: this.bold, color: rgb(1, 1, 1) });
    const r = clean(this.sub); this.page.drawText(r, { x: W - M - this.font.widthOfTextAtSize(r, 9), y: H - 21, size: 9, font: this.font, color: rgb(0.85, 0.8, 0.68) });
    this.page.drawRectangle({ x: 0, y: H - 36, width: W, height: 2, color: BRASS });
    this.y = H - 60;
  }
  ensure(h: number) { if (this.y - h < 50) this.add(); }
  wrap(t: string, size: number, maxW: number, f = this.font): string[] {
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
  }
  text(t: string, o: { size?: number; bold?: boolean; x?: number; w?: number; color?: any; gap?: number } = {}) {
    const size = o.size ?? 10, f = o.bold ? this.bold : this.font, x = o.x ?? M, w = o.w ?? W - M - x;
    for (const l of this.wrap(t, size, w, f)) { this.ensure(size + 4); this.page.drawText(l, { x, y: this.y - size, size, font: f, color: o.color ?? rgb(0.12, 0.16, 0.24) }); this.y -= size + 3.5; }
    this.y -= o.gap ?? 0;
  }
  h(t: string) { this.ensure(90); this.y -= 8; this.page.drawText(clean(t), { x: M, y: this.y - 12, size: 13, font: this.bold, color: NAVY }); this.y -= 17; this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 1, color: BRASS }); this.y -= 8; }
  /** A table row: cells are [text, width]; draws borders; wraps text; marks are drawn as bold X centred. */
  row(cells: { t: string; w: number; mark?: boolean; bold?: boolean; color?: any }[], o: { head?: boolean; size?: number } = {}) {
    const size = o.size ?? 9.5;
    const lines = cells.map(c => c.mark ? [c.t] : this.wrap(c.t, size, c.w - 8, o.head || c.bold ? this.bold : this.font));
    const hgt = Math.max(...lines.map(l => l.length)) * (size + 3) + 8;
    this.ensure(hgt);
    let x = M; const top = this.y;
    cells.forEach((c, i) => {
      this.page.drawRectangle({ x, y: top - hgt, width: c.w, height: hgt, borderColor: LINE, borderWidth: 0.7, color: o.head ? rgb(0.93, 0.91, 0.86) : undefined });
      if (c.mark) { if (c.t) { const tw = this.bold.widthOfTextAtSize(c.t, size + 1); this.page.drawText(c.t, { x: x + (c.w - tw) / 2, y: top - hgt / 2 - 3.5, size: size + 1, font: this.bold, color: c.color ?? NAVY }); } }
      else lines[i].forEach((l, j) => this.page.drawText(l, { x: x + 4, y: top - 4 - size - j * (size + 3) + 1, size, font: o.head || c.bold ? this.bold : this.font, color: c.color ?? rgb(0.12, 0.16, 0.24) }));
      x += c.w;
    });
    this.y = top - hgt;
  }
  async img(bytes: Uint8Array, mime: string): Promise<PDFImage | null> { try { return mime.includes('png') ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes); } catch { return null; } }
  drawImg(im: PDFImage, x: number, yTop: number, maxW: number, maxH: number) { const s = Math.min(maxW / im.width, maxH / im.height, 1); const w = im.width * s, h = im.height * s; this.page.drawImage(im, { x, y: yTop - h, width: w, height: h }); return { w, h }; }
}

const dataUrl = (u: string) => { const m = /^data:(image\/\w+);base64,(.+)$/.exec(u); if (!m) return null; const bin = atob(m[2]); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return { mime: m[1], bytes: b }; };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const { inspection_id } = await req.json().catch(() => ({}));
    if (!inspection_id) return json({ error: 'inspection_id is required.' }, 400);
    const db = createClient(url, Deno.env.get('SB_PUBLISHABLE_KEY') ?? 'sb_publishable_2gScWn0IHoGB3vRAgrwLLA_a_IfsKNV', { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await db.auth.getUser();
    if (!user) return json({ error: 'Sign in required.' }, 401);
    const { data: mine } = await db.from('inspections').select('id').eq('id', inspection_id).maybeSingle(); // RLS: only this company's rows are visible
    if (!mine) return json({ error: 'Inspection not found.' }, 404);

    const admin = createClient(url, (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
    const { data: insp } = await admin.from('inspections').select('*').eq('id', inspection_id).single();
    if (!insp || !['signed', 'sent'].includes(insp.status)) return json({ error: 'Sign the inspection first.' }, 409);
    const [{ data: co }, { data: items }, { data: photos }, { data: sigs }] = await Promise.all([
      admin.from('companies').select('name, phone').eq('id', insp.company_id).single(),
      admin.from('inspection_items').select('*').eq('inspection_id', inspection_id).order('seq'),
      admin.from('inspection_photos').select('*').eq('inspection_id', inspection_id).order('created_at'),
      admin.from('inspection_signatures').select('*').eq('inspection_id', inspection_id),
    ]);
    const licence = ((await admin.from('company_settings').select('settings').eq('company_id', insp.company_id).maybeSingle()).data?.settings?.builder_licence as string) ?? '';
    const isPdi = insp.kind === 'pdi';
    const its: Rec[] = items ?? [], phs: Rec[] = photos ?? [], sg: Rec[] = sigs ?? [];
    const addr = (insp.address ?? '').replace(/,\s*Ottawa.*$/i, '');

    const pdf = await Pdf.make(isPdi ? 'Pre-Delivery Inspection Form' : 'Quality Control Inspection Report', `${co?.name ?? ''}  |  Enrolment # ${insp.enrolment_no ?? ''}`);
    const lotRow = insp.lot_id ? (await admin.from('warranty_lots').select('lot_number, city').eq('id', insp.lot_id).maybeSingle()).data : null;

    // item numbering: defects and substitutions share one log, like Tarion's page
    const defects = its.filter(i => i.list === 'deficiency'), subs = its.filter(i => i.list === 'substitution'), nas = its.filter(i => i.list === 'not_assessed');
    const log = [...defects, ...subs];
    const numOf = new Map<string, number>(); log.forEach((i, n) => numOf.set(i.id, n + 1)); nas.forEach((i, n) => numOf.set(i.id, n + 1));
    const si = its.filter(i => i.list === 'si_check');

    if (isPdi) {
      pdf.text(`${addr}`, { size: 15, bold: true, color: NAVY });
      pdf.text(`Inspection completed ${fmtD(insp.completed_at)}  |  Inspector: ${insp.inspector_name ?? ''}`, { size: 9.5, color: GREY, gap: 4 });
      pdf.text('Builder minimum checklist. Each item is marked either as damaged, incomplete or missing, or as being in operating condition. N/A means the home does not have the item.', { size: 9.5, color: GREY, gap: 6 });
      const CHECK = ['Windows, sidelights and other glazing', 'Window and door screens', 'Windows, interior and exterior doors (including garage overhead door)', 'Door locks', 'Bathtubs, sinks and toilets', 'Faucets: kitchen, bathroom, laundry room', 'Bathroom accessories (if provided)', 'Exhaust fans: kitchen and bathrooms (if provided)', 'Mirrors, countertops and cabinetry', 'Electrical outlets and fixtures', 'Flooring (hardwood, vinyl, ceramic tile, carpet)', 'Gas fireplaces, including circulation fans (if provided)', 'Interior finishes and trim carpentry', 'Heat Recovery Ventilation system (if provided)', 'Furnace', 'Heating system', 'Hot water heater (if provided, not a rental)', 'Exterior finishes, driveways, walkways, decks and landscaping (confirm completion)', 'Air conditioning system (if provided and conditions permit)'];
      pdf.row([{ t: '#', w: 28 }, { t: 'Item', w: 330 }, { t: 'Damaged, incomplete or missing', w: 90 }, { t: 'Operating condition', w: 82 }], { head: true, size: 8.5 });
      CHECK.forEach((name, i) => {
        const v = (insp.checklist ?? {})[String(i + 1)];
        pdf.row([{ t: String(i + 1), w: 28 }, { t: name, w: 330 }, { t: v === 'issue' ? 'X' : '', w: 90, mark: true, color: RED }, { t: v === 'ok' ? 'X' : v === 'na' ? 'N/A' : '', w: 82, mark: true, color: v === 'na' ? GREY : GREEN }], { size: 9 });
      });

      pdf.h('Defects and substitutions log');
      pdf.row([{ t: 'Item #', w: 44 }, { t: 'Room / location', w: 118 }, { t: 'Description', w: 350 }], { head: true, size: 8.5 });
      if (!log.length) pdf.row([{ t: '', w: 44 }, { t: '', w: 118 }, { t: 'No damaged, incomplete or missing items, and no substitutions, were recorded.', w: 350 }]);
      log.forEach(i => pdf.row([{ t: String(numOf.get(i.id)), w: 44 }, { t: i.room ?? '', w: 118 }, { t: (i.list === 'substitution' ? 'SUBSTITUTION: ' : '') + i.description, w: 350 }]));

      pdf.h('Non-assessable items log');
      pdf.row([{ t: 'Item #', w: 44 }, { t: 'Room / location', w: 118 }, { t: 'Description (could not be assessed)', w: 350 }], { head: true, size: 8.5 });
      if (!nas.length) pdf.row([{ t: '', w: 44 }, { t: '', w: 118 }, { t: 'None.', w: 350 }]);
      nas.forEach(i => pdf.row([{ t: String(numOf.get(i.id)), w: 44 }, { t: i.room ?? '', w: 118 }, { t: i.description, w: 350 }]));

      pdf.h('Vendor / builder and home information');
      const kv = (k: string, v: string) => pdf.row([{ t: k, w: 170, bold: true }, { t: v, w: 342 }]);
      kv('Date of possession (YYYY/MM/DD)', fmtD(insp.possession_date)); kv('Vendor / builder licence #', licence); kv('Lot', lotRow?.lot_number ?? ''); kv('Plan', ''); kv('Municipality', lotRow?.city ?? 'Ottawa');
      kv('Home / civic address', insp.address ?? ''); kv('Vendor / builder name', co?.name ?? ''); kv('Representative name', insp.inspector_name ?? ''); kv('Unit enrolment #', insp.enrolment_no ?? '');
      const b = sg.find(s => s.role === 'builder');
      pdf.ensure(80); pdf.text('Representative signature', { size: 9.5, bold: true });
      if (b) { const d = dataUrl(b.signature); const im = d && await pdf.img(d.bytes, d.mime); if (im) { const r = pdf.drawImg(im, M, pdf.y, 200, 55); pdf.y -= r.h + 6; } }

      pdf.h('Purchaser acknowledgement');
      if (insp.purchaser_present) {
        pdf.text('I have inspected my new home and I agree that the descriptions of the items listed on this form are accurate.', { size: 10.5, gap: 6 });
        for (const s of sg.filter(x => x.role !== 'builder')) {
          pdf.ensure(95); pdf.text(`${s.role === 'designate' ? 'Designate' : 'Purchaser'}: ${s.name ?? ''}   |   Date: ${fmtD(s.signed_at)}`, { size: 9.5, bold: true });
          const d = dataUrl(s.signature); const im = d && await pdf.img(d.bytes, d.mime); if (im) { const r = pdf.drawImg(im, M, pdf.y, 200, 55); pdf.y -= r.h + 8; }
          if (s.role === 'designate') pdf.text('Designate signs under the purchaser\'s written authority (Appointment of Designate form kept on file).', { size: 8.5, color: GREY });
        }
      } else {
        pdf.text(`The purchaser or designate did not attend. Efforts made: ${insp.absent_note ?? ''}`, { size: 10.5 });
      }
      pdf.text('The completed form is a formal record of the home\'s condition before possession and the reference for future warranty service requests. The builder keeps a copy and gives a copy to the purchaser or designate.', { size: 8.5, color: GREY });
    } else {
      pdf.text(addr, { size: 15, bold: true, color: NAVY });
      pdf.text(`Inspection completed ${fmtD(insp.completed_at)}  |  Inspector: ${insp.inspector_name ?? ''}  |  Superintendent: ${insp.super_name ?? ''}`, { size: 9.5, color: GREY, gap: 6 });
      const bad = si.filter(i => i.result === 'wrong' || i.result === 'missing');
      pdf.text(`Lines checked: ${si.length}    Not as specified: ${bad.length}    Observed defects: ${defects.length}`, { size: 11, bold: true, gap: 4 });
      pdf.h('Site instructions, selections and upgrades');
      pdf.row([{ t: '#', w: 28 }, { t: 'Type', w: 78 }, { t: 'Line', w: 270 }, { t: 'Result', w: 56 }, { t: '', w: 80 }], { head: true, size: 8.5 });
      if (!si.length) pdf.row([{ t: '', w: 28 }, { t: '', w: 78 }, { t: 'No site instruction lines were loaded for this home.', w: 270 }, { t: '', w: 56 }, { t: '', w: 80 }]);
      const SRC: Rec = { site_instruction: 'Site instruction', selection: 'Selection', upgrade: 'Upgrade' };
      si.forEach((i, n) => {
        const r = i.result; const col = r === 'ok' ? GREEN : r === 'na' ? GREY : RED;
        pdf.row([{ t: String(n + 1), w: 28 }, { t: SRC[i.source] ?? '', w: 78 }, { t: i.description + (i.note ? `\nNote: ${i.note}` : ''), w: 270 }, { t: (r ?? '').toUpperCase(), w: 56, bold: true, color: col }, { t: i.res_status !== 'open' && i.res_status ? i.res_status.replace('_', ' ') : '', w: 80 }]);
      });
      pdf.h('Observed defects');
      pdf.row([{ t: '#', w: 28 }, { t: 'Room / location', w: 118 }, { t: 'Description', w: 366 }], { head: true, size: 8.5 });
      if (!defects.length) pdf.row([{ t: '', w: 28 }, { t: '', w: 118 }, { t: 'None recorded.', w: 366 }]);
      defects.forEach((i, n) => pdf.row([{ t: String(n + 1), w: 28 }, { t: i.room ?? '', w: 118 }, { t: i.description, w: 366 }]));
      if (insp.notes) { pdf.h('Notes'); pdf.text(insp.notes); }
      const b = sg.find(s => s.role === 'builder');
      pdf.h('Signed');
      pdf.text(`${insp.inspector_name ?? ''}   |   ${fmtD(insp.completed_at)}`, { bold: true });
      if (b) { const d = dataUrl(b.signature); const im = d && await pdf.img(d.bytes, d.mime); if (im) { pdf.ensure(65); const r = pdf.drawImg(im, M, pdf.y, 200, 55); pdf.y -= r.h + 6; } }
    }

    // Photo record: every photo, labelled with its finding.
    const withPhotos = its.filter(i => phs.some(p => p.item_id === i.id));
    if (withPhotos.length) {
      pdf.add(); pdf.text('Photo record', { size: 15, bold: true, color: NAVY, gap: 6 });
      for (const it of withPhotos) {
        const label = it.list === 'si_check' ? `${SRC_NAME(it.source)}: ${it.description}` : `${it.list === 'substitution' ? 'Substitution' : it.list === 'not_assessed' ? 'Not assessed' : 'Defect'} ${it.list === 'deficiency' && isPdi ? '#' + numOf.get(it.id) : ''}${it.room ? ' - ' + it.room : ''}: ${it.description}`;
        pdf.ensure(150); pdf.text(label, { size: 9.5, bold: true });
        const mine = phs.filter(p => p.item_id === it.id); let x = M; const rowTop = pdf.y; let rowH = 0;
        for (const p of mine) {
          const { data: blob } = await admin.storage.from('inspection-photos').download(p.storage_path); if (!blob) continue;
          const im = await pdf.img(new Uint8Array(await blob.arrayBuffer()), 'image/jpeg'); if (!im) continue;
          if (x + 160 > W - M) { x = M; pdf.y -= rowH + 8; rowH = 0; pdf.ensure(130); }
          const top = pdf.y; const r = pdf.drawImg(im, x, top, 160, 120); rowH = Math.max(rowH, r.h); x += 170;
        }
        pdf.y = (rowH ? pdf.y - rowH : pdf.y) - 14; void rowTop;
      }
    }
    // page numbers
    pdf.doc.getPages().forEach((pg, i, all) => { const t = `Page ${i + 1} of ${all.length}`; pg.drawText(t, { x: W - M - pdf.font.widthOfTextAtSize(t, 8), y: 24, size: 8, font: pdf.font, color: GREY }); pg.drawText(clean(`${co?.name ?? ''} | ${addr}`), { x: M, y: 24, size: 8, font: pdf.font, color: GREY }); });

    const bytes = await pdf.doc.save();
    const path = `${insp.company_id}/${inspection_id}/${isPdi ? 'pdi-form' : 'qci-report'}.pdf`;
    const up = await admin.storage.from('inspection-photos').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (up.error) return json({ error: 'Could not store the PDF: ' + up.error.message }, 500);
    await admin.from('inspections').update({ pdf_path: path, status: 'sent', sent_at: new Date().toISOString() }).eq('id', inspection_id);

    // emails (test mode forces everything to the tester)
    const app = (Deno.env.get('APP_URL') ?? 'https://builder-guardian-app.netlify.app').replace(/\/$/, '');
    const { data: signed } = await admin.storage.from('inspection-photos').createSignedUrl(path, 7 * 86400);
    const wrapM = (b: string) => `<div style="font-family:Arial,sans-serif;color:#1F2A3C;max-width:560px;line-height:1.5"><p style="font-size:13px;color:#6C7280;margin:0 0 12px">${esc(co?.name ?? '')}</p>${b}</div>`;
    const btn = (href: string, t: string) => `<p style="margin:16px 0"><a href="${esc(href)}" style="background:#3F6A8F;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">${esc(t)}</a></p>`;
    const results: Rec = {};
    const open = isPdi ? defects.length : defects.length + si.filter(i => i.result === 'wrong' || i.result === 'missing').length;
    results.super = await sendMail(insp.super_email ? [insp.super_email] : [], `${isPdi ? 'PDI' : 'QCI'} findings: ${addr}`,
      wrapM(`<p>Hello${insp.super_name ? ' ' + esc(insp.super_name) : ''},</p><p>The ${isPdi ? 'pre-delivery inspection' : 'quality control inspection'} for <b>${esc(addr)}</b> was signed by ${esc(insp.inspector_name ?? '')}. <b>${open}</b> item${open === 1 ? '' : 's'} need${open === 1 ? 's' : ''} attention${isPdi ? ` and ${nas.length} could not be assessed` : ''}.</p>${btn(`${app}/portal/inspection/${insp.super_token}`, 'See the items and mark them fixed')}${signed?.signedUrl ? `<p><a href="${esc(signed.signedUrl)}">Download the signed PDF</a> (link works for 7 days)</p>` : ''}`));
    if (isPdi) {
      const ownerTo: string[] = insp.owner_emails ?? [];
      results.owner = await sendMail(ownerTo, `Your pre-delivery inspection form: ${addr}`,
        wrapM(`<p>Hello${insp.owner_names ? ' ' + esc(insp.owner_names) : ''},</p><p>Thank you for completing the pre-delivery inspection of your new home at <b>${esc(addr)}</b>. Your signed copy is below. The items listed will be completed by our construction team.</p>${btn(`${app}/portal/inspection/${insp.owner_token}`, 'See your inspection form')}${signed?.signedUrl ? `<p><a href="${esc(signed.signedUrl)}">Download your signed PDI form (PDF)</a></p>` : ''}`));
      // CCP prep, for the builder (the CCP and Warranty Certificate itself is submitted in Tarion BuilderLink within 15 days of possession)
      results.ccp = await sendMail([], `CCP prep: ${addr} (due within 15 days of possession)`,
        wrapM(`<p><b>Certificate of Completion and Possession (CCP) data.</b> Complete the CCP and Warranty Certificate on the PDI date and submit them to Tarion in BuilderLink within 15 days of possession (${esc(fmtD(insp.possession_date))}).</p><table style="font-size:14px;border-collapse:collapse"><tr><td style="padding:3px 12px 3px 0;color:#6C7280">Address</td><td>${esc(insp.address ?? '')}</td></tr><tr><td style="padding:3px 12px 3px 0;color:#6C7280">Enrolment #</td><td>${esc(insp.enrolment_no ?? '')}</td></tr><tr><td style="padding:3px 12px 3px 0;color:#6C7280">PDI date</td><td>${esc(fmtD(insp.completed_at))}</td></tr><tr><td style="padding:3px 12px 3px 0;color:#6C7280">Date of possession</td><td>${esc(fmtD(insp.possession_date))}</td></tr><tr><td style="padding:3px 12px 3px 0;color:#6C7280">Purchaser</td><td>${esc(insp.owner_names ?? '')}${insp.purchaser_present ? '' : ' (did not attend: note this on the PDI form and the CCP)'}</td></tr><tr><td style="padding:3px 12px 3px 0;color:#6C7280">PDI items listed</td><td>${defects.length} defects, ${subs.length} substitutions, ${nas.length} not assessed</td></tr></table>`));
    }
    await admin.from('notifications').insert({ company_id: insp.company_id, target_role: 'coordinator', type: 'inspection_signed', title: `${isPdi ? 'PDI' : 'QCI'} signed: ${addr}`, body: `${open} item${open === 1 ? '' : 's'} for construction${isPdi ? '. CCP due within 15 days of possession.' : ''}`, metadata: { inspection_id } });
    return json({ ok: true, pdf_path: path, emails: results, test_mode: !LIVE });
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});

function SRC_NAME(s: string) { return s === 'site_instruction' ? 'Site instruction' : s === 'selection' ? 'Selection' : s === 'upgrade' ? 'Upgrade' : 'Observed'; }
