// aging-review: the report for the Aging "All sites review". Days only, no AI.
// Signed-in users only. The company always comes from the signed-in user.
//   { action: 'report', min_days, keep_days?, close_days?, file?, send?: boolean }  builds the report from aging_review();
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
const GROUPS: { key: string; title: string; blurb: string; color: string; match: string[] }[] = [
  { key: 'keep_followup', title: 'Keep open: resolve and update the owner', blurb: 'Still inside the warranty window. Resolve these and update the owner.', color: '#3F6A8F', match: ['keep_followup'] },
  { key: 'safe_close', title: 'Safe to close: no risk for a Tarion form', blurb: 'Past the 2-year window, so no later Tarion form can pick these up. Tell the owner when you close them.', color: '#5E7F5A', match: ['safe_close'] },
  { key: 'close_now', title: 'Close: well past 3 years', blurb: 'More than 3 years since closing. Close these.', color: '#2F4A5E', match: ['close_now'] },
  { key: 'needs_review', title: 'No closing date', blurb: 'The home has no closing date, or it is still ahead, so these cannot be aged. Set the date first.', color: '#8D7140', match: ['needs_review'] },
];

async function loadReview(u: any, minDays: number, keepDays: number, closeDays: number, file: string | null) {
  const all: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await u.asUser.rpc('aging_review', { p_min_days: minDays, p_community: null, p_file: file, p_keep_days: keepDays, p_close_days: closeDays }).range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? [])); if (!data || data.length < 1000) break;
  }
  return all;
}

function buildReport(company: string, rows: any[], minDays: number, keepDays: number, closeDays: number, detail: 'full' | 'compact', appUrl: string) {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: 'long', day: 'numeric' });
  const counts: Record<string, number> = {}; for (const r of rows) counts[r.bucket] = (counts[r.bucket] ?? 0) + 1;
  const lots = new Set(rows.map(r => r.lot_id)).size;
  let h = `<div style="font-family:Arial,sans-serif;color:#1F2A3C;max-width:760px;line-height:1.45">
<p style="font-size:13px;color:#6C7280;margin:0 0 4px">${esc(company)} · ${esc(day)}</p>
<h1 style="font-size:20px;margin:0 0 6px">Aging review: open items more than ${minDays} days after closing</h1>
<p style="font-size:13px;color:#485163;margin:0 0 14px">${rows.length.toLocaleString('en-CA')} open items across ${lots.toLocaleString('en-CA')} homes. Recommendations go by days since closing: keep open and resolve up to ${keepDays} days, safe to close up to ${closeDays} days, close beyond that. Nothing has been closed.</p>
<table style="border-collapse:collapse;font-size:13px;margin:0 0 18px"><tbody>${GROUPS.map(g => `<tr><td style="padding:4px 12px 4px 0"><span style="display:inline-block;width:10px;height:10px;background:${g.color};border-radius:2px"></span> ${esc(g.title)}</td><td style="padding:4px 0;font-weight:bold;text-align:right">${(counts[g.key] ?? 0).toLocaleString('en-CA')}</td></tr>`).join('')}</tbody></table>`;
  for (const g of GROUPS) {
    const items = rows.filter(r => g.match.includes(r.bucket)); if (!items.length) continue;
    h += `<h2 style="font-size:16px;margin:22px 0 2px;border-top:3px solid ${g.color};padding-top:8px">${esc(g.title)} (${items.length.toLocaleString('en-CA')})</h2><p style="font-size:13px;color:#485163;margin:0 0 8px">${esc(g.blurb)}</p>`;
    const byComm = new Map<string, Map<string, any[]>>();
    for (const r of items) { if (!byComm.has(r.community)) byComm.set(r.community, new Map()); const m = byComm.get(r.community)!; if (!m.has(r.lot_id)) m.set(r.lot_id, []); m.get(r.lot_id)!.push(r); }
    for (const [comm, lotsMap] of byComm) {
      h += `<h3 style="font-size:14px;margin:12px 0 4px">${esc(comm)} <span style="font-weight:normal;color:#6C7280">· ${lotsMap.size} homes, ${[...lotsMap.values()].reduce((a, b) => a + b.length, 0)} items</span></h3>`;
      for (const list of lotsMap.values()) {
        const f = list[0];
        const head = `<b>${esc(f.address ?? 'Lot ' + f.lot_number)}</b> <span style="color:#6C7280">· Lot ${esc(f.lot_number)}${f.owner ? ' · ' + esc(f.owner) : ''}${f.age_days != null ? ' · ' + f.age_days + ' days since closing' : ' · no closing date'}</span>`;
        if (detail === 'compact') h += `<p style="font-size:13px;margin:2px 0">${head}<br><span style="color:#485163">${list.length} item${list.length > 1 ? 's' : ''}: ${list.map(r => esc(r.item_number ?? '')).filter(Boolean).join(', ')}</span></p>`;
        else h += `<div style="margin:6px 0 10px"><div style="font-size:13px">${head}</div>${list.map(r => `<div style="font-size:12.5px;margin:3px 0 0 14px;color:#2B3446"><b>${esc(r.item_number ?? '')}</b> <span style="color:#6C7280">${esc(r.form)}</span> ${esc((r.description ?? '').slice(0, 220))}<br><span style="color:#6C7280">${esc(r.bucket_reason)}</span></div>`).join('')}</div>`;
      }
    }
  }
  if (detail === 'compact') h += `<p style="font-size:13px;margin-top:20px">Item descriptions are in the app: <a href="${esc(appUrl)}/warranty/aging">Aging, All sites review</a>.</p>`;
  return { html: h + '</div>', counts };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const u = await requireUser(req);
    if (!u) return json({ error: 'Sign in required' }, 401);
    const body = await req.json().catch(() => ({}));
    const minDays = Math.max(0, Math.min(3650, Number(body.min_days ?? 300) | 0));
    const keepDays = Math.max(30, Math.min(3650, Number(body.keep_days ?? 730) | 0));
    const closeDays = Math.max(keepDays, Math.min(3650, Number(body.close_days ?? 1095) | 0));
    const file: string | null = typeof body.file === 'string' && body.file ? body.file : null;

    if (body.action === 'report') {
      const rows = await loadReview(u, minDays, keepDays, closeDays, file);
      const { data: co } = await u.admin.from('companies').select('name').eq('id', u.companyId).maybeSingle();
      const company = co?.name ?? 'Your company';
      const appUrl = (Deno.env.get('APP_URL') ?? 'https://builder-guardian-app.netlify.app').replace(/\/$/, '');
      const full = buildReport(company, rows, minDays, keepDays, closeDays, 'full', appUrl);
      let mail: string | null = null;
      if (body.send === true) {
        const compact = buildReport(company, rows, minDays, keepDays, closeDays, 'compact', appUrl);
        mail = await sendMail([u.email].filter(Boolean), `Aging review: ${rows.length} open items over ${minDays} days`, compact.html);
      }
      return json({ html: full.html, counts: full.counts, total: rows.length, mail, test_mode: !LIVE });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e); return json({ error: (e as Error).message }, 500);
  }
});
