import { supabase } from '@/lib/supabase';
import type { Evidence } from '@/types/models';

function mapEvidence(row: any): Evidence {
  return {
    id: row.id,
    jobId: row.job_id,
    milestoneId: row.milestone_id ?? undefined,
    issueId: row.issue_id ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
    category: row.category,
    title: row.title ?? undefined,
    notes: row.notes ?? undefined,
    fileUrls: Array.isArray(row.file_urls) ? row.file_urls : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    uploadedBy: row.uploaded_by ?? undefined,
    capturedAt: row.captured_at,
    createdAt: row.created_at ?? undefined,
  };
}

export const evidenceService = {
  async getByJob(jobId: string): Promise<Evidence[]> {
    const { data, error } = await supabase
      .from('evidence')
      .select('*')
      .eq('job_id', jobId)
      .order('captured_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapEvidence);
  },
};