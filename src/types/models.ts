import type {
  EvidenceCategory,
  HoldbackStatus,
  InvoiceStatus,
  JobPhase,
  JobStatus,
  MilestoneStatus,
  RiskLevel,
} from './enums';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  province?: string;
  logoUrl?: string | null;
  createdAt?: string;
}

export interface Profile {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  phone?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Membership {
  id: string;
  tenantId: string;
  userId: string;
  role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer';
  active: boolean;
  invitedAt?: string | null;
  acceptedAt?: string | null;
  createdAt?: string;
}

export interface Contact {
  id: string;
  tenantId: string;
  type: 'client' | 'trade' | 'supplier' | 'inspector' | string;
  fullName: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  province?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface JobFinancials {
  contractValue: number;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  holdbackPool: number;
  holdbackReleased: number;
}

export interface GateItem {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
}

export interface Milestone {
  id: string;
  jobId: string;
  name: string;
  trade?: string;
  status: MilestoneStatus;
  plannedStart?: string;
  plannedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  sortOrder: number;
  gateRequired: boolean;
  gateItems: GateItem[];
  invoiceTrigger: boolean;
  notes?: string | null;
  completedBy?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  milestoneId?: string | null;
  scopeItemId?: string | null;
  description: string;
  amount: number;
  sortOrder: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  jobId: string;
  invoiceNumber?: string | null;
  description: string;
  invoiceDate: string;
  dueDate?: string | null;
  subtotal: number;
  hst?: number;
  holdbackRate: number;
  holdbackAmount: number;
  netDue: number;
  status: InvoiceStatus;
  properInvoice: boolean;
  submittedAt?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  deficiencyNotes?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  items?: InvoiceItem[];
}

export interface HoldbackEntry {
  id: string;
  jobId: string;
  invoiceId: string;
  amount: number;
  status: HoldbackStatus;
  releaseEligibleAt?: string | null;
  createdAt?: string;
}

export interface Evidence {
  id: string;
  jobId: string;
  milestoneId?: string | null;
  issueId?: string | null;
  invoiceId?: string | null;
  category: EvidenceCategory;
  title?: string | null;
  notes?: string | null;
  fileUrls: string[];
  tags: string[];
  uploadedBy?: string | null;
  capturedAt: string;
  createdAt?: string;
}

export interface Job {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  type?: string | null;
  status: JobStatus;
  phase: JobPhase;
  risk: RiskLevel;
  contractValue?: number | null;
  province: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  pmUserId?: string | null;
  nextAction?: string | null;
  progressPct: number;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  milestones?: Milestone[];
  invoices?: Invoice[];
  holdbackEntries?: HoldbackEntry[];
  financials?: JobFinancials;
}