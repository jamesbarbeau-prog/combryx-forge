import { supabase } from '@/lib/supabase';

let cached: { userId: string; companyId: string } | null = null;

/** The signed-in user's company, read from their user row. Never hardcode a company id. */
export async function getCompanyId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  if (cached?.userId === user.id) return cached.companyId;
  const { data, error } = await supabase.from('users').select('company_id').eq('id', user.id).maybeSingle();
  if (error || !data?.company_id) throw new Error('Your account is not linked to a company yet');
  cached = { userId: user.id, companyId: data.company_id };
  return cached.companyId;
}
