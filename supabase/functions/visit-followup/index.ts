// visit-followup — end-of-day check on every scheduled work order, plus the next-day sweep.
//   eod    today's accepted visits: email the trade/technician ("did you attend?") and the owner ("did they come, are you satisfied?")
//   sweep  remind whoever has not answered, alert the office when nobody answers, and tell trade + owner about a reported no-show
// Body: { mode: 'eod' | 'sweep' | 'all' }  (default all). Runs from a schedule (x-cron-secret = CM_CRON_SECRET) or by a signed-in Conciliation Manager manager.
// Email: RESEND_API_KEY + MAIL_FROM  or  MAIL_WEBHOOK_URL + MAIL_WEBHOOK_SECRET (same as tarion-sync).  APP_URL = public address of the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

type Rec = Record<string, any>;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const TZ = 'America/Toronto';
const dayOf = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const nice = (d: string | null) => d ? new Date(d).toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }) : '';

async function sendMail(to: string[], subject: string, html: string): Promise<'sent' | 'not_configured' | string> {
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

const wrap = (company: string, body: string) => `<div style="font-family:Arial,sans-serif;color:#1F2A3C;max-width:560px;line-height:1.5"><p style="font-size:13px;color:#6C7280;margin:0 0 12px">${esc(company)}</p>${body}</div>`;
const btn = (href: string, text: string) => `<p style="margin:18px 0"><a href="${esc(href)}" style="background:#3F6A8F;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">${esc(text)}</a></p>`;

async function context(admin: any, companyId: string, w: Rec) {
  const [{ data: co }, { data: lot }] = await Promise.all([
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
    w.lot_id ? admin.from('warranty_lots').select('address, homeowner_name, homeowner_first, homeowner_email, homeowner_email2').eq('id', w.lot_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const ownerTo = [lot?.homeowner_email, lot?.homeowner_email2].filter(Boolean) as string[];
  return { company: co?.name ?? 'Your builder', address: w.address || lot?.address || 'your home', ownerTo, ownerName: lot?.homeowner_first || lot?.homeowner_name || '' };
}

async function sendChecks(admin: any, app: string, companyId: string, w: Rec, reminder: boolean) {
  const c = await context(admin, companyId, w);
  const day = nice(w.scheduled_time ?? w.proposed_at);
  const tradeLink = `${app}/portal/work-order/${w.portal_token}`, ownerLink = `${app}/portal/visit/${w.owner_token}`;
  let sent = 0, notConfigured = 0;
  const tally = (r: string) => { if (r === 'sent') sent++; else if (r === 'not_configured') notConfigured++; };
  if (w.recipient_email) {
    tally(await sendMail([w.recipient_email], `${reminder ? 'Reminder: ' : ''}Did you attend today's visit? ${w.issue}`.slice(0, 150),
      wrap(c.company, `<p>${reminder ? 'We have not heard back yet. ' : ''}Please confirm whether you attended the work order at <b>${esc(c.address)}</b>${day ? ` on ${esc(day)}` : ''}.</p><p style="color:#485163">${esc(w.issue)}</p>${btn(tradeLink, 'Confirm attendance')}<p style="font-size:13px;color:#6C7280">If you could not attend, tell us there and the office will rebook.</p>`)));
  }
  if (c.ownerTo.length) {
    tally(await sendMail(c.ownerTo, `${reminder ? 'Reminder: ' : ''}How did today's repair visit go?`,
      wrap(c.company, `<p>Hello${c.ownerName ? ' ' + esc(c.ownerName) : ''},</p><p>${esc(w.recipient_name || 'A trade')} was scheduled to visit your home${day ? ` on ${esc(day)}` : ''} for: <b>${esc(w.issue)}</b>.</p><p>Two quick questions: did they come, and are you satisfied?</p>${btn(ownerLink, 'Answer in 20 seconds')}<p style="font-size:13px;color:#6C7280">If nobody came, please tell us so we can fix it right away.</p>`)));
  }
  return { sent, notConfigured, hasOwnerEmail: c.ownerTo.length > 0, hasTradeEmail: !!w.recipient_email };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode ?? 'all';
    const admin = createClient(url, (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
    let companyId: string;
    const cron = req.headers.get('x-cron-secret');
    if (cron && cron === Deno.env.get('CM_CRON_SECRET')) {
      companyId = Deno.env.get('CM_COMPANY_ID') ?? (await admin.from('cm_settings').select('company_id').limit(1).maybeSingle()).data?.company_id;
      if (!companyId) return json({ error: 'CM_COMPANY_ID is not set.' }, 400);
    } else {
      const db = createClient(url, (Deno.env.get('SB_PUBLISHABLE_KEY') ?? 'sb_publishable_2gScWn0IHoGB3vRAgrwLLA_a_IfsKNV'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await db.auth.getUser();
      if (!user) return json({ error: 'Sign in required.' }, 401);
      const { data: m } = await db.from('cm_members').select('company_id').eq('user_id', user.id).eq('role', 'manager').limit(1).maybeSingle();
      if (!m) return json({ error: 'Managers only.' }, 403);
      companyId = m.company_id;
    }
    const app = (Deno.env.get('APP_URL') ?? 'https://builder-guardian-app.netlify.app').replace(/\/$/, '');
    const out: Rec = { eod: { checked: 0, emailed: 0, needsManualSend: 0 }, sweep: { reminded: 0, escalated: 0, noShowNotified: 0 }, errors: [] as string[] };
    const now = Date.now(), today = dayOf(new Date());
    const alert = (type: string, title: string, b: string, id?: string) => admin.from('notifications').insert({ company_id: companyId, target_role: 'coordinator', type, title, body: b, metadata: id ? { work_order_id: id } : {} });

    // End of day: today's (and any missed) accepted visits that have not been checked yet.
    if (mode === 'all' || mode === 'eod') {
      const { data: wos } = await admin.from('work_orders').select('*').eq('company_id', companyId).eq('status', 'scheduled').is('visit_check_sent_at', null)
        .gte('scheduled_time', new Date(now - 7 * 864e5).toISOString()).lte('scheduled_time', new Date(now + 36 * 36e5).toISOString());
      for (const w of (wos ?? []).filter((x: Rec) => dayOf(x.scheduled_time) <= today)) {
        try {
          const r = await sendChecks(admin, app, companyId, w, false);
          await admin.from('work_orders').update({ visit_check_sent_at: new Date().toISOString() }).eq('id', w.id);
          out.eod.checked++; out.eod.emailed += r.sent; if (r.notConfigured || (!r.hasOwnerEmail && !r.hasTradeEmail)) out.eod.needsManualSend++;
        } catch (e) { out.errors.push(`${w.id}: ${(e as Error).message.slice(0, 120)}`); }
      }
      if (out.eod.needsManualSend) await alert('work_order_check_manual', `${out.eod.needsManualSend} end-of-day visit check${out.eod.needsManualSend === 1 ? '' : 's'} could not be emailed`, 'Email is not set up or an address is missing. Open Work Orders, Visit checks, and copy the links.');
    }

    if (mode === 'all' || mode === 'sweep') {
      const { data: open } = await admin.from('work_orders').select('*').eq('company_id', companyId).not('visit_check_sent_at', 'is', null).is('trade_attended', null).is('owner_attended', null);
      for (const w of open ?? []) {
        try {
          const sentAge = (now - new Date(w.visit_check_sent_at).getTime()) / 36e5;
          if (!w.visit_reminder_sent_at && sentAge >= 16) {
            await sendChecks(admin, app, companyId, w, true);
            await admin.from('work_orders').update({ visit_reminder_sent_at: new Date().toISOString() }).eq('id', w.id); out.sweep.reminded++;
          } else if (w.visit_reminder_sent_at && !w.visit_escalated_at && (now - new Date(w.visit_reminder_sent_at).getTime()) / 36e5 >= 24) {
            await alert('work_order_unconfirmed', 'Nobody has confirmed a visit', `${w.issue} at ${w.address ?? 'site'}. Neither the trade nor the owner answered after a reminder. Call to confirm.`, w.id);
            await admin.from('work_orders').update({ visit_escalated_at: new Date().toISOString() }).eq('id', w.id); out.sweep.escalated++;
          }
        } catch (e) { out.errors.push(`${w.id}: ${(e as Error).message.slice(0, 120)}`); }
      }
      // A reported no-show: tell the trade to rebook and apologise to the owner (once).
      const { data: ns } = await admin.from('work_orders').select('*').eq('company_id', companyId).eq('status', 'no_show').is('noshow_notified_at', null);
      for (const w of ns ?? []) {
        try {
          const c = await context(admin, companyId, w);
          if (w.recipient_email) await sendMail([w.recipient_email], `Missed visit: ${w.issue}`.slice(0, 150), wrap(c.company, `<p>The visit at <b>${esc(c.address)}</b> was reported as not attended. Please contact us to rebook as soon as you can.</p>${btn(`${app}/portal/work-order/${w.portal_token}`, 'Open the work order')}`));
          if (c.ownerTo.length) await sendMail(c.ownerTo, 'We are sorry we missed you', wrap(c.company, `<p>Hello${c.ownerName ? ' ' + esc(c.ownerName) : ''},</p><p>We understand nobody attended your scheduled repair visit. We are sorry. We have contacted the trade and the office will be in touch to rebook.</p>`));
          await admin.from('work_orders').update({ noshow_notified_at: new Date().toISOString() }).eq('id', w.id); out.sweep.noShowNotified++;
        } catch (e) { out.errors.push(`${w.id}: ${(e as Error).message.slice(0, 120)}`); }
      }
    }
    return json(out);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
