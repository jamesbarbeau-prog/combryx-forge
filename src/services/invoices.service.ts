import { supabase } from '@/lib/supabase';
import type { Invoice } from '@/types/models';

function mapInvoice(row: any): Invoice {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobId: row.job_id,
    invoiceNumber: row.invoice_number ?? undefined,
    description: row.description,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date ?? undefined,
    subtotal: Number(row.subtotal ?? 0),
    hst: Number(row.hst ?? 0),
    holdbackRate: Number(row.holdback_rate ?? 0.1),
    holdbackAmount: Number(row.holdback_amount ?? 0),
    netDue: Number(row.net_due ?? 0),
    status: row.status,
    properInvoice: Boolean(row.proper_invoice),
    submittedAt: row.submitted_at ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    paidAt: row.paid_at ?? undefined,
    deficiencyNotes: row.deficiency_notes ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

export const invoicesService = {
  async getByJob(jobId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('job_id', jobId)
      .order('invoice_date', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapInvoice);
  },
};