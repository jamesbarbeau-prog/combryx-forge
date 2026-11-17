// interpret-warranty-item — AI reading of one deficiency item against the Tarion CPG and the Ontario Building Code text stored in the database.
// Signed-in users only. The company always comes from the signed-in user, never from the request body.
//
// How it thinks (v3). The old version searched for matching words and then told the model it could only use whatever came back, so a plain
// "paint job is not well done, paint bubbles" never reached CPG 9.9 (Paint finish is unacceptable) and the answer was "insufficient data".
//   1. READ    The model reads the sentence like a warranty services rep and picks the governing CPG sections from the FULL list of CPG titles
//              (all 260 fit easily). It also says whether the OBC could matter and writes code-vocabulary search phrases.
//   2. FETCH   The complete text of the chosen CPG sections is loaded by number (exact, no similarity cut-off). OBC pages are found by full-text
//              search using the model's phrases, house-scale Part 9 first.
//   3. DECIDE  The model assesses the item against that text: acceptable condition, warranty coverage, exclusions, who is responsible.
//   4. CHECK   Any section number the model cites that was not in the text it was given is dropped.
// Body: { description, room?, item_id?, force?: boolean (skip the cache), deep?: boolean (use the larger model) }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const FAST_MODEL = Deno.env.get('AI_MODEL') ?? 'gemini-2.5-flash';
const DEEP_MODEL = Deno.env.get('AI_MODEL_DEEP') ?? 'gemini-2.5-pro';
const CACHE_VERSION = 'v3|';
let USED = FAST_MODEL;

const READ_SYSTEM = `You are a senior Tarion warranty services representative for Ontario new homes. A homeowner's deficiency item is below.
Your job in this step is only to decide WHICH Tarion Construction Performance Guideline (CPG) sections govern it.
Think about what the homeowner is actually describing: the building component, what is wrong with it, and what a rep would call it in the CPG.
Homeowners and PDI forms use everyday words; the CPG uses its own titles. Match on meaning, not on words. For example "paint bubbles" or "paint job not done well" is CPG "PAINT FINISH IS UNACCEPTABLE"; "door sticks" is a door operation section; "gap at trim" is a trim section.
Choose up to 4 sections from the numbered list, most relevant first. If an item names two problems (a door that needs fixing AND poor paint), cover both. Choose only numbers that appear in the list.
Also say whether the Ontario Building Code (Part 9, houses) could be relevant. It is relevant for safety and construction requirements (guards, stairs, smoke alarms, ventilation, insulation, electrical or plumbing installation, structure, water entry). It is NOT relevant for cosmetic finish and workmanship items such as paint, scuffs, nail pops, trim gaps. When relevant, write up to 3 short search phrases using the Code's own vocabulary (for example "height of guards", "bathroom exhaust fan duct").
Reply with JSON only: {"defect":"one plain sentence on what is wrong and where","cpg":[{"section":"9.9","why":"short reason"}],"obc_relevant":false,"obc_queries":[]}`;

const DECIDE_SYSTEM = `You are a 30-year veteran Tarion warranty services representative and conciliator who now advises an Ontario home builder. You assess one deficiency item at a time, fairly and in plain language.
You are given the item and the full text of the CPG sections (and, sometimes, Ontario Building Code pages) that apply. Read the text, then reason like a person, not a keyword matcher: what is the homeowner saying is wrong, what does the guideline require ("Acceptable Performance/Condition"), does the described condition fall short of it, what does the "Warranty" line say about the period and what is covered, which exclusions or remarks apply, and what "Action" is required.
Rules:
1. Cite ONLY section numbers that appear in the text you were given. Never invent a section, a measurement or a tolerance. Quote thresholds only from the text.
2. Do not answer "insufficient_data" just because the homeowner's words differ from the guideline's words. Use the closest governing section and say how confident you are. Use "insufficient_data" only when the description genuinely lacks what is needed to decide (for example no location, no description of the problem) and say exactly what is missing.
3. If the item says it came from a PDI report or pre-delivery inspection, it is a builder-agreed item recorded before possession: the builder is responsible to complete it whatever the CPG says. Say so, and still note the CPG standard that would apply to the finished work.
4. Warranty periods: Delivery and Occupancy (PDI) items; Year 1 workmanship and materials per the CPG; Year 2 for water penetration, the electrical, plumbing and heating delivery and distribution systems, exterior cladding and Code violations affecting health and safety; Major Structural Defects to Year 7. Take the period from the CPG "Warranty" line when it states one.
5. Responsibility: builder (meets the warranty definition and falls short of the standard), homeowner (normal wear, maintenance, damage after possession, within acceptable tolerance), shared, or insufficient_data. A defect that fails the standard is the builder's, even if it is small. A condition that meets the acceptable performance is not a defect.
6. Be concrete about what to check or photograph to settle it, since the description is only text.
Reply with JSON only, exactly this shape:
{"category":"finishing_defect|structural_movement|water_intrusion|mechanical|exterior_envelope|site_grading|safety|other",
"finding":"One sentence verdict a busy manager can act on.",
"confidence":"high|medium|low",
"cpg":{"sections":["9.9"],"interpretation":"What the guideline requires and how this item compares.","threshold":"The measurable test from the guideline, or null"},
"obc":{"sections":[],"interpretation":"How the Code applies, or why it does not.","tolerance":null,"mandatory":false},
"responsibility":{"determination":"builder|homeowner|shared|insufficient_data","reasoning":"Plain reasoning in 2 to 4 sentences.","exceptions":null},
"defense_language":"Short professional wording the builder could use with Tarion or the homeowner, citing only provided sections.",
"risk_level":"low|medium|high|critical","risk_reasoning":"Why.",
"recommended_evidence":["specific photos or measurements"],
"warranty_period":"delivery|year_1|year_2|msd|none|unknown"}`;

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

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16);
}
const normalize = (d: string) => d.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();

