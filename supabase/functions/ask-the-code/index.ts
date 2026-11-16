// ask-the-code — OBC question answering over the code text already stored in the database. Signed-in users only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = `You are the Builder Guardian OBC expert: a 35-year veteran carpenter and building inspector who knows the Ontario Building Code.
RULES:
- Use ONLY the provided OBC text chunks. Always cite the OBC section number at the end.
- Short, plain English, tactical. The reader is on a job site.
- If the chunks are even partly relevant, use them. Say you cannot find it only if nothing is relevant.
- Format: answer first, then "OBC Reference: Section X.X.X.X"`;

async function requireUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: row } = await admin.from('users').select('company_id, is_active').eq('id', data.user.id).maybeSingle();
  if (!row?.company_id || row.is_active === false) return null;
  return { admin, id: data.user.id };
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(
    'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('HF_TOKEN') ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text.slice(0, 512), options: { wait_for_model: true } }),
    },
  );
  if (!res.ok) throw new Error('embedding failed');
  const d = await res.json();
  return Array.isArray(d) && Array.isArray(d[0]) ? d[0] : d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Sign in required' }, 401);
    const { question } = await req.json();
    if (typeof question !== 'string' || question.trim().length < 3) return json({ error: 'Please enter a question' }, 400);
    if (question.length > 1000) return json({ error: 'Question too long' }, 400);

    const { data: chunks, error } = await user.admin.rpc('match_obc_chunks', {
      query_embedding: await embed(question),
      match_threshold: 0.3,
      match_count: 8,
    });
    if (error) throw new Error('search failed');
    if (!chunks?.length) return json({ answer: 'No relevant OBC sections found. Try rephrasing your question.', sources: [], chunks_found: 0 });

    const context = chunks
      .map((c: any, i: number) => `[Chunk ${i + 1} — ${c.source_file} Page ${c.page_number}${c.section_title ? ' — ' + c.section_title : ''}]\n${c.content}`)
      .join('\n\n---\n\n');

    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? '' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${SYSTEM}\n\nOBC SECTIONS:\n${context}\n\nQUESTION: ${question}` }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4048 },
      }),
    });
    if (!res.ok) throw new Error('answer failed');
    const g = await res.json();
    return json({
      answer: g?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No answer returned.',
      sources: chunks.map((c: any) => ({ page: c.page_number, section: c.section_title, file: c.source_file, similarity: c.similarity })),
      chunks_found: chunks.length,
    });
  } catch (e) {
    console.error('ask-the-code', e);
    return json({ error: 'Could not answer right now' }, 500);
  }
});
