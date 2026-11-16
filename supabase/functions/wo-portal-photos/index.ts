// wo-portal-photos — short-lived photo links for the work order a trade opened by its private token. No login; the token is the key.
// Body: { token }  ->  { photos: [{ item_id, url, name }] }  (up to 4 per item, links valid 1 hour)
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { token } = await req.json().catch(() => ({}));
    if (typeof token !== 'string' || !UUID.test(token)) return json({ photos: [] });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
    const { data: w } = await admin.from('work_orders').select('company_id, custom_fields').eq('portal_token', token).not('portal_sent_at', 'is', null).maybeSingle();
    if (!w) return json({ photos: [] });
    const cf = (w.custom_fields ?? {}) as { item_id?: string; item_ids?: string[] };
    const ids = [...new Set([...(cf.item_ids ?? []), ...(cf.item_id ? [cf.item_id] : [])])];
    if (!ids.length) return json({ photos: [] });
    const { data: ev } = await admin.from('warranty_item_evidence').select('item_id, evidence_type, storage_path, file_name, captured_at')
      .eq('company_id', w.company_id).in('item_id', ids).neq('evidence_type', 'access_log').not('storage_path', 'is', null).order('captured_at', { ascending: true });
    const per: Record<string, number> = {};
    const picked = (ev ?? []).filter((e: any) => /\.(jpe?g|png|webp|heic)(\.|$)/i.test(e.storage_path) && (per[e.item_id] = (per[e.item_id] ?? 0) + 1) <= 4);
    const photos: { item_id: string; url: string; name: string }[] = [];
    for (const e of picked as any[]) {
      const bucket = e.evidence_type === 'owner_photo' ? 'warranty-photos' : 'case-documents';
      const { data: s } = await admin.storage.from(bucket).createSignedUrl(e.storage_path, 3600);
      if (s?.signedUrl) photos.push({ item_id: e.item_id, url: s.signedUrl, name: e.file_name ?? '' });
    }
    return json({ photos });
  } catch (e) { return json({ photos: [], error: (e as Error).message }, 500); }
});