// ───────── model calls (Gemini first, Groq as a fallback) ─────────
async function gemini(model: string, system: string, user: string, budget: number): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: budget } },
    }),
  });
  if (!r.ok) throw new Error(`${model}: Gemini ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const out = (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  if (!out.trim()) throw new Error(`${model}: empty response`);
  return out;
}
async function groq(system: string, user: string): Promise<string> {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('GROQ_API_KEY is not set');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai/gpt-oss-120b', temperature: 0.2, max_completion_tokens: 4096, reasoning_effort: 'medium', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status} ${(await r.text()).slice(0, 200)}`);
  USED = 'groq:openai/gpt-oss-120b';
  return (await r.json()).choices?.[0]?.message?.content ?? '';
}
async function ask(system: string, user: string, deep: boolean, budget: number): Promise<Record<string, any>> {
  const attempts: (() => Promise<string>)[] = [];
  if (deep) attempts.push(() => { USED = DEEP_MODEL; return gemini(DEEP_MODEL, system, user, Math.max(budget, 4096)); });
  attempts.push(() => { USED = FAST_MODEL; return gemini(FAST_MODEL, system, user, budget); });
  attempts.push(() => groq(system, user));
  let last = '';
  for (const go of attempts) {
    try { return JSON.parse((await go()).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); }
    catch (e) { last = (e as Error).message; console.error('ask', last); }
  }
  throw new Error(last || 'AI unavailable');
}

// ───────── knowledge ─────────
type CpgRow = { section_number: string; section_title: string | null; content: string; tolerance_note: string | null };
let cpgIndex: { section_number: string; section_title: string | null }[] | null = null;
async function loadIndex(admin: any) {
  if (cpgIndex) return cpgIndex;
  const { data, error } = await admin.from('cpg_chunks').select('section_number, section_title').not('section_number', 'is', null).limit(1000);
  if (error) throw new Error('CPG index unavailable');
  const seen = new Set<string>();
  cpgIndex = (data ?? []).filter((r: any) => !seen.has(r.section_number) && seen.add(r.section_number))
    .sort((a: any, b: any) => a.section_number.localeCompare(b.section_number, undefined, { numeric: true }));
  return cpgIndex!;
}
const OBC_NUM = /(?<![\d.])(\d{1,2}\.\d{1,2}\.\d{1,3}\.\d{1,3}\.)\s+[A-Z]/g;

