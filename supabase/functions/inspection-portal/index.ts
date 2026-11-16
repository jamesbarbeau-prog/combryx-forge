// inspection-portal: photo links and closing-photo upload for the superintendent / owner link (no login; the private token is the key).
//   JSON  { action: 'photos', token }                   -> { photos: [{ item_id, kind, url }] }
//   multipart { token, item_id, name, file }             -> uploads a CLOSING photo for an item (superintendent link only)
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 8 * 1024 * 1024;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
    const ct = req.headers.get('content-type') ?? '';
    const find = async (token: string, superOnly: boolean) => {
      if (!UUID.test(token)) return null;
      const { data: s } = await admin.from('inspections').select('id, company_id, kind, status').eq('super_token', token).in('status', ['signed', 'sent']).maybeSingle();
      if (s) return { ...s, role: 'super' };
      if (superOnly) return null;
      const { data: o } = await admin.from('inspections').select('id, company_id, kind, status').eq('owner_token', token).eq('kind', 'pdi').in('status', ['signed', 'sent']).maybeSingle();
      return o ? { ...o, role: 'owner' } : null;
    };

    if (ct.includes('multipart/form-data')) {
      const f = await req.formData();
      const token = String(f.get('token') ?? ''), itemId = String(f.get('item_id') ?? ''), name = String(f.get('name') ?? '').slice(0, 80);
      const file = f.get('file');
      if (!(file instanceof File)) return json({ error: 'Attach a photo.' }, 400);
      if (!file.type.startsWith('image/')) return json({ error: 'Only photos can be uploaded.' }, 400);
      if (file.size > MAX) return json({ error: 'That photo is too large. Try again.' }, 413);
      const insp = await find(token, true);
      if (!insp || !UUID.test(itemId)) return json({ error: 'This link is not valid.' }, 403);
      const { data: item } = await admin.from('inspection_items').select('id, res_status').eq('id', itemId).eq('inspection_id', insp.id).maybeSingle();
      if (!item) return json({ error: 'Item not found.' }, 404);
      if (item.res_status !== 'open') return json({ error: 'This item is already closed.' }, 409);
      const path = `${insp.company_id}/${insp.id}/closing-${crypto.randomUUID()}.jpg`;
      const up = await admin.storage.from('inspection-photos').upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type });
      if (up.error) return json({ error: 'Could not store the photo.' }, 500);
      const { error } = await admin.from('inspection_photos').insert({ company_id: insp.company_id, inspection_id: insp.id, item_id: itemId, storage_path: path, kind: 'closing', uploaded_by: name || null });
      if (error) { await admin.storage.from('inspection-photos').remove([path]); return json({ error: 'Could not save the photo.' }, 500); }
      return json({ ok: true });
    }

    const body = await req.json().catch(() => ({}));
    if (body.action === 'photos') {
      const insp = await find(String(body.token ?? ''), false);
      if (!insp) return json({ photos: [] });
      const { data: ph } = await admin.from('inspection_photos').select('item_id, kind, storage_path').eq('inspection_id', insp.id).not('item_id', 'is', null).order('created_at');
      const out: { item_id: string; kind: string; url: string }[] = [];
      for (const p of (ph ?? []).slice(0, 120)) {
        const { data: s } = await admin.storage.from('inspection-photos').createSignedUrl(p.storage_path, 3600);
        if (s?.signedUrl) out.push({ item_id: p.item_id, kind: p.kind, url: s.signedUrl });
      }
      return json({ photos: out });
    }
    return json({ error: 'Unknown request.' }, 400);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
