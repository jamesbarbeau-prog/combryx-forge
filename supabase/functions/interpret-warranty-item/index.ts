// interpret-warranty-item — AI reading of one deficiency item against the OBC / CPG text stored in the database.
// Signed-in users only. The company always comes from the signed-in user, never from the request body.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.3-70b-versatile was shut down by Groq on 2026-08-16. gpt-oss-120b is the recommended replacement; qwen is the fallback.
const MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b'];
let MODEL = MODELS[0];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM_PROMPT = `You are a Tarion Warranty Program compliance expert for Ontario residential builders in Canada.
Interpret warranty deficiency items using ONLY the OBC and CPG content explicitly provided in each request.
ABSOLUTE RULES:
1. If no OBC content is provided, return obc.sections = [] and obc.interpretation = "No Ontario Building Code section found in database for this deficiency type."
2. If no CPG content is provided, return cpg.sections = [] and cpg.interpretation = "No CPG section found in database for this deficiency type."
3. NEVER cite a section number that does not explicitly appear in the content provided.
4. NEVER use training knowledge to invent section numbers, tolerances, or code requirements.
5. If the provided content is not relevant to the deficiency, say so; do not force a connection.
6. If responsibility cannot be determined from the provided content alone, return determination = "insufficient_data".
BEFORE analyzing, identify the ROOT CAUSE category: finishing_defect | structural_movement | water_intrusion | mechanical | exterior_envelope | site_grading
RESPONSE FORMAT: valid JSON only, no markdown:
{"category":"","finding":"One sentence verdict.","obc":{"sections":[],"interpretation":"","tolerance":null,"mandatory":true},"cpg":{"sections":[],"interpretation":"","threshold":null},"responsibility":{"determination":"builder|homeowner|shared|insufficient_data","reasoning":"","exceptions":null},"defense_language":"Exact professional text citing only section numbers from provided content. If insufficient: Manual review required — no applicable code section found in database for this deficiency type.","risk_level":"low|medium|high|critical|unknown","risk_reasoning":"","recommended_evidence":[],"warranty_period":"year_1|year_2|msd|all|unknown|none"}`;

async function requireUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: row } = await admin.from('users').select('company_id, is_active').eq('id', data.user.id).maybeSingle();
  if (!row?.company_id || row.is_active === false) return null;
  return { admin, id: data.user.id, companyId: row.company_id as string };
}

// Drops code sections that clearly belong to a different trade or are weak matches.
function filterIrrelevantResults(description: string, results: any[]) {
  if (!results?.length) return [];
  const desc = description.toLowerCase();
  const top = results[0].similarity || results[0].score || 0;
  const tradeLocks = [
    { nouns: ['gas', 'meter', 'furnace', 'hvac', 'vent', 'utility'], forbidden: ['guard', 'stair', 'railing', 'balcony', 'handrail', 'tread'] },
    { nouns: ['bulkhead', 'framing', 'stud', 'joist', 'header'], forbidden: ['paint', 'tape', 'joint', 'texture', 'drywall finish', 'scuff', 'blemish'] },
    { nouns: ['siding', 'cladding', 'soffit', 'fascia'], forbidden: ['roofing', 'shingle', 'foundation', 'basement', 'sump', 'concrete'] },
    { nouns: ['tile', 'grout', 'mortar', 'backboard'], forbidden: ['carpet', 'hardwood', 'vinyl', 'laminate', 'underlay'] },
    { nouns: ['plumbing', 'faucet', 'leak', 'toilet', 'drain'], forbidden: ['electrical', 'outlet', 'breaker', 'panel', 'light'] },
  ];
  const hardNouns = ['gas', 'meter', 'bulkhead', 'sump', 'truss', 'shingle', 'eavestrough', 'cabinet', 'stair'];
  return results.filter((item, i) => {
    const content = (item.content + ' ' + (item.section_title || '')).toLowerCase();
    for (const lock of tradeLocks) {
      if (lock.nouns.some((n) => desc.includes(n)) && lock.forbidden.some((f) => content.includes(f))) return false;
    }
    for (const n of hardNouns) if (desc.includes(n) && !content.includes(n)) return false;
    const score = item.similarity || item.score || 0;
    if (i > 0 && top - score > 0.18) return false;
    return score > 0.52;
  });
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16);
}
const normalize = (d: string) => d.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();

const COSMETIC = ['paint', 'touch-up', 'touchup', 'touch up', 'scuff', 'scratch', 'mark', 'stain', 'discolor', 'peel', 'flaking', 'flaked', 'texture', 'nail pop', 'screw pop', 'finish', 'blemish', 'dent', 'gouge'];
const isCosmetic = (d: string) => {
  const l = d.toLowerCase();
  return COSMETIC.some((t) => l.includes(t)) && !/leak|water|crack|structural|foundation|mold|mould|efflorescence|roof/.test(l);
};

async function embedding(text: string): Promise<number[] | null> {
  try {
    // @ts-ignore Supabase.ai exists in the Edge runtime
    const s = new Supabase.ai.Session('gte-small');
    return Array.from((await s.run(text.slice(0, 2000), { mean_pool: true, normalize: true })) as Float32Array);
  } catch (e) { console.error('embedding failed', e); return null; }
}

type Found = { sections: string[]; content: string; found: boolean };
const none: Found = { found: false, sections: [], content: '' };

