import { supabase } from '@/lib/supabase';
import { sum } from '@/lib/utils';
import type { HoldbackEntry, Invoice, Job, Milestone } from '@/types/models';

function mapMilestoneFromDb(row: any): Milestone {
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

function mapInvoiceFromDb(row: any): Invoice {
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
    items: Array.isArray(row.invoice_items)
      ? row.invoice_items.map((item: any) => ({
          id: item.id,
          invoiceId: item.invoice_id,
          milestoneId: item.milestone_id ?? undefined,
          scopeItemId: item.scope_item_id ?? undefined,
          description: item.description,
          amount: Number(item.amount ?? 0),
          sortOrder: item.sort_order ?? 0,
        }))
      : [],
  };
}

function mapHoldbackEntryFromDb(row: any): HoldbackEntry {
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

function mapJobFromDb(row: any): Job {
  const milestones = Array.isArray(row.milestones)
    ? row.milestones.map(mapMilestoneFromDb)
    : [];

  const invoices = Array.isArray(row.invoices)
    ? row.invoices.map(mapInvoiceFromDb)
    : [];

  const holdbackEntries = Array.isArray(row.holdback_entries)
    ? row.holdback_entries.map(mapHoldbackEntryFromDb)
    : [];

  const totalInvoiced = sum(invoices.map((i) => i.subtotal));
  const totalPaid = sum(
    invoices
      .filter((i) => i.status === 'paid')
      .map((i) => i.netDue + (i.hst ?? 0))
  );
  const holdbackPool = sum(holdbackEntries.map((h) => h.amount));
  const holdbackReleased = sum(
    holdbackEntries
      .filter((h) => h.status === 'released')
      .map((h) => h.amount)
  );

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    type: row.type ?? undefined,
    status: row.status,
    phase: row.phase,
    risk: row.risk,
    contractValue: row.contract_value != null ? Number(row.contract_value) : undefined,
    province: row.province ?? 'ON',
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    postalCode: row.postal_code ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    pmUserId: row.pm_user_id ?? undefined,
    nextAction: row.next_action ?? undefined,
    progressPct: Number(row.progress_pct ?? 0),
    notes: row.notes ?? undefined,
    metadata: row.metadata ?? {},
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    milestones,
    invoices,
    holdbackEntries,
    financials: {
      contractValue: Number(row.contract_value ?? 0),
      totalInvoiced,
      totalPaid,
      outstanding: totalInvoiced - totalPaid,
      holdbackPool,
      holdbackReleased,
    },
  };
}

function mapJobToDb(updates: Partial<Job>) {
  return {
    name: updates.name,
    description: updates.description,
    type: updates.type,
    status: updates.status,
    phase: updates.phase,
    risk: updates.risk,
    contract_value: updates.contractValue,
    province: updates.province,
    address: updates.address,
    city: updates.city,
    postal_code: updates.postalCode,
    start_date: updates.startDate,
    end_date: updates.endDate,
    pm_user_id: updates.pmUserId,
    next_action: updates.nextAction,
    progress_pct: updates.progressPct,
    notes: updates.notes,
    metadata: updates.metadata,
  };
}

export const jobsService = {
  async getAll(tenantId: string): Promise<Job[]> {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapJobFromDb);
  },

  async getById(jobId: string): Promise<Job> {
    const { data, error } = await supabase
      .from('jobs')
      .select(
        `
        *,
        milestones(*),
        invoices(*, invoice_items(*)),
        holdback_entries(*)
      `
      )
      .eq('id', jobId)
      .single();

    if (error) throw error;
    return mapJobFromDb(data);
  },

  async update(jobId: string, updates: Partial<Job>): Promise<Job> {
    const payload = {
      ...mapJobToDb(updates),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('jobs')
      .update(payload)
      .eq('id', jobId)
      .select('*')
      .single();

    if (error) throw error;
    return mapJobFromDb(data);
  },
};