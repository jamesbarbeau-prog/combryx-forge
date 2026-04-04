import { supabase } from '@/lib/supabase';
import type { HoldbackEntry } from '@/types/models';

function mapHoldback(row: any): HoldbackEntry {
  return {
    id: row.id,
    jobId: row.job_id,
    invoiceId: row.invoice_id,
    amount: Number(row.amount ?? 0),
    status: row.status,
    releaseEligibleAt: row.release_eligible_at ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

export const holdbackService = {
  async getByJob(jobId: string): Promise<HoldbackEntry[]> {
    const { data, error } = await supabase
      .from('holdback_entries')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapHoldback);
  },
};