async function obcPages(admin: any, queries: string[]) {
  const seen = new Set<string>(); const out: { id: string; page_number: number; content: string }[] = [];
  const results = await Promise.all(queries.slice(0, 3).map(q => admin.rpc('search_obc_text', { p_query: q, p_limit: 4 })));
  for (const r of results) for (const row of (r.data ?? [])) if (!seen.has(row.id) && out.length < 6) { seen.add(row.id); out.push(row); }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Sign in required' }, 401);
    if (!Deno.env.get('GEMINI_API_KEY') && !Deno.env.get('GROQ_API_KEY')) return json({ error: 'AI is not configured' }, 503);

    const { description, room, item_id, force, deep } = await req.json();
    if (typeof description !== 'string' || !description.trim()) return json({ error: 'description is required' }, 400);
    if (description.length > 2000) return json({ error: 'description too long' }, 400);
    const { admin, companyId } = user;

    let itemOk = false;
    if (item_id) {
      const { data } = await admin.from('warranty_items').select('id').eq('id', item_id).eq('company_id', companyId).maybeSingle();
      itemOk = !!data;
    }

    const norm = normalize(description);
    const hash = simpleHash(CACHE_VERSION + norm);
    const { data: cached } = force ? { data: null } : await admin.from('interpretation_cache').select('interpretation, item_description').eq('item_description_hash', hash).maybeSingle();
    let result: Record<string, any>; let cpgFound: string[] = []; let obcFound: string[] = []; let wasCached = false;

    if (cached && normalize(String(cached.item_description ?? '')) === norm) {
      result = cached.interpretation as Record<string, any>; wasCached = true;
      cpgFound = result?.cpg?.sections ?? []; obcFound = result?.obc?.sections ?? [];
    } else {
      const itemText = `ITEM: ${description}${room ? `\nROOM: ${room}` : ''}`;

      // 1. READ: choose the governing CPG sections from the whole list
      const index = await loadIndex(admin);
      const list = index.map(r => `${r.section_number}  ${r.section_title ?? ''}`).join('\n');
      const pick = await ask(READ_SYSTEM, `${itemText}\n\nCPG SECTIONS:\n${list}`, false, 1024);
      const valid = new Set(index.map(r => r.section_number));
      const chosen: string[] = [...new Set((Array.isArray(pick.cpg) ? pick.cpg : []).map((c: any) => String(c?.section ?? '').trim()).filter((s: string) => valid.has(s)))].slice(0, 4) as string[];

      // 2. FETCH: full text of those sections, plus OBC pages when the Code could matter
      let cpgRows: CpgRow[] = [];
      if (chosen.length) {
        const { data } = await admin.from('cpg_chunks').select('section_number, section_title, content, tolerance_note').in('section_number', chosen);
        cpgRows = (data ?? []).sort((a: CpgRow, b: CpgRow) => chosen.indexOf(a.section_number) - chosen.indexOf(b.section_number));
      }
      const queries = pick.obc_relevant ? (Array.isArray(pick.obc_queries) ? pick.obc_queries.map(String).filter(Boolean) : []) : [];
      const pages = queries.length ? await obcPages(admin, queries) : [];
      cpgFound = cpgRows.map(r => r.section_number);
      const obcNums = new Set<string>(); for (const p of pages) for (const m of p.content.matchAll(OBC_NUM)) obcNums.add(m[1].replace(/\.$/, ''));
      obcFound = [...obcNums];

      const cpgText = cpgRows.length
        ? cpgRows.map(r => `[CPG ${r.section_number}] ${r.section_title ?? ''}\n${r.content.replace(/\r/g, '')}${r.tolerance_note ? '\nPerformance threshold: ' + r.tolerance_note : ''}`).join('\n\n---\n\n')
        : 'No CPG section was found for this item.';
      const obcText = pages.length ? pages.map(p => `[OBC Compendium page ${p.page_number}]\n${p.content}`).join('\n\n---\n\n') : 'Not provided. The Building Code was not judged relevant to this item.';
      const understood = pick.defect ? `\nWHAT THE ITEM IS ABOUT: ${String(pick.defect)}` : '';

      // 3. DECIDE
      result = await ask(DECIDE_SYSTEM, `${itemText}${understood}\n\nTARION CPG TEXT:\n${cpgText}\n\nONTARIO BUILDING CODE TEXT:\n${obcText}`, !!deep, 2048);

      // 4. CHECK: no citation survives unless it was in the text the model saw
      const allowedObc = new Set(obcFound);
      const keep = (arr: unknown, ok: (s: string) => boolean) => (Array.isArray(arr) ? arr.map(String).filter(ok) : []);
      result.cpg = { ...(result.cpg ?? {}), sections: keep(result.cpg?.sections, s => cpgFound.includes(s)) };
      result.obc = { ...(result.obc ?? {}), sections: keep(result.obc?.sections, s => allowedObc.has(s.replace(/\.$/, ''))) };
      if (!result.risk_level || result.risk_level === 'unknown') result.risk_level = 'medium';
      result._model = USED;

      const parsedOk = !!result.finding && !!result.responsibility;
      if (parsedOk) await admin.from('interpretation_cache').insert({
        company_id: companyId, item_description: description, item_description_hash: hash,
        obc_sections: result.obc.sections, cpg_sections: result.cpg.sections, interpretation: result, model_used: USED,
      });
    }

    if (itemOk && !wasCached) {
      await admin.from('warranty_item_evidence').insert({
        company_id: companyId, item_id, evidence_type: 'access_log', phase: 'assessment',
        notes: `AI interpretation: responsibility ${result.responsibility?.determination}. Risk ${result.risk_level}. CPG ${cpgFound.join(', ') || 'none'}. ${obcFound.length ? 'OBC pages used.' : 'OBC not needed.'}`,
      });
    }
    return json({ ...result, _cached: wasCached, _obc_found: obcFound.length, _cpg_found: cpgFound.length });
  } catch (e) {
    console.error('interpret-warranty-item', e);
    return json({ error: 'The AI service did not answer. Try again in a moment.' }, 502);
  }
});
