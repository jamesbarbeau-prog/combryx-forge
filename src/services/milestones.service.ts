import { supabase } from '@/lib/supabase';
import type { Milestone } from '@/types/models';

function mapMilestone(row: any): Milestone {
  return {
    id: row.id,
    jobId: row.job_id,
    name: row.name,
    trade: row.trade ?? undefined,
    status: row.status,
    plannedStart: row.planned_start ?? undefined,
    plannedEnd: row.planned_end ?? undefined,
    actualStart: row.actual_start ?? undefined,
    actualEnd: row.actual_end ?? undefined,
    sortOrder: row.sort_order ?? 0,
    gateRequired: Boolean(row.gate_required),
    gateItems: Array.isArray(row.gate_items) ? row.gate_items : [],
    invoiceTrigger: Boolean(row.invoice_trigger),
    notes: row.notes ?? undefined,
    completedBy: row.completed_by ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

export const milestonesService = {
  async getByJob(jobId: string): Promise<Milestone[]> {
    const { data, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('job_id', jobId)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapMilestone);
  },
};