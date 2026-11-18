// Evidence files live in a private bucket, so a stored link only works for a few minutes once it is signed.
// Rows keep the path inside their old public link; this swaps in a fresh signed link for display.
import { supabase } from '@/lib/supabase';

const RE = /\/object\/public\/case-documents\/(.+?)(?:\?.*)?$/;

export async function signEvidenceUrls<T extends { file_url: string | null }>(rows: T[]): Promise<T[]> {
  const paths = new Map<number, string>();
  rows.forEach((r, i) => { const m = r.file_url ? RE.exec(r.file_url) : null; if (m) paths.set(i, decodeURIComponent(m[1])); });
  if (!paths.size) return rows;
  const { data } = await supabase.storage.from('case-documents').createSignedUrls([...paths.values()], 3600);
  const out = [...rows];
  [...paths.keys()].forEach((rowIdx, k) => { const s = data?.[k]?.signedUrl; if (s) out[rowIdx] = { ...out[rowIdx], file_url: s }; });
  return out;
}