async function search(admin: any, kind: 'obc' | 'cpg', description: string): Promise<Found> {
  const emb = await embedding(description);
  if (!emb) return none;
  const args: any = { query_text: description, query_embedding: emb, match_count: 5 };
  if (kind === 'cpg') { args.full_text_weight = 1.8; args.vector_weight = 1.0; }
  const { data, error } = await admin.rpc(kind === 'obc' ? 'hybrid_search_obc' : 'hybrid_search_cpg', args);
  if (error || !data?.length) return none;
  const ok = filterIrrelevantResults(description, data);
  if (!ok.length) return none;
  const label = kind.toUpperCase();
  return {
    found: true,
    sections: [...new Set(ok.map((c: any) => c.section_number).filter(Boolean))] as string[],
    content: ok.map((c: any) => `[${label} ${c.section_number ?? ''}] ${c.section_title ?? ''}\n${c.content}${c.tolerance_note ? '\nPerformance Threshold: ' + c.tolerance_note : ''}`).join('\n\n---\n\n'),
  };
}

async function callGroq(key: string, user: string): Promise<string> {
  let lastErr = '';
  for (const model of MODELS) {
    const body: Record<string, unknown> = {
      model, temperature: 0.1, max_completion_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }],
    };
    if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
    const r = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const out = (await r.json()).choices?.[0]?.message?.content ?? '';
      if (out.trim()) { MODEL = model; return out; }
      lastErr = `${model}: empty response`;
      continue;
    }
    lastErr = `${model}: Groq ${r.status} ${(await r.text()).slice(0, 300)}`;
    console.error('callGroq', lastErr);
  }
  throw new Error(lastErr || 'Groq unavailable');
}

function parse(raw: string): Record<string, any> {
  try { return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); }
  catch {
    return {
      category: 'unknown', finding: 'Response could not be parsed. Manual review required.',
      obc: { sections: [], interpretation: 'Parse error.', tolerance: null, mandatory: true },
      cpg: { sections: [], interpretation: 'Parse error.', threshold: null },
      responsibility: { determination: 'insufficient_data', reasoning: 'Parse error.', exceptions: null },
      defense_language: 'Manual review required.', risk_level: 'unknown', risk_reasoning: 'Response parse error.',
      recommended_evidence: ['Manual review required'], warranty_period: 'unknown',
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Sign in required' }, 401);
    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) return json({ error: 'AI is not configured' }, 503);

    const { description, room, item_id } = await req.json();
    if (typeof description !== 'string' || !description.trim()) return json({ error: 'description is required' }, 400);
    if (description.length > 2000) return json({ error: 'description too long' }, 400);
    const { admin, companyId } = user;

    // The item must belong to the caller's company before anything is written against it.
    let itemOk = false;
    if (item_id) {
      const { data } = await admin.from('warranty_items').select('id').eq('id', item_id).eq('company_id', companyId).maybeSingle();
      itemOk = !!data;
    }

    const norm = normalize(description);
    const hash = simpleHash(norm);
    const { data: cached } = await admin.from('interpretation_cache').select('interpretation, item_description').eq('item_description_hash', hash).maybeSingle();
    // The hash is short, so confirm the text really matches before trusting a cache hit.
    let result: Record<string, any>; let obc = none; let cpg = none; let wasCached = false;
    if (cached && normalize(String(cached.item_description ?? '')) === norm) {
      result = cached.interpretation as Record<string, any>; wasCached = true;
    } else {
      const cosmetic = isCosmetic(description);
      [obc, cpg] = await Promise.all([cosmetic ? Promise.resolve(none) : search(admin, 'obc', description), search(admin, 'cpg', description)]);
      const ctx = `WARRANTY DEFICIENCY ITEM: ${description}\n${room ? 'ROOM: ' + room : ''}\n\nOBC DATABASE CONTENT:\n${obc.found ? obc.content : 'No matching OBC sections found in database.'}\n\nCPG DATABASE CONTENT:\n${cpg.found ? cpg.content : 'No matching CPG sections found in database.'}`;
      result = parse(await callGroq(groqKey, ctx));
      const det = result.responsibility?.determination; const cat = String(result.category ?? '');
      if (!result.risk_level || result.risk_level === 'unknown') {
        if (det === 'builder') {
          const major = ['structural_movement', 'water_intrusion', 'exterior_envelope'].includes(cat);
          result.risk_level = major ? 'high' : 'medium';
          result.risk_reasoning = major ? 'Builder responsible for major envelope or structural item — high conciliation risk.' : 'Builder responsible — standard repair item with medium risk.';
        } else if (det === 'homeowner') { result.risk_level = 'low'; result.risk_reasoning = 'Homeowner maintenance responsibility — low builder risk.'; }
        else { result.risk_level = 'medium'; result.risk_reasoning = 'Insufficient data to confirm risk level — defaulting to medium.'; }
      }
      const parsedOk = !String(result.finding ?? '').startsWith('Response could not be parsed');
      if (parsedOk) await admin.from('interpretation_cache').insert({
        company_id: companyId, item_description: description, item_description_hash: hash,
        obc_sections: obc.sections, cpg_sections: cpg.sections, interpretation: result, model_used: MODEL,
      });
    }

    if (itemOk && !wasCached) {
      await admin.from('warranty_item_evidence').insert({
        company_id: companyId, item_id, evidence_type: 'access_log', phase: 'assessment',
        notes: `AI interpretation: responsibility ${result.responsibility?.determination}. Risk ${result.risk_level}. ${obc.found ? 'OBC match found.' : 'No OBC match.'}`,
      });
    }
    return json({ ...result, _cached: wasCached, _obc_found: obc.found, _cpg_found: cpg.found });
  } catch (e) {
    console.error('interpret-warranty-item', e);
    return json({ error: 'The AI service did not answer. Try again in a moment.' }, 502);
  }
});
