// aging-review: the report for the Aging "All sites review". Days only, no AI.
// Signed-in users only. The company always comes from the signed-in user.
//   { action: 'report', keep_days?, close_days?, file?, send?: boolean }  builds the report from aging_review();
//        with send=true it is emailed (TEST MODE: only to MAIL_TEST_TO unless MAIL_LIVE=true). Returns { html, counts, mail }.
// The keep/close rule is the aging_review() SQL function, so the screen and the report always agree. Nothing is closed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ───────── mail (same test-mode rule as the other functions) ─────────
const LIVE = Deno.env.get('MAIL_LIVE') === 'true';
const TEST_TO = Deno.env.get('MAIL_TEST_TO') ?? 'james.barbeau@claridgehomes.com';
async function sendMail(realTo: string[], realSubject: string, realHtml: string): Promise<string> {
  const to = LIVE ? realTo : [TEST_TO];
  const subject = LIVE ? realSubject : `[TEST] ${realSubject}`;
  const html = LIVE ? realHtml : `<p style="background:#FFF4D6;border:1px solid #E0C36A;padding:8px 10px;font:12px Arial,sans-serif;color:#5B4A10;margin:0 0 14px">TEST MODE. This would have gone to: ${esc(realTo.join(', ') || 'nobody')}.</p>${realHtml}`;
  const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('MAIL_FROM'), hook = Deno.env.get('MAIL_WEBHOOK_URL');
  try {
    if (key && from) {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, subject, html }) });
      return r.ok ? 'sent' : `Resend HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`;
    }
    if (hook) {
      const r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'follow', body: JSON.stringify({ secret: Deno.env.get('MAIL_WEBHOOK_SECRET') ?? '', to, subject, html }) });
      const t = await r.text();
      return r.ok && /ok/i.test(t) ? 'sent' : `mail webhook HTTP ${r.status}: ${t.slice(0, 160)}`;
    }
  } catch (e) { return (e as Error).message.slice(0, 160); }
  return 'not_configured';
}

// ───────── auth ─────────
async function requireUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: row } = await admin.from('users').select('company_id, is_active').eq('id', data.user.id).maybeSingle();
  if (!row?.company_id || row.is_active === false) return null;
  // A client that acts as the signed-in user, so row security limits every read to their own company.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  return { admin, asUser, id: data.user.id, email: data.user.email ?? '', companyId: row.company_id as string };
}

// ───────── report ─────────
// The report is a close list: only items that are safe to close or well past 3 years, grouped by community and home.
// Each home carries a pie of all of its outstanding items (keep open / safe to close / close) so the remainder is visible at a glance.
const SEG = [
  { key: 'keep_followup', label: 'Keep open', color: '#C77D12' },
  { key: 'safe_close', label: 'Safe to close', color: '#2E9B6A' },
  { key: 'close_now', label: 'Close', color: '#4A6FC2' },
];
const CLOSEABLE = ['safe_close', 'close_now'];

function pieSvg(c: Record<string, number>, size = 76) {
  const parts = SEG.map(g => ({ ...g, n: c[g.key] ?? 0 })).filter(g => g.n > 0);
  const total = parts.reduce((a, g) => a + g.n, 0); if (!total) return '';
  const r = size / 2 - 1, cx = size / 2, cy = size / 2;
  const label = parts.map(g => `${g.label} ${g.n}`).join(', ');
  let body = '';
  if (parts.length === 1) body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${parts[0].color}"/>`;
  else {
    let ang = -Math.PI / 2;
    for (const g of parts) {
      const sweep = (g.n / total) * Math.PI * 2, end = ang + sweep;
      const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang), x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
      body += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${g.color}" stroke="#fff" stroke-width="2"/>`;
      ang = end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">${body}</svg>`;
}
// Email clients drop inline SVG, so the email shows the same split as a stacked bar built from table cells.
function barHtml(c: Record<string, number>) {
  const parts = SEG.map(g => ({ ...g, n: c[g.key] ?? 0 })).filter(g => g.n > 0);
  const total = parts.reduce((a, g) => a + g.n, 0); if (!total) return '';
  return `<table role="presentation" width="220" style="border-collapse:separate;border-spacing:2px 0;width:220px;margin:4px 0"><tr>${parts.map(g => `<td width="${Math.max(6, Math.round((g.n / total) * 100))}%" height="12" style="background:${g.color};font-size:1px;line-height:12px">&nbsp;</td>`).join('')}</tr></table>`;
}
const legend = (c: Record<string, number>) => SEG.filter(g => (c[g.key] ?? 0) > 0).map(g => `<span style="white-space:nowrap;margin-right:10px"><span style="display:inline-block;width:9px;height:9px;background:${g.color};border-radius:2px;vertical-align:baseline"></span> ${g.label} <b>${c[g.key]}</b></span>`).join('');

async function loadReview(u: any, keepDays: number, closeDays: number, file: string | null) {
  const all: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await u.asUser.rpc('aging_review', { p_min_days: 0, p_community: null, p_file: file, p_keep_days: keepDays, p_close_days: closeDays }).range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? [])); if (!data || data.length < 1000) break;
  }
  return all;
}

