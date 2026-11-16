// ai-draft — drafts warranty-department emails (new or reply). Signed-in users only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Must be a real signed-in user who belongs to a company. The anon key alone is refused.
async function requireUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: row } = await admin.from('users').select('company_id, is_active').eq('id', data.user.id).maybeSingle();
  if (!row?.company_id || row.is_active === false) return null;
  return { id: data.user.id, companyId: row.company_id as string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Sign in required' }, 401);
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'AI is not configured' }, 503);

    const b = await req.json();
    const sig = String(b.signature || 'Warranty Department').slice(0, 80);
    const compose = b.replyMode === 'compose';
    const system = compose
      ? `You are a professional Ontario home builder warranty coordinator writing a NEW OUTBOUND EMAIL to ${b.senderEmail}. You are the sender, not a recipient.`
      : `You are a professional Ontario home builder warranty coordinator writing a REPLY to an incoming message.`;
    const rules = `RULES:
- Professional but warm. Reference lot and case numbers when given.
- Never promise repair dates unless stated. Homeowners: empathetic, clear next steps. Trades: direct, clear scope. Tarion: short and formal with enrolment and case numbers, detail goes in an attachment. Internal: brief.
- Sign off as: ${sig}
- No subject line, body only. No placeholders in brackets. Complete the email, under ${compose ? 150 : 200} words.`;
    const ctx = compose
      ? `RECIPIENT: ${b.senderEmail}\nSUBJECT: ${b.subject}\n${b.lotNumber ? 'LOT: ' + b.lotNumber + '\n' : ''}${b.caseNumber ? 'CASE: ' + b.caseNumber + '\n' : ''}NOTES TO TURN INTO THE EMAIL:\n${b.userDraft || b.subject}`
      : `TYPE: ${b.messageType ?? 'general'}\nFROM: ${b.senderName} <${b.senderEmail}>\nSUBJECT: ${b.subject}\n${b.lotNumber ? 'LOT: ' + b.lotNumber + '\n' : ''}${b.caseNumber ? 'CASE: ' + b.caseNumber + '\n' : ''}${b.brpDaysLeft != null ? 'BRP DAYS LEFT: ' + b.brpDaysLeft + '\n' : ''}${b.itemsOutstanding != null ? 'ITEMS OUTSTANDING: ' + b.itemsOutstanding + '\n' : ''}MESSAGE REPLIED TO:\n${String(b.lastMessage ?? '').slice(0, 6000)}\n\n${b.userDraft ? 'IMPROVE THIS DRAFT, KEEP THE INTENT:\n' + b.userDraft : 'Write the reply from scratch.'}`;

    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${system}\n\n${rules}\n\n${ctx}` }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      }),
    });
    if (!res.ok) return json({ error: 'AI request failed' }, 502);
    const data = await res.json();
    return json({ draft: String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim() });
  } catch (e) {
    console.error('ai-draft', e);
    return json({ error: 'Draft failed' }, 500);
  }
});
