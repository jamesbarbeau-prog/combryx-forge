export type JobPhase = 'sell' | 'define' | 'plan' | 'build' | 'buy' | 'bill' | 'closed';

export type JobStatus = 'active' | 'on_hold' | 'billing' | 'complete' | 'cancelled';

export type RiskLevel = 'low' | 'medium' | 'high';

export type MilestoneStatus =
  | 'not_started'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'complete';

export type InvoiceStatus =
  | 'draft'
  | 'submitted'
  | 'deficient'
  | 'approved'
  | 'paid'
  | 'voided';

export type EvidenceCategory =
  | 'progress'
  | 'issue'
  | 'delivery'
  | 'inspection'
  | 'hidden_condition'
  | 'completion';

export type HoldbackStatus =
  | 'withheld'
  | 'pending_release'
  | 'released'
  | 'disputed';