function buildReport(company: string, rows: any[], keepDays: number, closeDays: number, detail: 'full' | 'compact', appUrl: string) {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: 'long', day: 'numeric' });
  const byLot = new Map<string, { first: any; counts: Record<string, number>; close: any[] }>();
  for (const r of rows) {
    let l = byLot.get(r.lot_id); if (!l) { l = { first: r, counts: {}, close: [] }; byLot.set(r.lot_id, l); }
    l.counts[r.bucket] = (l.counts[r.bucket] ?? 0) + 1;
    if (CLOSEABLE.includes(r.bucket)) l.close.push(r);
  }
  const lots = [...byLot.values()].filter(l => l.close.length);
  const nSafe = rows.filter(r => r.bucket === 'safe_close').length, nClose = rows.filter(r => r.bucket === 'close_now').length;
  const nKeep = rows.filter(r => r.bucket === 'keep_followup').length;
  const n = (v: number) => v.toLocaleString('en-CA');
  let h = `<div style="font-family:Arial,sans-serif;color:#1F2A3C;max-width:760px;line-height:1.45">
<p style="font-size:13px;color:#6C7280;margin:0 0 4px">${esc(company)} · ${esc(day)}</p>
<h1 style="font-size:20px;margin:0 0 6px">Items to close</h1>
<p style="font-size:13px;color:#485163;margin:0 0 12px">${n(nSafe + nClose)} open items in ${n(lots.length)} homes can be closed. Safe to close: still open after ${keepDays} days, so no later Tarion form can pick them up (${n(nSafe)}). Close: more than ${closeDays} days since closing (${n(nClose)}). The pie on each home shows all of its outstanding items. ${n(nKeep)} other open items are still inside the ${keepDays}-day window and stay open (see Aging in the app). Nothing has been closed.</p>`;
  const byComm = new Map<string, typeof lots>();
  for (const l of lots) { const k = l.first.community; if (!byComm.has(k)) byComm.set(k, []); byComm.get(k)!.push(l); }
  for (const [comm, list] of byComm) {
    const items = list.reduce((a, l) => a + l.close.length, 0);
    h += `<h2 style="font-size:16px;margin:22px 0 6px;border-top:3px solid #1F2A3C;padding-top:8px">${esc(comm)} <span style="font-weight:normal;font-size:13px;color:#6C7280">· ${list.length} homes, ${items} items to close</span></h2>`;
    for (const l of list) {
      const f = l.first;
      const head = `<b>${esc(f.address ?? 'Lot ' + f.lot_number)}</b> <span style="color:#6C7280">· Lot ${esc(f.lot_number)}${f.owner ? ' · ' + esc(f.owner) : ''}${f.age_days != null ? ' · ' + n(f.age_days) + ' days since closing' : ''}</span>`;
      const total = Object.values(l.counts).reduce((a, b) => a + b, 0);
      const chart = detail === 'full' ? pieSvg(l.counts) : barHtml(l.counts);
      const itemsHtml = l.close.map(r => `<div style="font-size:12.5px;margin:3px 0;color:#2B3446"><span style="display:inline-block;min-width:78px;font-weight:bold">${esc(r.item_number ?? '')}</span><span style="display:inline-block;font-size:11px;padding:0 6px;border-radius:9px;color:#fff;background:${r.bucket === 'close_now' ? '#4A6FC2' : '#2E9B6A'};margin-right:6px">${r.bucket === 'close_now' ? 'Close' : 'Safe'}</span>${esc((r.description ?? '').slice(0, detail === 'full' ? 200 : 90))}</div>`).join('');
      h += detail === 'full'
        ? `<table role="presentation" style="border-collapse:collapse;width:100%;margin:8px 0 12px;page-break-inside:avoid"><tr><td style="width:88px;vertical-align:top;padding:2px 12px 0 0">${chart}</td><td style="vertical-align:top"><div style="font-size:13px">${head}</div><div style="font-size:12px;color:#485163;margin:2px 0 4px">${total} outstanding: ${legend(l.counts)}</div>${itemsHtml}</td></tr></table>`
        : `<div style="margin:8px 0 12px"><div style="font-size:13px">${head}</div>${chart}<div style="font-size:12px;color:#485163;margin:0 0 4px">${total} outstanding: ${legend(l.counts)}</div>${itemsHtml}</div>`;
    }
  }
  if (!lots.length) h += `<p style="font-size:13px">Nothing is ready to close at these settings.</p>`;
  if (detail === 'compact') h += `<p style="font-size:13px;margin-top:20px">Pie charts and the full list are in the app: <a href="${esc(appUrl)}/warranty/aging">Aging, All sites review</a>.</p>`;
  return { html: h + '</div>', counts: { safe_close: nSafe, close_now: nClose, keep_followup: nKeep }, lots: lots.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const u = await requireUser(req);
    if (!u) return json({ error: 'Sign in required' }, 401);
    const body = await req.json().catch(() => ({}));
    const keepDays = Math.max(30, Math.min(3650, Number(body.keep_days ?? 730) | 0));
    const closeDays = Math.max(keepDays, Math.min(3650, Number(body.close_days ?? 1095) | 0));
    const file: string | null = typeof body.file === 'string' && body.file ? body.file : null;

    if (body.action === 'report') {
      const rows = await loadReview(u, keepDays, closeDays, file);
      const { data: co } = await u.admin.from('companies').select('name').eq('id', u.companyId).maybeSingle();
      const company = co?.name ?? 'Your company';
      const appUrl = (Deno.env.get('APP_URL') ?? 'https://builder-guardian-app.netlify.app').replace(/\/$/, '');
      const full = buildReport(company, rows, keepDays, closeDays, 'full', appUrl);
      let mail: string | null = null;
      if (body.send === true) {
        const compact = buildReport(company, rows, keepDays, closeDays, 'compact', appUrl);
        mail = await sendMail([u.email].filter(Boolean), `Items to close: ${full.counts.safe_close + full.counts.close_now} in ${full.lots} homes`, compact.html);
      }
      return json({ html: full.html, counts: full.counts, total: full.counts.safe_close + full.counts.close_now, mail, test_mode: !LIVE });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e); return json({ error: (e as Error).message }, 500);
  }
});
