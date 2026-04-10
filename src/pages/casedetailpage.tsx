import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Mail,
  Phone,
  FileText,
  Paperclip,
  MessageSquare,
  StickyNote,
  History,
  Download,
  Home,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Send,
  Lock,
  Layers,
  Shield,
  AlertTriangle,
  Calendar,
  Clock,
  CheckCircle2,
  MoreHorizontal,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Case {
  id: string;
  case_number: string;
  tarion_case_number: string | null;
  tarion_case_number_normalized: string | null;
  display_name: string | null;
  title: string;
  status: string;
  case_type: string;
  period_type: string | null;
  brp_end_date: string | null;
  opened_at: string;
  closed_at: string | null;
  target_date: string | null;
  interaction_count: number;
  document_count: number;
  last_activity_at: string;
  lot_id: string | null;
  active_conciliation_id: string | null;
  has_conciliation: boolean | null;
}

interface WarrantyItem {
  id: string;
  item_number: number;
  location: string | null;
  floor_level: string | null;
  room: string | null;
  defect_area: string | null;
  description: string;
  status: string;
  chargeable: boolean | null;
  completed_at: string | null;

  assessed_at: string | null;
  assessed_by_id: string | null;
  assessment_notes: string | null;
  homeowner_present: boolean | null;

  warranty_decision: string | null;
  decision_by_id: string | null;
  decision_at: string | null;
  decision_notes: string | null;
}

interface ItemEvidence {
  id: string;
  item_id: string;
  evidence_type: string;
  phase: string;
  file_url: string | null;
  file_name: string | null;
  storage_path: string | null;
  notes: string | null;
  captured_at: string;
  is_locked: boolean;
  is_before: boolean | null;
  homeowner_present: boolean | null;
}

interface ConciliationSubcase {
  id: string;
  case_id: string;
  stage: string;
  rfc_requested_at: string | null;
  rfc_received_at: string | null;
  inspection_deadline: string | null;
  inspection_date: string | null;
  inspection_time_slot: string | null;
  inspection_confirmed: boolean;
  inspection_occurred_at: string | null;
  report_issued_at: string | null;
  warranted_resolution_deadline: string | null;
  builder_settlement_offer: number | null;
  builder_offer_submitted_at: string | null;
  tarion_offer_decision: string | null;
  builder_directory_hit: boolean;
  claim_inspection_at: string | null;
  tarion_claim_amount: number | null;
  admin_fee_amount: number | null;
  total_billed_to_builder: number | null;
  outcome: string | null;
  cancelled_at: string | null;
}

interface ConciliationItem {
  id: string;
  item_number: number;
  room: string | null;
  description: string;
  tarion_determination: string | null;
  chargeable: boolean | null;
  rb04_exception: boolean;
  cpg_section: string | null;
  status: string;
  resolved_at: string | null;
  cash_settlement_amount: number | null;
  settlement_accepted_at: string | null;
  is_new_at_inspection: boolean;
}

interface InteractionEmailLog {
  provider: string;
  has_attachments: boolean;
  attachment_count: number;
  logged_by_name: string;
  logged_at: string;
}

interface InteractionDocument {
  id: string;
  file_name: string;
  mime_type: string;
}

interface Interaction {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[] | null;
  occurred_at: string;
  created_by_name: string;
  email_log: InteractionEmailLog | null;
  documents: InteractionDocument[];
}

interface CaseDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  storage_path: string;
  uploaded_by_id: string;
  uploaded_at: string;
  interaction_id: string | null;
  case_interactions: { subject: string | null; occurred_at: string } | null;
}

interface Note {
  id: string;
  body: string;
  is_internal: boolean;
  created_by_name: string;
  created_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  user_name: string | null;
  source_app: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface UserProfile {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  access_level: string;
  is_owner: boolean;
}

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ITEM_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  outstanding: { label: 'Outstanding', color: '#DC2626', bg: 'rgba(220,38,38,0.10)' },
  in_progress: { label: 'In Progress', color: '#D97706', bg: 'rgba(217,119,6,0.10)' },
  completed: { label: 'Completed', color: '#16A34A', bg: 'rgba(22,163,74,0.10)' },
  disputed: { label: 'Disputed', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)' },
  not_warranted: { label: 'Not Warranted', color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  open: { label: 'Open', color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)', dot: '#1E5FA4' },
  in_progress: { label: 'In Progress', color: '#D97706', bg: 'rgba(217,119,6,0.10)', dot: '#D97706' },
  pending_parts: { label: 'Pending Parts', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)', dot: '#7C3AED' },
  pending_owner: { label: 'Pending Owner', color: '#DC2626', bg: 'rgba(220,38,38,0.10)', dot: '#DC2626' },
  resolved: { label: 'Resolved', color: '#16A34A', bg: 'rgba(22,163,74,0.10)', dot: '#16A34A' },
  closed: { label: 'Closed', color: '#6B7280', bg: 'rgba(107,114,128,0.10)', dot: '#6B7280' },
  voided: { label: 'Voided', color: '#9CA3AF', bg: 'rgba(156,163,175,0.10)', dot: '#9CA3AF' },
};

const CHANNEL_CONFIG: Record<string, { icon: IconType; label: string; color: string }> = {
  email: { icon: Mail, label: 'Email', color: '#1E5FA4' },
  phone: { icon: Phone, label: 'Phone', color: '#16A34A' },
  note: { icon: StickyNote, label: 'Note', color: '#D97706' },
  site_visit: { icon: Home, label: 'Site Visit', color: '#7C3AED' },
  sms: { icon: MessageSquare, label: 'SMS', color: '#0891B2' },
  portal: { icon: ExternalLink, label: 'Portal', color: '#6B7280' },
};

const TABS = [
  { key: 'items', label: 'Items', icon: Layers },
  { key: 'conciliation', label: 'Conciliation', icon: Shield },
  { key: 'interactions', label: 'Interactions', icon: MessageSquare },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'audit', label: 'Audit Trail', icon: History },
];

const CONCIL_STAGE_CONFIG = {
  rfc: {
    label: 'RFC Filed',
    color: '#D97706',
    bg: 'rgba(217,119,6,0.08)',
    border: 'rgba(217,119,6,0.25)',
  },
  inspection: {
    label: 'Inspection Scheduled',
    color: '#DC2626',
    bg: 'rgba(220,38,38,0.08)',
    border: 'rgba(220,38,38,0.25)',
  },
  warranted: {
    label: 'Report Issued',
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.08)',
    border: 'rgba(124,58,237,0.25)',
  },
  claim: {
    label: 'Claim Active',
    color: '#DC2626',
    bg: 'rgba(220,38,38,0.12)',
    border: 'rgba(220,38,38,0.40)',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#6B7280',
    bg: 'rgba(107,114,128,0.08)',
    border: 'rgba(107,114,128,0.25)',
  },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string | null): string {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📑';
  if (mime.includes('word')) return '📝';
  return '📄';
}

function providerIcon(provider: string): string {
  if (provider === 'microsoft') return '🔵';
  if (provider === 'google') return '🔴';
  return '📧';
}

function normalizeTarionCase(input: string): string {
  const t = input.trim();
  return t.startsWith('0') ? t.slice(1) : t;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '10px 14px',
        borderRadius: 8,
        background: 'var(--color-mist)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: color ?? 'var(--color-text)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function InteractionCard({
  item,
  onExpand,
}: {
  item: Interaction;
  onExpand: (id: string) => void;
}) {
  const ch = CHANNEL_CONFIG[item.channel] ?? CHANNEL_CONFIG.note;
  const Icon = ch.icon;
  const isInbound = item.direction === 'inbound';

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '14px 0',
        borderBottom: '1px solid var(--color-border)',
        cursor: 'pointer',
      }}
      onClick={() => onExpand(item.id)}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: `${ch.color}18`,
            border: `1.5px solid ${ch.color}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={14} color={ch.color} strokeWidth={1.8} />
        </div>
        <div
          style={{
            width: 1,
            flex: 1,
            background: 'var(--color-border)',
            marginTop: 6,
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 100,
              color: ch.color,
              background: `${ch.color}18`,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
            }}
          >
            {ch.label}
          </span>

          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 100,
              color: isInbound ? '#059669' : '#1E5FA4',
              background: isInbound ? 'rgba(5,150,105,0.10)' : 'rgba(30,95,164,0.10)',
            }}
          >
            {isInbound ? '↓ Inbound' : '↑ Outbound'}
          </span>

          <span style={{ fontSize: 10, color: 'var(--color-muted)', marginLeft: 'auto' }}>
            {formatDistanceToNow(new Date(item.occurred_at), { addSuffix: true })}
          </span>
        </div>

        {item.subject && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-text)',
              marginBottom: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.subject}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {(item.from_name || item.from_email) && (
            <span style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
              {item.from_name ?? item.from_email}
            </span>
          )}

          {item.email_log && (
            <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
              {providerIcon(item.email_log.provider)} Logged by {item.email_log.logged_by_name}
            </span>
          )}

          {item.documents.length > 0 && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--color-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Paperclip size={10} />
              {item.documents.length} file{item.documents.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {item.body && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-muted)',
              marginTop: 6,
              lineHeight: 1.5,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {item.body}
          </p>
        )}
      </div>

      <ChevronRight
        size={13}
        color="var(--color-muted)"
        style={{ flexShrink: 0, alignSelf: 'center' }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function CaseDetailPage() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<WarrantyItem[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [conciliation, setConciliation] = useState<ConciliationSubcase | null>(null);
  const [concilItems, setConcilItems] = useState<ConciliationItem[]>([]);
  const [evidence, setEvidence] = useState<Record<string, ItemEvidence[]>>({});

  const [activeTab, setActiveTab] = useState('items');
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [expandedInteraction, setExpandedInteraction] = useState<string | null>(null);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [tarionCaseInput, setTarionInput] = useState('');
  const [savingTarion, setSavingTarion] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [savingOffer, setSavingOffer] = useState(false);
  const [creatingWorkCase, setCreatingWorkCase] = useState(false);
  const [overrideItemId, setOverrideItemId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [uploadingEvidence, setUploadingEvidence] = useState<string | null>(null);
  const [checkingOBC, setCheckingOBC]   = useState<string | null>(null);
  const [obcResults, setOBCResults]     = useState<Record<string, Record<string, unknown>>>({});

  // ───────────────────────────────────────────────────────────
  // Fetchers
  // ───────────────────────────────────────────────────────────

  const fetchCase = useCallback(async () => {
    if (!caseId) return;

    const { data, error } = await supabase.from('cases').select('*').eq('id', caseId).single();

    if (error) {
      console.error('fetchCase:', error);
      setLoading(false);
      return;
    }

    if (data) {
      const nextCase = data as Case;
      setCaseData(nextCase);
      if (nextCase.tarion_case_number) {
        setTarionInput(nextCase.tarion_case_number);
      }
    }

    setLoading(false);
  }, [caseId]);

  const fetchItems = useCallback(async () => {
    if (!caseId) return;

    const { data, error } = await supabase
      .from('warranty_items')
      .select(`
        id, item_number, location, floor_level, room, defect_area,
        description, status, chargeable, completed_at,
        assessed_at, assessed_by_id, assessment_notes, homeowner_present,
        warranty_decision, decision_by_id, decision_at, decision_notes
      `)
      .eq('case_id', caseId)
      .order('item_number');

    if (error) {
      console.error('fetchItems:', error);
      return;
    }

    if (data) setItems(data as WarrantyItem[]);
  }, [caseId]);

  const fetchEvidence = useCallback(async (itemIds: string[]) => {
    if (!itemIds.length) return;

    const { data, error } = await supabase
      .from('warranty_item_evidence')
      .select(
        'id, item_id, evidence_type, phase, file_url, file_name, storage_path, notes, captured_at, is_locked, is_before, homeowner_present'
      )
      .in('item_id', itemIds)
      .order('captured_at', { ascending: true });

    if (error) {
      console.error('fetchEvidence:', error);
      return;
    }

    if (data) {
      const grouped: Record<string, ItemEvidence[]> = {};
      for (const e of data as ItemEvidence[]) {
        if (!grouped[e.item_id]) grouped[e.item_id] = [];
        grouped[e.item_id].push(e);
      }
      setEvidence(grouped);
    }
  }, []);

  const fetchConciliation = useCallback(async () => {
    if (!caseId) return;

    const { data: sub, error: subErr } = await supabase
      .from('conciliation_subcases')
      .select('*')
      .eq('case_id', caseId)
      .is('outcome', null)
      .not('stage', 'eq', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) {
      console.error('fetchConciliation subcase:', subErr);
      return;
    }

    if (sub) {
      setConciliation(sub as ConciliationSubcase);

      const { data: ci, error: ciErr } = await supabase
        .from('conciliation_items')
        .select('*')
        .eq('subcase_id', sub.id)
        .order('item_number');

      if (ciErr) {
        console.error('fetchConciliation items:', ciErr);
        return;
      }

      if (ci) setConcilItems(ci as ConciliationItem[]);
    } else {
      setConciliation(null);
      setConcilItems([]);
    }
  }, [caseId]);

  const fetchInteractions = useCallback(async () => {
    if (!caseId) return;

    const { data, error } = await supabase
      .from('case_interactions')
      .select(
        'id, channel, direction, subject, body, from_email, from_name, to_emails, occurred_at, created_by_name, email_log:email_log_id(provider, has_attachments, attachment_count, logged_by_name, logged_at), documents:case_documents(id, file_name, mime_type)'
      )
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .order('occurred_at', { ascending: false });

    if (error) {
      console.error('fetchInteractions:', error);
      return;
    }

    if (data) setInteractions(data as Interaction[]);
  }, [caseId]);

  const fetchDocuments = useCallback(async () => {
    if (!caseId) return;

    const { data, error } = await supabase
      .from('case_documents')
      .select(
        'id, document_type, file_name, file_size_bytes, mime_type, storage_path, uploaded_by_id, uploaded_at, interaction_id, case_interactions:interaction_id(subject, occurred_at)'
      )
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('fetchDocuments:', error);
      return;
    }

    if (data) setDocuments(data as CaseDocument[]);
  }, [caseId]);

  const fetchNotes = useCallback(async () => {
    if (!caseId) return;

    const { data, error } = await supabase
      .from('case_notes')
      .select('id, body, is_internal, created_by_name, created_at')
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchNotes:', error);
      return;
    }

    if (data) setNotes(data as Note[]);
  }, [caseId]);

  const fetchAudit = useCallback(async () => {
    if (!caseId) return;

    const { data, error } = await supabase
      .from('case_audit_log')
      .select('id, action, field_name, old_value, new_value, user_name, source_app, created_at, metadata')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('fetchAudit:', error);
      return;
    }

    if (data) setAudit(data as AuditEntry[]);
  }, [caseId]);

  const fetchProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from('users')
      .select('id, company_id, first_name, last_name, access_level, is_owner')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('fetchProfile:', error);
      return;
    }

    if (data) setProfile(data as UserProfile);
  }, []);

  const refreshAll = useCallback(() => {
    fetchCase();
    fetchItems();
    fetchConciliation();
    fetchInteractions();
    fetchDocuments();
    fetchNotes();
    fetchAudit();
    fetchProfile();
  }, [
    fetchCase,
    fetchItems,
    fetchConciliation,
    fetchInteractions,
    fetchDocuments,
    fetchNotes,
    fetchAudit,
    fetchProfile,
  ]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (items.length > 0) {
      fetchEvidence(items.map((i) => i.id));
    } else {
      setEvidence({});
    }
  }, [items, fetchEvidence]);

  // ───────────────────────────────────────────────────────────
  // Evidence helpers
  // ───────────────────────────────────────────────────────────

  function getItemEvidence(itemId: string) {
    return evidence[itemId] ?? [];
  }

  function hasAssessmentPhoto(itemId: string) {
    return getItemEvidence(itemId).some((e) => e.evidence_type === 'assessment_photo');
  }

  function hasBeforePhoto(itemId: string) {
    return getItemEvidence(itemId).some((e) => e.evidence_type === 'completion_photo_before');
  }

  function hasAfterPhoto(itemId: string) {
    return getItemEvidence(itemId).some((e) => e.evidence_type === 'completion_photo_after');
  }

  function hasSignature(itemId: string) {
    return getItemEvidence(itemId).some((e) => e.evidence_type === 'homeowner_signature');
  }

  function canComplete(itemId: string)    { return hasAfterPhoto(itemId); }

  function evidenceScore(itemId: string): number {
    let s = 0;
    if (hasAssessmentPhoto(itemId)) s += 34;
    if (hasAfterPhoto(itemId))      s += 33;
    if (hasSignature(itemId))       s += 33;
    return s;
  }

  // ───────────────────────────────────────────────────────────
  // Actions
  // ───────────────────────────────────────────────────────────

  async function handleUploadEvidence(
    itemId: string,
    file: File,
    evidenceType: string,
    phase: string
  ) {
    if (!caseData || !profile) return;

    setUploadingEvidence(itemId);

    try {
      const ext = file.name.split('.').pop();
      const path = `evidence/${caseData.id}/${itemId}/${evidenceType}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('case-documents').upload(path, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('case-documents').getPublicUrl(path);

      const { error: insertError } = await supabase.from('warranty_item_evidence').insert({
        company_id: profile.company_id,
        item_id: itemId,
        case_id: caseData.id,
        evidence_type: evidenceType,
        phase,
        file_url: urlData.publicUrl,
        file_name: file.name,
        storage_path: path,
        is_before: evidenceType === 'completion_photo_before',
        captured_by_id: profile.id,
      });

      if (insertError) throw insertError;

      await fetchEvidence(items.map((i) => i.id));
    } catch (e) {
      console.error('Upload evidence error:', e);
    } finally {
      setUploadingEvidence(null);
    }
  }

  async function handleCheckOBC(item: WarrantyItem) {
    if (!profile) return;
    setCheckingOBC(item.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/interpret-warranty-item`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            description: item.description,
            room:        item.room,
            location:    item.location,
            company_id:  profile.company_id,
            item_id:     item.id,
          }),
        }
      );
      const result = await response.json() as Record<string, unknown>;
      setOBCResults(prev => ({ ...prev, [item.id]: result }));
    } catch (e) {
      console.error('OBC check failed:', e);
    }
    setCheckingOBC(null);
  }

  async function handleSaveItemNote(itemId: string) {
    const note = itemNotes[itemId];
    if (!note?.trim() || !caseData || !profile) return;

    const { error } = await supabase.from('warranty_item_evidence').insert({
      company_id: profile.company_id,
      item_id: itemId,
      case_id: caseData.id,
      evidence_type: 'access_log',
      phase: 'repair',
      notes: note.trim(),
      captured_by_id: profile.id,
    });

    if (error) {
      console.error('handleSaveItemNote:', error);
      return;
    }

    setItemNotes((prev) => ({ ...prev, [itemId]: '' }));
    await fetchEvidence(items.map((i) => i.id));
  }

  async function handleCompleteWithOverride(itemId: string) {
    if (!overrideReason.trim() || !profile || !caseId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error: updateError } = await supabase
      .from('warranty_items')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (updateError) {
      console.error('handleCompleteWithOverride update:', updateError);
      return;
    }

    const { error: auditError } = await supabase.from('case_audit_log').insert({
      company_id: profile.company_id,
      case_id: caseId,
      action: 'item_completed_override',
      user_id: user.id,
      user_name: `${profile.first_name} ${profile.last_name}`,
      source_app: 'web',
      metadata: { item_id: itemId, override_reason: overrideReason },
    });

    if (auditError) {
      console.error('handleCompleteWithOverride audit:', auditError);
    }

    setOverrideItemId(null);
    setOverrideReason('');
    await fetchItems();
  }

  async function handleItemStatus(itemId: string, newStatus: string) {
    setUpdatingItem(itemId);

    try {
      const { error } = await supabase
        .from('warranty_items')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', itemId);

      if (error) {
        console.error('handleItemStatus:', error);
        return;
      }

      await fetchItems();
    } finally {
      setUpdatingItem(null);
    }
  }

  async function handleSaveTarionCase() {
    if (!tarionCaseInput.trim() || !caseId) return;

    setSavingTarion(true);

    try {
      const { error } = await supabase
        .from('cases')
        .update({
          tarion_case_number: tarionCaseInput.trim(),
          tarion_case_number_normalized: normalizeTarionCase(tarionCaseInput),
        })
        .eq('id', caseId);

      if (error) {
        console.error('handleSaveTarionCase:', error);
        return;
      }

      await fetchCase();
    } finally {
      setSavingTarion(false);
    }
  }

  async function handleSaveOffer() {
    if (!offerAmount || !conciliation) return;

    setSavingOffer(true);

    try {
      const { error } = await supabase
        .from('conciliation_subcases')
        .update({
          builder_settlement_offer: parseFloat(offerAmount),
          builder_offer_submitted_at: new Date().toISOString(),
        })
        .eq('id', conciliation.id);

      if (error) {
        console.error('handleSaveOffer:', error);
        return;
      }

      await fetchConciliation();
      setOfferAmount('');
    } finally {
      setSavingOffer(false);
    }
  }

  async function handleCreateWorkCase() {
    if (!caseData?.tarion_case_number_normalized || !conciliation) return;

    setCreatingWorkCase(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: localProfile, error: profileError } = await supabase
        .from('users')
        .select('company_id, first_name, last_name')
        .eq('id', user.id)
        .single();

      if (profileError || !localProfile) {
        console.error('handleCreateWorkCase profile:', profileError);
        return;
      }

      const workNum = `${caseData.tarion_case_number_normalized}-C`;
      const warranted = concilItems.filter((i) => i.tarion_determination === 'warranted');

      const { data: existing, error: existingError } = await supabase
        .from('cases')
        .select('id')
        .eq('company_id', localProfile.company_id)
        .eq('tarion_case_number_normalized', workNum)
        .maybeSingle();

      if (existingError) {
        console.error('handleCreateWorkCase existing:', existingError);
        return;
      }

      if (existing) {
        navigate(`/warranty/cases/${existing.id}`);
        return;
      }

      const { data: newCase, error: newCaseError } = await supabase
        .from('cases')
        .insert({
          company_id: localProfile.company_id,
          case_number: workNum,
          tarion_case_number: workNum,
          tarion_case_number_normalized: workNum,
          display_name: `Conciliation Work — ${caseData.display_name ?? caseData.title}`,
          title: `Conciliation Work — ${caseData.display_name ?? caseData.title}`,
          case_type: 'conciliation',
          period_type: 'conciliation',
          status: 'open',
          lot_id: caseData.lot_id,
          opened_at: conciliation.report_issued_at ?? new Date().toISOString(),
          brp_end_date: conciliation.warranted_resolution_deadline,
          created_by_id: user.id,
        })
        .select('id')
        .single();

      if (newCaseError || !newCase) {
        console.error('handleCreateWorkCase insert case:', newCaseError);
        return;
      }

      if (warranted.length > 0) {
        const { error: itemsError } = await supabase.from('warranty_items').insert(
          warranted.map((item, idx) => ({
            company_id: localProfile.company_id,
            case_id: newCase.id,
            item_number: idx + 1,
            room: item.room,
            description: item.description,
            status: 'outstanding',
            chargeable: item.chargeable,
          }))
        );

        if (itemsError) {
          console.error('handleCreateWorkCase insert items:', itemsError);
        }
      }

      const { error: auditError } = await supabase.from('case_audit_log').insert({
        company_id: localProfile.company_id,
        case_id: caseData.id,
        action: 'conciliation_work_case_created',
        user_id: user.id,
        user_name: `${localProfile.first_name} ${localProfile.last_name}`,
        source_app: 'web',
        metadata: {
          work_case_id: newCase.id,
          work_case_number: workNum,
          warranted_items: warranted.length,
        },
      });

      if (auditError) {
        console.error('handleCreateWorkCase audit:', auditError);
      }

      navigate(`/warranty/cases/${newCase.id}`);
    } finally {
      setCreatingWorkCase(false);
    }
  }

  async function handleAddNote() {
    if (!noteBody.trim() || !caseId || savingNote) return;

    setSavingNote(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: localProfile, error: profileError } = await supabase
        .from('users')
        .select('company_id, first_name, last_name')
        .eq('id', user.id)
        .single();

      if (profileError || !localProfile) {
        console.error('handleAddNote profile:', profileError);
        return;
      }

      const { error } = await supabase.from('case_notes').insert({
        company_id: localProfile.company_id,
        case_id: caseId,
        body: noteBody.trim(),
        is_internal: true,
        created_by_id: user.id,
        created_by_name: `${localProfile.first_name} ${localProfile.last_name}`,
      });

      if (error) {
        console.error('handleAddNote insert:', error);
        return;
      }

      setNoteBody('');
      await fetchNotes();
      await fetchAudit();
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDownload(doc: CaseDocument) {
    const { data, error } = await supabase.storage
      .from('case-documents')
      .createSignedUrl(doc.storage_path, 60);

    if (error) {
      console.error('handleDownload:', error);
      return;
    }

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  }

  function auditLabel(entry: AuditEntry): string {
    const labels: Record<string, string> = {
      email_logged: '📧 Email logged',
      status_changed: '🔄 Status changed',
      note_added: '📝 Note added',
      doc_uploaded: '📎 Document uploaded',
      case_created: '✅ Case created',
      assigned: '👤 Assigned',
      tarion_form_imported: '📋 Tarion form imported',
      conciliation_opened: '⚖️ Conciliation RFC recorded',
      conciliation_report_issued: '📄 Conciliation report issued',
      conciliation_work_case_created: '🔨 Conciliation work case created',
      claim_outcome_recorded: '💰 Claim outcome recorded',
    };

    return labels[entry.action] ?? entry.action.replace(/_/g, ' ');
  }

  // ───────────────────────────────────────────────────────────
  // Render guards
  // ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--color-muted)',
          fontSize: 13,
        }}
      >
        Loading case…
      </div>
    );
  }

  if (!caseData) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--color-muted)',
          fontSize: 13,
        }}
      >
        Case not found.
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────
  // Derived values
  // ───────────────────────────────────────────────────────────

  const status = STATUS_CONFIG[caseData.status] ?? STATUS_CONFIG.open;
  const outstanding = items.filter((i) => i.status === 'outstanding').length;
  const completed = items.filter((i) => i.status === 'completed').length;
  const isConcilCase = caseData.case_type === 'conciliation';

  const concilStage = conciliation
    ? CONCIL_STAGE_CONFIG[conciliation.stage as keyof typeof CONCIL_STAGE_CONFIG] ??
      CONCIL_STAGE_CONFIG.rfc
    : null;

  const inspDeadlineDays = conciliation?.inspection_deadline
    ? differenceInDays(new Date(conciliation.inspection_deadline), new Date())
    : null;

  const warrantedDeadline = conciliation?.warranted_resolution_deadline
    ? differenceInDays(new Date(conciliation.warranted_resolution_deadline), new Date())
    : null;

  const warrantedItems = concilItems.filter((i) => i.tarion_determination === 'warranted');
  const notWarrantedItems = concilItems.filter((i) => i.tarion_determination === 'not_warranted');
  const workCaseNumber = caseData.tarion_case_number_normalized
    ? `${caseData.tarion_case_number_normalized}-C`
    : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-panel)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-muted)',
            fontSize: 12,
            padding: 0,
            fontFamily: 'var(--font-body)',
          }}
        >
          <ArrowLeft size={13} />
          Back
        </button>

        <ChevronRight size={12} color="var(--color-muted)" />

        <span
          style={{
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-muted)',
          }}
        >
          {caseData.tarion_case_number_normalized
            ? `#${caseData.tarion_case_number_normalized}`
            : `#${caseData.case_number}`}
        </span>

        {isConcilCase && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 100,
              background: 'rgba(220,38,38,0.12)',
              color: '#DC2626',
              border: '1px solid rgba(220,38,38,0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Conciliation
          </span>
        )}

        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {caseData.display_name ?? caseData.title}
        </span>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 100,
            background: status.bg,
            border: `1px solid ${status.color}30`,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: status.dot,
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 700, color: status.color }}>{status.label}</span>
          <ChevronDown size={11} color={status.color} />
        </div>

        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 10px',
            borderRadius: 7,
            background: 'var(--color-mist)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
            color: 'var(--color-text-sub)',
            fontSize: 11,
            fontFamily: 'var(--font-body)',
          }}
        >
          <MoreHorizontal size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT SIDEBAR */}
        <div
          style={{
            width: 260,
            flexShrink: 0,
            borderRight: '1px solid var(--color-border)',
            overflowY: 'auto',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <StatPill label="Outstanding" value={outstanding} color="#DC2626" />
            <StatPill label="Completed" value={completed} color="#16A34A" />
          </div>

          {items.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Progress</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {completed}/{items.length}
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 100,
                  background: 'var(--color-mist)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round((completed / items.length) * 100)}%`,
                    borderRadius: 100,
                    background: completed === items.length ? '#16A34A' : '#1E5FA4',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Tarion case number */}
          <div>
            <p
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
                marginBottom: 8,
              }}
            >
              Tarion Case #
            </p>

            {caseData.tarion_case_number_normalized ? (
              <div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-mono)',
                    marginBottom: 2,
                  }}
                >
                  {caseData.tarion_case_number_normalized}
                </p>
                {workCaseNumber && (
                  <p
                    style={{
                      fontSize: 10,
                      color: '#7C3AED',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                    }}
                  >
                    → {workCaseNumber} work case
                  </p>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={tarionCaseInput}
                  onChange={(e) => setTarionInput(e.target.value)}
                  placeholder="e.g. 9874453"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-mist)',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleSaveTarionCase}
                  disabled={!tarionCaseInput.trim() || savingTarion}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: '#1E5FA4',
                    border: 'none',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {savingTarion ? '…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {/* Active conciliation badge */}
          {conciliation && concilStage && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: concilStage.bg,
                border: `1px solid ${concilStage.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Shield size={11} color={concilStage.color} />
                <span style={{ fontSize: 10, fontWeight: 700, color: concilStage.color }}>
                  {concilStage.label}
                </span>
              </div>

              {conciliation.stage === 'rfc' && inspDeadlineDays !== null && (
                <p
                  style={{
                    fontSize: 10,
                    color: inspDeadlineDays <= 3 ? '#DC2626' : concilStage.color,
                    fontWeight: 600,
                  }}
                >
                  {inspDeadlineDays <= 0
                    ? 'Deadline passed'
                    : `${inspDeadlineDays}d to inspection deadline`}
                </p>
              )}

              {conciliation.stage === 'inspection' && conciliation.inspection_date && (
                <p style={{ fontSize: 10, color: concilStage.color, fontWeight: 600 }}>
                  {format(new Date(conciliation.inspection_date), 'MMM d')} ·{' '}
                  {conciliation.inspection_time_slot === '10:00' ? '10:00 AM' : '2:00 PM'}
                </p>
              )}

              {conciliation.stage === 'warranted' && warrantedDeadline !== null && (
                <p
                  style={{
                    fontSize: 10,
                    color: warrantedDeadline <= 7 ? '#DC2626' : '#7C3AED',
                    fontWeight: 600,
                  }}
                >
                  {warrantedDeadline <= 0
                    ? '⚠ Deadline passed'
                    : `${warrantedDeadline}d to resolve warranted items`}
                </p>
              )}

              <button
                onClick={() => setActiveTab('conciliation')}
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  color: concilStage.color,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                View Conciliation →
              </button>
            </div>
          )}

          {/* Dates */}
          <div>
            <p
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
                marginBottom: 8,
              }}
            >
              Dates
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Opened</span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {format(new Date(caseData.opened_at), 'MMM d, yyyy')}
                </span>
              </div>

              {caseData.brp_end_date && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    {isConcilCase ? 'Warranted Deadline' : 'BRP Ends'}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#DC2626',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                    }}
                  >
                    {format(new Date(caseData.brp_end_date), 'MMM d, yyyy')}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Last activity</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                  {formatDistanceToNow(new Date(caseData.last_activity_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '12px',
              borderRadius: 8,
              background: 'rgba(30,95,164,0.05)',
              border: '1px dashed rgba(30,95,164,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Mail size={11} color="#1E5FA4" />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#1E5FA4' }}>
                Email Add-ins Active
              </span>
            </div>
            <p style={{ fontSize: 10, color: 'var(--color-muted)', lineHeight: 1.5 }}>
              Log emails using case #{caseData.tarion_case_number_normalized ?? caseData.case_number}
              .
            </p>
          </div>
        </div>

        {/* RIGHT CONTENT */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid var(--color-border)',
              padding: '0 24px',
              flexShrink: 0,
              background: 'var(--color-panel)',
            }}
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              const isCT = tab.key === 'conciliation';

              let count: number | null = null;
              if (tab.key === 'items') count = items.length;
              if (tab.key === 'interactions') count = interactions.length;
              if (tab.key === 'documents') count = documents.length;
              if (tab.key === 'notes') count = notes.length;
              if (tab.key === 'conciliation') count = conciliation ? 1 : null;

              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 14px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    color: active ? (isCT ? '#DC2626' : 'var(--color-text)') : 'var(--color-muted)',
                    borderBottom: active
                      ? `2px solid ${isCT ? '#DC2626' : '#1E5FA4'}`
                      : '2px solid transparent',
                    marginBottom: -1,
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={13} strokeWidth={1.8} />
                  {tab.label}
                  {count !== null && count > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 100,
                        background: active
                          ? isCT
                            ? 'rgba(220,38,38,0.15)'
                            : 'rgba(30,95,164,0.15)'
                          : 'var(--color-mist)',
                        color: active ? (isCT ? '#DC2626' : '#1E5FA4') : 'var(--color-muted)',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            <div style={{ flex: 1 }} />

            <button
              onClick={refreshAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 10px',
                borderRadius: 7,
                background: 'none',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                color: 'var(--color-muted)',
                fontSize: 11,
                fontFamily: 'var(--font-body)',
              }}
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
            {/* ITEMS */}
            {activeTab === 'items' && (
              <div style={{ paddingTop: 16 }}>
                {items.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    {Object.entries(ITEM_STATUS).map(([key, cfg]) => {
                      const count = items.filter((i) => i.status === key).length;
                      if (count === 0) return null;

                      return (
                        <div
                          key={key}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 100,
                            background: cfg.bg,
                            fontSize: 11,
                            fontWeight: 700,
                            color: cfg.color,
                          }}
                        >
                          {count} {cfg.label}
                        </div>
                      );
                    })}
                  </div>
                )}

                {items.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <Layers
                      size={32}
                      color="var(--color-muted)"
                      strokeWidth={1}
                      style={{ marginBottom: 12 }}
                    />
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        marginBottom: 4,
                      }}
                    >
                      No items yet
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      Import a Tarion warranty form to populate items automatically.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((item) => {
                      const st = ITEM_STATUS[item.status] ?? ITEM_STATUS.outstanding;
                      const isUpdating = updatingItem === item.id;
                      const isCompleted = item.status === 'completed';
                      const isExpanded = expandedItem === item.id;
                      const itemEvidence = getItemEvidence(item.id);
                      const score = evidenceScore(item.id);
                      const scoreColor =
                        score >= 75 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626';
                      const canDone = canComplete(item.id);
                      const isUploading = uploadingEvidence === item.id;
                      const isManager = [
                        'manager',
                        'sr_manager',
                        'director',
                        'vp',
                        'owner',
                        'company',
                      ].includes(profile?.access_level ?? '');

                      const assessmentPhoto = itemEvidence.find(
                        (e) => e.evidence_type === 'assessment_photo'
                      );
                      const beforePhoto = itemEvidence.find(
                        (e) => e.evidence_type === 'completion_photo_before'
                      );
                      const afterPhoto = itemEvidence.find(
                        (e) => e.evidence_type === 'completion_photo_after'
                      );
                      const signature = itemEvidence.find(
                        (e) => e.evidence_type === 'homeowner_signature'
                      );
                      const accessLogs = itemEvidence.filter(
                        (e) => e.evidence_type === 'access_log'
                      );
                      const docs = itemEvidence.filter(
                        (e) =>
                          e.evidence_type === 'engineering_doc' || e.evidence_type === 'other'
                      );

                      const decisionColor =
                        item.warranty_decision === 'warranty_approved'
                          ? '#16A34A'
                          : item.warranty_decision === 'not_warranty'
                            ? '#6B7280'
                            : item.warranty_decision === 'needs_investigation'
                              ? '#D97706'
                              : item.warranty_decision === 'disputed'
                                ? '#DC2626'
                                : null;

                      return (
                        <div
                          key={item.id}
                          style={{
                            borderRadius: 10,
                            overflow: 'hidden',
                            background: isCompleted ? 'rgba(22,163,74,0.02)' : 'var(--color-panel)',
                            border: `1px solid ${
                              isCompleted
                                ? 'rgba(22,163,74,0.25)'
                                : isExpanded
                                  ? 'rgba(30,95,164,0.3)'
                                  : 'var(--color-border)'
                            }`,
                            opacity: isUpdating ? 0.6 : 1,
                            transition: 'all 0.15s',
                          }}
                        >
                          {/* Item header row */}
                          <div
                            onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                            style={{
                              padding: '13px 16px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 12,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: 'var(--color-muted)',
                                fontFamily: 'var(--font-mono)',
                                flexShrink: 0,
                                marginTop: 3,
                                width: 24,
                              }}
                            >
                              {String(item.item_number).padStart(2, '0')}
                            </span>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 4,
                                  flexWrap: 'wrap',
                                }}
                              >
                                {item.location && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 700,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      background:
                                        item.location === 'INTERIOR'
                                          ? 'rgba(30,95,164,0.10)'
                                          : 'rgba(22,163,74,0.10)',
                                      color:
                                        item.location === 'INTERIOR' ? '#1E5FA4' : '#16A34A',
                                    }}
                                  >
                                    {item.location}
                                  </span>
                                )}

                                {item.floor_level && (
                                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                                    {item.floor_level}
                                  </span>
                                )}

                                {item.room && (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: 'var(--color-text)',
                                    }}
                                  >
                                    {item.room}
                                  </span>
                                )}

                                {item.defect_area && item.defect_area !== 'Other' && (
                                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                                    · {item.defect_area}
                                  </span>
                                )}

                                {item.warranty_decision && decisionColor && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 700,
                                      padding: '2px 7px',
                                      borderRadius: 100,
                                      background: `${decisionColor}15`,
                                      color: decisionColor,
                                      border: `1px solid ${decisionColor}30`,
                                    }}
                                  >
                                    {item.warranty_decision.replace(/_/g, ' ').toUpperCase()}
                                  </span>
                                )}

                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: '2px 7px',
                                    borderRadius: 100,
                                    background: st.bg,
                                    color: st.color,
                                    marginLeft: 'auto',
                                    flexShrink: 0,
                                  }}
                                >
                                  {st.label}
                                </span>
                              </div>

                              <p
                                style={{
                                  fontSize: 12,
                                  lineHeight: 1.5,
                                  color: isCompleted
                                    ? 'var(--color-muted)'
                                    : 'var(--color-text)',
                                  textDecoration: isCompleted ? 'line-through' : 'none',
                                }}
                              >
                                {item.description}
                              </p>

                              {item.chargeable !== null && (
                                <p
                                  style={{
                                    fontSize: 10,
                                    marginTop: 3,
                                    fontWeight: 600,
                                    color: item.chargeable ? '#DC2626' : '#16A34A',
                                  }}
                                >
                                  {item.chargeable
                                    ? '⚠ Chargeable to homeowner'
                                    : '✓ Builder responsibility'}
                                </p>
                              )}
                            </div>

                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  marginBottom: 4,
                                  justifyContent: 'flex-end',
                                }}
                              >
                                <div
                                  style={{
                                    width: 48,
                                    height: 3,
                                    borderRadius: 100,
                                    background: 'var(--color-mist)',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      height: '100%',
                                      width: `${score}%`,
                                      background: scoreColor,
                                      borderRadius: 100,
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: 9, fontWeight: 700, color: scoreColor }}>
                                  {score}%
                                </span>
                              </div>
                              <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>
                                evidence
                              </span>
                            </div>

                            {isExpanded ? (
                              <ChevronUp
                                size={13}
                                color="var(--color-muted)"
                                style={{ flexShrink: 0, marginTop: 4 }}
                              />
                            ) : (
                              <ChevronDown
                                size={13}
                                color="var(--color-muted)"
                                style={{ flexShrink: 0, marginTop: 4 }}
                              />
                            )}
                          </div>

                          {/* Expanded panel */}
                          {isExpanded && (
                            <div
                              style={{
                                borderTop: '1px solid var(--color-border)',
                                background: 'var(--color-mist)',
                                padding: '16px',
                              }}
                            >
                              {/* Phase 1 */}
                              <div style={{ marginBottom: 16 }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 10,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: '50%',
                                      background: assessmentPhoto ? '#16A34A' : '#D97706',
                                    }}
                                  />
                                  <p
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.1em',
                                      color: 'var(--color-muted)',
                                    }}
                                  >
                                    Phase 1 — Assessment
                                  </p>

                                  {item.assessed_at && (
                                    <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>
                                      {format(new Date(item.assessed_at), 'MMM d, yyyy')}
                                    </span>
                                  )}

                                  {item.homeowner_present !== null && (
                                    <span
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                        background: item.homeowner_present
                                          ? 'rgba(22,163,74,0.10)'
                                          : 'rgba(220,38,38,0.10)',
                                        color: item.homeowner_present ? '#16A34A' : '#DC2626',
                                      }}
                                    >
                                      Homeowner {item.homeowner_present ? 'present' : 'not present'}
                                    </span>
                                  )}
                                </div>

                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: 8,
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: '10px',
                                      borderRadius: 8,
                                      background: 'var(--color-panel)',
                                      border: `1px solid ${
                                        assessmentPhoto
                                          ? 'rgba(22,163,74,0.3)'
                                          : 'var(--color-border)'
                                      }`,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        marginBottom: 6,
                                      }}
                                    >
                                      {assessmentPhoto ? '🔒' : '📸'}
                                      <span
                                        style={{
                                          fontSize: 9,
                                          fontWeight: 700,
                                          color: 'var(--color-muted)',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.07em',
                                        }}
                                      >
                                        Assessment Photo
                                      </span>
                                    </div>

                                    {assessmentPhoto ? (
                                      <div>
                                        {assessmentPhoto.file_url && (
                                          <img
                                            src={assessmentPhoto.file_url}
                                            alt="Assessment"
                                            style={{
                                              width: '100%',
                                              height: 80,
                                              objectFit: 'cover',
                                              borderRadius: 5,
                                              marginBottom: 5,
                                            }}
                                          />
                                        )}
                                        <p
                                          style={{
                                            fontSize: 9,
                                            color: '#16A34A',
                                            fontWeight: 600,
                                          }}
                                        >
                                          🔒 Locked — legal record
                                        </p>
                                        <p
                                          style={{
                                            fontSize: 9,
                                            color: 'var(--color-muted)',
                                            marginTop: 2,
                                          }}
                                        >
                                          {format(new Date(assessmentPhoto.captured_at), 'MMM d, yyyy h:mm a')}
                                        </p>
                                      </div>
                                    ) : (
                                      <div>
                                        <p
                                          style={{
                                            fontSize: 10,
                                            color: 'var(--color-muted)',
                                            marginBottom: 6,
                                          }}
                                        >
                                          No assessment photo yet
                                        </p>
                                        <label
                                          style={{
                                            display: 'inline-block',
                                            padding: '4px 10px',
                                            borderRadius: 5,
                                            background: 'rgba(30,95,164,0.10)',
                                            border: '1px solid rgba(30,95,164,0.25)',
                                            color: '#1E5FA4',
                                            fontSize: 10,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                          }}
                                        >
                                          Upload
                                          <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={(e) => {
                                              const f = e.target.files?.[0];
                                              if (f) {
                                                void handleUploadEvidence(
                                                  item.id,
                                                  f,
                                                  'assessment_photo',
                                                  'assessment'
                                                );
                                              }
                                            }}
                                          />
                                        </label>
                                      </div>
                                    )}
                                  </div>

                                  <div
                                    style={{
                                      padding: '10px',
                                      borderRadius: 8,
                                      background: 'var(--color-panel)',
                                      border: '1px solid var(--color-border)',
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        marginBottom: 6,
                                      }}
                                    >
                                      <span>📝</span>
                                      <span
                                        style={{
                                          fontSize: 9,
                                          fontWeight: 700,
                                          color: 'var(--color-muted)',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.07em',
                                        }}
                                      >
                                        Assessment Notes
                                      </span>
                                    </div>

                                    {item.assessment_notes ? (
                                      <p
                                        style={{
                                          fontSize: 11,
                                          color: 'var(--color-text)',
                                          lineHeight: 1.5,
                                        }}
                                      >
                                        {item.assessment_notes}
                                      </p>
                                    ) : (
                                      <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                                        No notes yet — added by tech during walkthrough
                                      </p>
                                    )}
                                  </div>

                                  <div
                                    style={{
                                      padding: '10px',
                                      borderRadius: 8,
                                      background: 'var(--color-panel)',
                                      border: '1px solid var(--color-border)',
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        marginBottom: 6,
                                      }}
                                    >
                                      <span>⚖️</span>
                                      <span
                                        style={{
                                          fontSize: 9,
                                          fontWeight: 700,
                                          color: 'var(--color-muted)',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.07em',
                                        }}
                                      >
                                        Warranty Decision
                                      </span>
                                    </div>

                                    {item.warranty_decision ? (
                                      <div>
                                        <p
                                          style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: decisionColor ?? 'var(--color-text)',
                                          }}
                                        >
                                          {item.warranty_decision.replace(/_/g, ' ').toUpperCase()}
                                        </p>

                                        {item.decision_at && (
                                          <p
                                            style={{
                                              fontSize: 9,
                                              color: 'var(--color-muted)',
                                              marginTop: 3,
                                            }}
                                          >
                                            {format(new Date(item.decision_at), 'MMM d, yyyy')}
                                          </p>
                                        )}

                                        {item.decision_notes && (
                                          <p
                                            style={{
                                              fontSize: 10,
                                              color: 'var(--color-muted)',
                                              marginTop: 3,
                                              fontStyle: 'italic',
                                            }}
                                          >
                                            {item.decision_notes}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {[
                                          'warranty_approved',
                                          'not_warranty',
                                          'needs_investigation',
                                          'disputed',
                                        ].map((d) => (
                                          <button
                                            key={d}
                                            onClick={async () => {
                                              const {
                                                data: { user },
                                              } = await supabase.auth.getUser();

                                              if (!user) return;

                                              const { error } = await supabase
                                                .from('warranty_items')
                                                .update({
                                                  warranty_decision: d,
                                                  decision_by_id: user.id,
                                                  decision_at: new Date().toISOString(),
                                                })
                                                .eq('id', item.id);

                                              if (error) {
                                                console.error('set warranty decision:', error);
                                                return;
                                              }

                                              await fetchItems();
                                            }}
                                            style={{
                                              padding: '3px 8px',
                                              borderRadius: 5,
                                              fontSize: 9,
                                              fontWeight: 700,
                                              background: 'var(--color-mist)',
                                              border: '1px solid var(--color-border)',
                                              color: 'var(--color-text)',
                                              cursor: 'pointer',
                                              fontFamily: 'var(--font-body)',
                                              textAlign: 'left',
                                            }}
                                          >
                                            {d.replace(/_/g, ' ')}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Phase 2 */}
                              <div style={{ marginBottom: 16 }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 10,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: '50%',
                                      background: isCompleted
                                        ? '#16A34A'
                                        : beforePhoto && afterPhoto
                                          ? '#D97706'
                                          : '#6B7280',
                                    }}
                                  />
                                  <p
                                    style={{
                                      fontSize: 9,
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.1em',
                                      color: 'var(--color-muted)',
                                    }}
                                  >
                                    Phase 2 — Repair
                                  </p>
                                </div>

                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: 8,
                                    marginBottom: 10,
                                  }}
                                >
                                  {[
                                    {
                                      type: 'completion_photo_after',
                                      label: 'After Repair',
                                      emoji: '✅',
                                      found: afterPhoto,
                                    },
                                    {
                                      type: 'homeowner_signature',
                                      label: 'Signature',
                                      emoji: '✍️',
                                      found: signature,
                                    },
                                  ].map((ev) => (
                                    <div
                                      key={ev.type}
                                      style={{
                                        padding: '10px',
                                        borderRadius: 8,
                                        background: 'var(--color-panel)',
                                        border: `1px solid ${
                                          ev.found ? 'rgba(22,163,74,0.3)' : 'var(--color-border)'
                                        }`,
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          marginBottom: 6,
                                        }}
                                      >
                                        <span>{ev.emoji}</span>
                                        <span
                                          style={{
                                            fontSize: 9,
                                            fontWeight: 700,
                                            color: 'var(--color-muted)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.07em',
                                          }}
                                        >
                                          {ev.label}
                                        </span>
                                        {ev.found && (
                                          <CheckCircle2
                                            size={10}
                                            color="#16A34A"
                                            style={{ marginLeft: 'auto' }}
                                          />
                                        )}
                                      </div>

                                      {ev.found ? (
                                        <div>
                                          {ev.found.file_url && ev.type !== 'homeowner_signature' && (
                                            <img
                                              src={ev.found.file_url}
                                              alt={ev.label}
                                              style={{
                                                width: '100%',
                                                height: 70,
                                                objectFit: 'cover',
                                                borderRadius: 5,
                                                marginBottom: 4,
                                              }}
                                            />
                                          )}

                                          {ev.found.file_url && ev.type === 'homeowner_signature' && (
                                            <img
                                              src={ev.found.file_url}
                                              alt="Signature"
                                              style={{
                                                width: '100%',
                                                height: 50,
                                                objectFit: 'contain',
                                                background: '#fff',
                                                borderRadius: 5,
                                                marginBottom: 4,
                                              }}
                                            />
                                          )}

                                          <p
                                            style={{
                                              fontSize: 9,
                                              color: '#16A34A',
                                              fontWeight: 600,
                                            }}
                                          >
                                            {format(new Date(ev.found.captured_at), 'MMM d, h:mm a')}
                                          </p>
                                        </div>
                                      ) : (
                                        <div>
                                          <p
                                            style={{
                                              fontSize: 10,
                                              color: 'var(--color-muted)',
                                              marginBottom: 6,
                                            }}
                                          >
                                            Required
                                          </p>
                                          <label
                                            style={{
                                              display: 'inline-block',
                                              padding: '4px 10px',
                                              borderRadius: 5,
                                              background: 'rgba(30,95,164,0.10)',
                                              border: '1px solid rgba(30,95,164,0.25)',
                                              color: '#1E5FA4',
                                              fontSize: 10,
                                              fontWeight: 600,
                                              cursor: isUploading ? 'wait' : 'pointer',
                                            }}
                                          >
                                            {isUploading ? 'Uploading…' : 'Upload'}
                                            <input
                                              type="file"
                                              accept="image/*"
                                              style={{ display: 'none' }}
                                              disabled={isUploading}
                                              onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) {
                                                  void handleUploadEvidence(
                                                    item.id,
                                                    f,
                                                    ev.type,
                                                    ev.type === 'completion_photo_before'
                                                      ? 'repair'
                                                      : 'completion'
                                                  );
                                                }
                                              }}
                                            />
                                          </label>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {docs.length > 0 && (
                                  <div style={{ marginBottom: 10 }}>
                                    <p
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.07em',
                                        color: 'var(--color-muted)',
                                        marginBottom: 6,
                                      }}
                                    >
                                      Item Documents
                                    </p>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                      {docs.map((d) => (
                                        <a
                                          key={d.id}
                                          href={d.file_url ?? '#'}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '4px 10px',
                                            borderRadius: 5,
                                            background: 'var(--color-panel)',
                                            border: '1px solid var(--color-border)',
                                            fontSize: 10,
                                            color: '#1E5FA4',
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                          }}
                                        >
                                          📄 {d.file_name ?? 'Document'}
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <label
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    padding: '5px 12px',
                                    borderRadius: 6,
                                    background: 'var(--color-mist)',
                                    border: '1px solid var(--color-border)',
                                    fontSize: 10,
                                    color: 'var(--color-muted)',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    marginBottom: 10,
                                  }}
                                >
                                  + Add Document (Load Design, Report, etc.)
                                  <input
                                    type="file"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) {
                                        void handleUploadEvidence(item.id, f, 'engineering_doc', 'repair');
                                      }
                                    }}
                                  />
                                </label>

                                {accessLogs.length > 0 && (
                                  <div style={{ marginBottom: 8 }}>
                                    {accessLogs.map((n) => (
                                      <div
                                        key={n.id}
                                        style={{
                                          padding: '6px 10px',
                                          borderRadius: 6,
                                          background: 'rgba(217,119,6,0.06)',
                                          border: '1px solid rgba(217,119,6,0.15)',
                                          marginBottom: 4,
                                        }}
                                      >
                                        <p
                                          style={{
                                            fontSize: 11,
                                            color: 'var(--color-text)',
                                            lineHeight: 1.5,
                                          }}
                                        >
                                          {n.notes}
                                        </p>
                                        <p
                                          style={{
                                            fontSize: 9,
                                            color: 'var(--color-muted)',
                                            marginTop: 2,
                                          }}
                                        >
                                          {format(new Date(n.captured_at), 'MMM d, h:mm a')}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div style={{ display: 'flex', gap: 6 }}>
                                  <input
                                    value={itemNotes[item.id] ?? ''}
                                    onChange={(e) =>
                                      setItemNotes((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Add tech note or access log entry…"
                                    style={{
                                      flex: 1,
                                      padding: '7px 10px',
                                      borderRadius: 6,
                                      border: '1px solid var(--color-border)',
                                      background: 'var(--color-panel)',
                                      fontSize: 11,
                                      color: 'var(--color-text)',
                                      fontFamily: 'var(--font-body)',
                                      outline: 'none',
                                    }}
                                  />

                                  <button
                                    onClick={() => void handleSaveItemNote(item.id)}
                                    disabled={!itemNotes[item.id]?.trim()}
                                    style={{
                                      padding: '7px 14px',
                                      borderRadius: 6,
                                      background: itemNotes[item.id]?.trim()
                                        ? '#1E5FA4'
                                        : 'var(--color-mist)',
                                      border: 'none',
                                      color: itemNotes[item.id]?.trim()
                                        ? '#fff'
                                        : 'var(--color-muted)',
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      fontFamily: 'var(--font-body)',
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                              {/* OBC / CPG Interpretation */}
                              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: obcResults[item.id] ? 12 : 0 }}>
                                  <button
                                    onClick={() => void handleCheckOBC(item)}
                                    disabled={checkingOBC === item.id}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      padding: '7px 14px', borderRadius: 7,
                                      background: 'rgba(124,58,237,0.10)',
                                      border: '1px solid rgba(124,58,237,0.25)',
                                      color: '#7C3AED', fontSize: 11, fontWeight: 700,
                                      cursor: checkingOBC === item.id ? 'wait' : 'pointer',
                                      fontFamily: 'var(--font-body)',
                                    }}
                                  >
                                    {checkingOBC === item.id ? '⏳ Checking OBC/CPG…' : '⚖️ Check OBC / CPG'}
                                  </button>
                                  {obcResults[item.id] && (
                                    <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                                      {obcResults[item.id]._cached ? '⚡ Cached' : '🤖 Live'}
                                      {' · '}{String(obcResults[item.id]._model ?? '')}
                                    </span>
                                  )}
                                </div>

                                {obcResults[item.id] && (() => {
                                  const r = obcResults[item.id];
                                  const riskColor =
                                    r.risk_level === 'critical' || r.risk_level === 'high' ? '#DC2626' :
                                    r.risk_level === 'medium' ? '#D97706' :
                                    r.risk_level === 'low' ? '#16A34A' : '#6B7280';
                                  const resp = r.responsibility as Record<string,unknown> | undefined;
                                  const respColor =
                                    resp?.determination === 'builder'   ? '#DC2626' :
                                    resp?.determination === 'homeowner' ? '#16A34A' :
                                    resp?.determination === 'shared'    ? '#D97706' : '#6B7280';
                                  const obcData = r.obc as Record<string,unknown> | undefined;
                                  const cpgData = r.cpg as Record<string,unknown> | undefined;

                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                                      {/* Finding */}
                                      <div style={{ padding: '10px 14px', borderRadius: 8, background: `${riskColor}08`, border: `1px solid ${riskColor}25` }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: riskColor, marginBottom: 4 }}>
                                          {String(r.category ?? '').replace(/_/g,' ')} · Risk: {String(r.risk_level ?? 'unknown').toUpperCase()}
                                        </p>
                                        <p style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.5 }}>{String(r.finding ?? '')}</p>
                                      </div>

                                      {/* OBC */}
                                      {obcData?.interpretation && String(obcData.interpretation) !== 'No Ontario Building Code section found in database for this deficiency type.' && (
                                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(30,95,164,0.06)', border: '1px solid rgba(30,95,164,0.2)' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                            <p style={{ fontSize: 10, fontWeight: 700, color: '#1E5FA4', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ontario Building Code</p>
                                            {(obcData.sections as string[] ?? []).map((s: string) => (
                                              <span key={s} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(30,95,164,0.12)', color: '#1E5FA4' }}>{s}</span>
                                            ))}
                                          </div>
                                          <p style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.6, marginBottom: obcData.tolerance ? 6 : 0 }}>
                                            {String(obcData.interpretation)}
                                          </p>
                                          {obcData.tolerance && (
                                            <p style={{ fontSize: 10, fontWeight: 600, color: '#1E5FA4' }}>Tolerance: {String(obcData.tolerance)}</p>
                                          )}
                                        </div>
                                      )}

                                      {/* CPG */}
                                      {cpgData?.interpretation && String(cpgData.interpretation) !== 'No CPG section found in database for this deficiency type.' && (
                                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                            <p style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.07em' }}>CPG</p>
                                            {(cpgData.sections as string[] ?? []).map((s: string) => (
                                              <span key={s} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(124,58,237,0.12)', color: '#7C3AED' }}>{s}</span>
                                            ))}
                                            {cpgData.threshold && <span style={{ fontSize: 9, color: '#7C3AED', marginLeft: 4 }}>Threshold: {String(cpgData.threshold)}</span>}
                                          </div>
                                          <p style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.6 }}>{String(cpgData.interpretation)}</p>
                                        </div>
                                      )}

                                      {/* Responsibility */}
                                      {resp && resp.determination !== 'insufficient_data' && (
                                        <div style={{ padding: '10px 14px', borderRadius: 8, background: `${respColor}08`, border: `1px solid ${respColor}25` }}>
                                          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: respColor, marginBottom: 4 }}>
                                            Responsibility: {String(resp.determination).toUpperCase()}
                                          </p>
                                          <p style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.5 }}>{String(resp.reasoning ?? '')}</p>
                                        </div>
                                      )}

                                      {/* Defense language */}
                                      {r.defense_language && String(r.defense_language) !== 'Manual review required — no applicable code section found in database for this deficiency type.' && (
                                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <p style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Defense Language</p>
                                            <button
                                              onClick={() => void navigator.clipboard.writeText(String(r.defense_language))}
                                              style={{ fontSize: 9, fontWeight: 600, color: '#16A34A', background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                                            >Copy</button>
                                          </div>
                                          <p style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.6, fontStyle: 'italic' }}>"{String(r.defense_language)}"</p>
                                        </div>
                                      )}

                                      {/* Evidence */}
                                      {(r.recommended_evidence as string[] ?? []).length > 0 && (
                                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                                          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Recommended Evidence</p>
                                          {(r.recommended_evidence as string[]).map((e: string, i: number) => (
                                            <p key={i} style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.4, marginBottom: 2 }}>→ {e}</p>
                                          ))}
                                        </div>
                                      )}

                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Completion / actions */}
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  paddingTop: 12,
                                  borderTop: '1px solid var(--color-border)',
                                }}
                              >
                                {!isCompleted && (
                                  <>
                                    {item.status === 'outstanding' && (
                                      <button
                                        onClick={() => void handleItemStatus(item.id, 'in_progress')}
                                        disabled={isUpdating}
                                        style={{
                                          padding: '7px 14px',
                                          borderRadius: 7,
                                          fontSize: 11,
                                          fontWeight: 600,
                                          background: 'rgba(217,119,6,0.10)',
                                          border: '1px solid rgba(217,119,6,0.25)',
                                          color: '#D97706',
                                          cursor: 'pointer',
                                          fontFamily: 'var(--font-body)',
                                        }}
                                      >
                                        Start Work
                                      </button>
                                    )}

                                    {(item.status === 'outstanding' || item.status === 'in_progress') && (
                                      <button
                                        onClick={() => {
                                          if (canDone) {
                                            void handleItemStatus(item.id, 'completed');
                                          }
                                        }}
                                        disabled={isUpdating || !canDone}
                                        title={
                                          !canDone
                                            ? 'Before and after photos required to complete'
                                            : ''
                                        }
                                        style={{
                                          padding: '7px 16px',
                                          borderRadius: 7,
                                          fontSize: 11,
                                          fontWeight: 700,
                                          background: canDone ? '#16A34A' : 'var(--color-mist)',
                                          border: `1px solid ${
                                            canDone ? '#16A34A' : 'var(--color-border)'
                                          }`,
                                          color: canDone ? '#fff' : 'var(--color-muted)',
                                          cursor: canDone ? 'pointer' : 'not-allowed',
                                          fontFamily: 'var(--font-body)',
                                        }}
                                      >
                                        {canDone ? '✓ Mark Complete' : '🔒 Photos Required'}
                                      </button>
                                    )}

                                    {!canDone && isManager && overrideItemId !== item.id && (
                                      <button
                                        onClick={() => setOverrideItemId(item.id)}
                                        style={{
                                          padding: '7px 14px',
                                          borderRadius: 7,
                                          fontSize: 11,
                                          fontWeight: 600,
                                          background: 'rgba(220,38,38,0.08)',
                                          border: '1px solid rgba(220,38,38,0.2)',
                                          color: '#DC2626',
                                          cursor: 'pointer',
                                          fontFamily: 'var(--font-body)',
                                        }}
                                      >
                                        Manager Override
                                      </button>
                                    )}

                                    {overrideItemId === item.id && (
                                      <div
                                        style={{
                                          flex: 1,
                                          display: 'flex',
                                          gap: 6,
                                          alignItems: 'center',
                                        }}
                                      >
                                        <input
                                          value={overrideReason}
                                          onChange={(e) => setOverrideReason(e.target.value)}
                                          placeholder="Reason for override (required)…"
                                          style={{
                                            flex: 1,
                                            padding: '7px 10px',
                                            borderRadius: 6,
                                            border: '1px solid rgba(220,38,38,0.3)',
                                            background: 'rgba(220,38,38,0.04)',
                                            fontSize: 11,
                                            color: 'var(--color-text)',
                                            fontFamily: 'var(--font-body)',
                                            outline: 'none',
                                          }}
                                        />

                                        <button
                                          onClick={() => void handleCompleteWithOverride(item.id)}
                                          disabled={!overrideReason.trim()}
                                          style={{
                                            padding: '7px 14px',
                                            borderRadius: 6,
                                            background: overrideReason.trim()
                                              ? '#DC2626'
                                              : 'var(--color-mist)',
                                            border: 'none',
                                            color: overrideReason.trim()
                                              ? '#fff'
                                              : 'var(--color-muted)',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            fontFamily: 'var(--font-body)',
                                          }}
                                        >
                                          Confirm
                                        </button>

                                        <button
                                          onClick={() => {
                                            setOverrideItemId(null);
                                            setOverrideReason('');
                                          }}
                                          style={{
                                            padding: '7px 10px',
                                            borderRadius: 6,
                                            background: 'var(--color-mist)',
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-muted)',
                                            fontSize: 11,
                                            cursor: 'pointer',
                                            fontFamily: 'var(--font-body)',
                                          }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}

                                {isCompleted && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                    <p style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
                                      ✓ Completed{' '}
                                      {item.completed_at
                                        ? format(new Date(item.completed_at), 'MMM d, yyyy')
                                        : ''}
                                    </p>

                                    <button
                                      onClick={() => void handleItemStatus(item.id, 'outstanding')}
                                      disabled={isUpdating}
                                      style={{
                                        padding: '5px 12px',
                                        borderRadius: 6,
                                        fontSize: 10,
                                        fontWeight: 600,
                                        background: 'var(--color-mist)',
                                        border: '1px solid var(--color-border)',
                                        color: 'var(--color-muted)',
                                        cursor: 'pointer',
                                        fontFamily: 'var(--font-body)',
                                        marginLeft: 'auto',
                                      }}
                                    >
                                      Reopen
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* CONCILIATION */}
            {activeTab === 'conciliation' && (
              <div style={{ paddingTop: 16 }}>
                {!conciliation ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <Shield
                      size={36}
                      color="var(--color-muted)"
                      strokeWidth={1}
                      style={{ marginBottom: 12 }}
                    />
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        marginBottom: 6,
                      }}
                    >
                      No active conciliation
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--color-muted)',
                        marginBottom: 20,
                      }}
                    >
                      Record when the homeowner files an RFC with Tarion.
                    </p>

                    <button
                      onClick={async () => {
                        const {
                          data: { user },
                        } = await supabase.auth.getUser();

                        if (!user) return;

                        const { data: rpcProfile, error: profileError } = await supabase
                          .from('users')
                          .select('company_id')
                          .eq('id', user.id)
                          .single();

                        if (profileError || !rpcProfile) {
                          console.error('record RFC profile:', profileError);
                          return;
                        }

                        const { error } = await supabase.rpc('open_conciliation', {
                          p_company_id: rpcProfile.company_id,
                          p_case_id: caseId,
                          p_user_id: user.id,
                          p_rfc_requested_at: new Date().toISOString(),
                          p_rfc_received_at: new Date().toISOString(),
                        });

                        if (error) {
                          console.error('open_conciliation rpc:', error);
                          return;
                        }

                        await fetchConciliation();
                        await fetchCase();
                        await fetchAudit();
                      }}
                      style={{
                        padding: '10px 24px',
                        borderRadius: 8,
                        background: '#DC2626',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      ⚖️ Record RFC Filed
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {concilStage && (
                      <div
                        style={{
                          padding: '14px 18px',
                          borderRadius: 10,
                          background: concilStage.bg,
                          border: `1px solid ${concilStage.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <Shield size={18} color={concilStage.color} strokeWidth={1.5} />
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 800, color: concilStage.color }}>
                            {concilStage.label}
                          </p>
                          <p style={{ fontSize: 11, color: concilStage.color, opacity: 0.8 }}>
                            RFC filed{' '}
                            {conciliation.rfc_requested_at
                              ? format(new Date(conciliation.rfc_requested_at), 'MMM d, yyyy')
                              : '—'}
                          </p>
                        </div>
                      </div>
                    )}

                    {(conciliation.stage === 'rfc' || conciliation.stage === 'inspection') && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div
                          style={{
                            padding: '14px 16px',
                            borderRadius: 10,
                            background: 'var(--color-panel)',
                            border: '1px solid var(--color-border)',
                          }}
                        >
                          <p
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              color: 'var(--color-muted)',
                              marginBottom: 8,
                            }}
                          >
                            14-Day Inspection Deadline
                          </p>

                          {conciliation.inspection_deadline ? (
                            <>
                              <p
                                style={{
                                  fontSize: 20,
                                  fontWeight: 900,
                                  fontFamily: 'var(--font-mono)',
                                  color:
                                    inspDeadlineDays !== null && inspDeadlineDays <= 3
                                      ? '#DC2626'
                                      : '#D97706',
                                }}
                              >
                                {inspDeadlineDays !== null
                                  ? inspDeadlineDays <= 0
                                    ? 'Passed'
                                    : `${inspDeadlineDays}d`
                                  : '—'}
                              </p>
                              <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>
                                {format(new Date(conciliation.inspection_deadline), 'MMM d, yyyy')}
                              </p>
                            </>
                          ) : (
                            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>Not set</p>
                          )}
                        </div>

                        <div
                          style={{
                            padding: '14px 16px',
                            borderRadius: 10,
                            background: 'var(--color-panel)',
                            border: '1px solid var(--color-border)',
                          }}
                        >
                          <p
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              color: 'var(--color-muted)',
                              marginBottom: 8,
                            }}
                          >
                            Scheduled Inspection
                          </p>

                          {conciliation.inspection_date ? (
                            <>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  marginBottom: 4,
                                }}
                              >
                                <Calendar size={12} color="#1E5FA4" />
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: 'var(--color-text)',
                                  }}
                                >
                                  {format(new Date(conciliation.inspection_date), 'EEE MMM d, yyyy')}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Clock size={12} color="#1E5FA4" />
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#1E5FA4' }}>
                                  {conciliation.inspection_time_slot === '10:00'
                                    ? '10:00 AM'
                                    : '2:00 PM'}
                                </span>
                                {conciliation.inspection_confirmed && (
                                  <CheckCircle2 size={11} color="#16A34A" />
                                )}
                              </div>
                            </>
                          ) : (
                            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                              Tarion to schedule within 14 days of RFC
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        padding: '16px 18px',
                        borderRadius: 10,
                        background: 'var(--color-panel)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>
                        💰 Builder Settlement Offer
                      </p>

                      {conciliation.builder_settlement_offer ? (
                        <div>
                          <p
                            style={{
                              fontSize: 18,
                              fontWeight: 900,
                              color: '#16A34A',
                              fontFamily: 'var(--font-mono)',
                              marginBottom: 4,
                            }}
                          >
                            $
                            {conciliation.builder_settlement_offer.toLocaleString('en-CA', {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                          <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                            Submitted{' '}
                            {conciliation.builder_offer_submitted_at
                              ? format(new Date(conciliation.builder_offer_submitted_at), 'MMM d, yyyy')
                              : '—'}
                          </p>

                          {conciliation.tarion_offer_decision && (
                            <div
                              style={{
                                marginTop: 8,
                                padding: '5px 10px',
                                borderRadius: 6,
                                background: conciliation.tarion_offer_decision.includes('denied')
                                  ? 'rgba(22,163,74,0.10)'
                                  : 'rgba(220,38,38,0.08)',
                                display: 'inline-block',
                              }}
                            >
                              <p
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: conciliation.tarion_offer_decision.includes('denied')
                                    ? '#16A34A'
                                    : '#DC2626',
                                }}
                              >
                                Tarion: {conciliation.tarion_offer_decision.replace(/_/g, ' ')}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 10 }}>
                            A reasonable retail cash offer may convince the homeowner to cancel the inspection or Tarion to deny the claim.
                          </p>

                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>$</span>
                              <input
                                type="number"
                                value={offerAmount}
                                onChange={(e) => setOfferAmount(e.target.value)}
                                placeholder="Enter offer amount"
                                style={{
                                  flex: 1,
                                  padding: '8px 10px',
                                  borderRadius: 6,
                                  border: '1px solid var(--color-border)',
                                  background: 'var(--color-mist)',
                                  fontSize: 12,
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--color-text)',
                                  outline: 'none',
                                }}
                              />
                            </div>

                            <button
                              onClick={() => void handleSaveOffer()}
                              disabled={!offerAmount || savingOffer}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 6,
                                background: offerAmount ? '#16A34A' : 'var(--color-mist)',
                                border: 'none',
                                color: offerAmount ? '#fff' : 'var(--color-muted)',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: offerAmount ? 'pointer' : 'default',
                                fontFamily: 'var(--font-body)',
                              }}
                            >
                              {savingOffer ? 'Saving…' : 'Record Offer'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {conciliation.stage === 'warranted' && (
                      <div>
                        {conciliation.warranted_resolution_deadline && (
                          <div
                            style={{
                              padding: '12px 16px',
                              borderRadius: 10,
                              background:
                                warrantedDeadline !== null && warrantedDeadline <= 7
                                  ? 'rgba(220,38,38,0.08)'
                                  : 'rgba(124,58,237,0.08)',
                              border: `1px solid ${
                                warrantedDeadline !== null && warrantedDeadline <= 7
                                  ? 'rgba(220,38,38,0.25)'
                                  : 'rgba(124,58,237,0.25)'
                              }`,
                              marginBottom: 12,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <div>
                              <p
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color:
                                    warrantedDeadline !== null && warrantedDeadline <= 7
                                      ? '#DC2626'
                                      : '#7C3AED',
                                }}
                              >
                                30-Day Resolution Deadline
                              </p>
                              <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                                Report issued{' '}
                                {conciliation.report_issued_at
                                  ? format(new Date(conciliation.report_issued_at), 'MMM d, yyyy')
                                  : '—'}
                              </p>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <p
                                style={{
                                  fontSize: 22,
                                  fontWeight: 900,
                                  fontFamily: 'var(--font-mono)',
                                  color:
                                    warrantedDeadline !== null && warrantedDeadline <= 7
                                      ? '#DC2626'
                                      : '#7C3AED',
                                }}
                              >
                                {warrantedDeadline !== null
                                  ? warrantedDeadline <= 0
                                    ? 'PASSED'
                                    : `${warrantedDeadline}d`
                                  : '—'}
                              </p>
                              <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                                {format(new Date(conciliation.warranted_resolution_deadline), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                        )}

                        {warrantedItems.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 10,
                              }}
                            >
                              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>
                                Warranted Items — Tarion Report
                              </p>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 100,
                                  background: 'rgba(220,38,38,0.10)',
                                  color: '#DC2626',
                                }}
                              >
                                {warrantedItems.length} items
                              </span>
                              <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>
                                Read-only — set by Tarion
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {warrantedItems.map((item, i) => (
                                <div
                                  key={item.id}
                                  style={{
                                    padding: '10px 14px',
                                    borderRadius: 8,
                                    background: 'rgba(220,38,38,0.04)',
                                    border: '1px solid rgba(220,38,38,0.15)',
                                    display: 'flex',
                                    gap: 10,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      color: 'var(--color-muted)',
                                      fontFamily: 'var(--font-mono)',
                                      flexShrink: 0,
                                      marginTop: 2,
                                      width: 20,
                                    }}
                                  >
                                    {String(i + 1).padStart(2, '0')}
                                  </span>

                                  <div style={{ flex: 1 }}>
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        marginBottom: 3,
                                        flexWrap: 'wrap',
                                      }}
                                    >
                                      {item.room && (
                                        <span
                                          style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: 'var(--color-text)',
                                          }}
                                        >
                                          {item.room}
                                        </span>
                                      )}

                                      {item.is_new_at_inspection && (
                                        <span
                                          style={{
                                            fontSize: 8,
                                            fontWeight: 700,
                                            padding: '1px 5px',
                                            borderRadius: 3,
                                            background: 'rgba(124,58,237,0.12)',
                                            color: '#7C3AED',
                                          }}
                                        >
                                          NEW AT INSPECTION
                                        </span>
                                      )}

                                      {item.rb04_exception && (
                                        <span
                                          style={{
                                            fontSize: 8,
                                            fontWeight: 700,
                                            padding: '1px 5px',
                                            borderRadius: 3,
                                            background: 'rgba(217,119,6,0.12)',
                                            color: '#D97706',
                                          }}
                                        >
                                          RB04 EXCEPTION
                                        </span>
                                      )}

                                      {item.chargeable !== null && (
                                        <span
                                          style={{
                                            fontSize: 8,
                                            fontWeight: 700,
                                            padding: '1px 5px',
                                            borderRadius: 3,
                                            background: item.chargeable
                                              ? 'rgba(220,38,38,0.10)'
                                              : 'rgba(22,163,74,0.10)',
                                            color: item.chargeable ? '#DC2626' : '#16A34A',
                                          }}
                                        >
                                          {item.chargeable ? 'CHARGEABLE' : 'BUILDER RESP.'}
                                        </span>
                                      )}
                                    </div>

                                    <p style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.5 }}>
                                      {item.description}
                                    </p>

                                    {item.cpg_section && (
                                      <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>
                                        CPG: {item.cpg_section}
                                      </p>
                                    )}

                                    {item.resolved_at && (
                                      <p style={{ fontSize: 10, color: '#16A34A', marginTop: 3 }}>
                                        ✓ Resolved {format(new Date(item.resolved_at), 'MMM d, yyyy')}
                                      </p>
                                    )}

                                    {item.cash_settlement_amount && item.settlement_accepted_at && (
                                      <p style={{ fontSize: 10, color: '#16A34A', marginTop: 3 }}>
                                        ✓ Cash settled ${item.cash_settlement_amount.toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {notWarrantedItems.length > 0 && (
                          <div
                            style={{
                              padding: '10px 14px',
                              borderRadius: 8,
                              background: 'var(--color-mist)',
                              border: '1px solid var(--color-border)',
                              marginBottom: 16,
                            }}
                          >
                            <p style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>
                              ✓ {notWarrantedItems.length} item{notWarrantedItems.length > 1 ? 's' : ''} not warranted — no action required
                            </p>
                          </div>
                        )}

                        {warrantedItems.length > 0 && (
                          <div
                            style={{
                              padding: '16px 18px',
                              borderRadius: 10,
                              background: 'rgba(124,58,237,0.06)',
                              border: '1px solid rgba(124,58,237,0.25)',
                            }}
                          >
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#7C3AED', marginBottom: 6 }}>
                              🔨 Create Conciliation Work Case
                            </p>

                            {!caseData.tarion_case_number_normalized ? (
                              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                                Enter the Tarion case number in the sidebar first.
                              </p>
                            ) : (
                              <>
                                <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 12 }}>
                                  Creates case <strong style={{ fontFamily: 'var(--font-mono)', color: '#7C3AED' }}>{workCaseNumber}</strong> with {warrantedItems.length} warranted item{warrantedItems.length > 1 ? 's' : ''} ready for scheduling. Non-warranted items excluded.
                                </p>

                                <button
                                  onClick={() => void handleCreateWorkCase()}
                                  disabled={creatingWorkCase}
                                  style={{
                                    padding: '10px 24px',
                                    borderRadius: 8,
                                    background: '#7C3AED',
                                    color: '#fff',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-body)',
                                  }}
                                >
                                  {creatingWorkCase
                                    ? 'Creating…'
                                    : `Create ${workCaseNumber} → Schedule ${warrantedItems.length} Items`}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {conciliation.stage === 'claim' && (
                      <div
                        style={{
                          padding: '16px 18px',
                          borderRadius: 10,
                          background: 'rgba(220,38,38,0.06)',
                          border: '1px solid rgba(220,38,38,0.25)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <AlertTriangle size={16} color="#DC2626" />
                          <p style={{ fontSize: 13, fontWeight: 800, color: '#DC2626' }}>
                            Tarion Claim Active
                          </p>
                        </div>

                        {conciliation.tarion_claim_amount && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr 1fr',
                              gap: 10,
                              marginBottom: 12,
                            }}
                          >
                            {[
                              {
                                label: 'Claim Amount',
                                value: `$${conciliation.tarion_claim_amount.toLocaleString('en-CA', {
                                  minimumFractionDigits: 2,
                                })}`,
                              },
                              {
                                label: '15% Admin Fee',
                                value: `$${(conciliation.admin_fee_amount ?? 0).toLocaleString('en-CA', {
                                  minimumFractionDigits: 2,
                                })}`,
                              },
                              {
                                label: 'Total Billed',
                                value: `$${(conciliation.total_billed_to_builder ?? 0).toLocaleString(
                                  'en-CA',
                                  { minimumFractionDigits: 2 }
                                )}`,
                              },
                            ].map((s) => (
                              <div
                                key={s.label}
                                style={{
                                  padding: '10px 12px',
                                  borderRadius: 8,
                                  background: 'rgba(220,38,38,0.08)',
                                  textAlign: 'center',
                                }}
                              >
                                <p
                                  style={{
                                    fontSize: 9,
                                    color: '#DC2626',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                    marginBottom: 4,
                                  }}
                                >
                                  {s.label}
                                </p>
                                <p
                                  style={{
                                    fontSize: 15,
                                    fontWeight: 900,
                                    color: '#DC2626',
                                    fontFamily: 'var(--font-mono)',
                                  }}
                                >
                                  {s.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {conciliation.builder_directory_hit && (
                          <div
                            style={{
                              padding: '8px 12px',
                              borderRadius: 6,
                              background: 'rgba(220,38,38,0.12)',
                              border: '1px solid rgba(220,38,38,0.3)',
                            }}
                          >
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>
                              ⚠ Builder Directory — this claim is recorded on the public Tarion builder
                              directory
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* INTERACTIONS */}
            {activeTab === 'interactions' && (
              <div style={{ paddingTop: 16 }}>
                {interactions.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <MessageSquare
                      size={32}
                      color="var(--color-muted)"
                      strokeWidth={1}
                      style={{ marginBottom: 12 }}
                    />
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        marginBottom: 4,
                      }}
                    >
                      No interactions yet
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      Log an email using case #{caseData.tarion_case_number_normalized ?? caseData.case_number}.
                    </p>
                  </div>
                ) : (
                  interactions.map((item) => {
                    const isExpanded = expandedInteraction === item.id;

                    return (
                      <div key={item.id}>
                        <InteractionCard
                          item={item}
                          onExpand={(id) =>
                            setExpandedInteraction((prev) => (prev === id ? null : id))
                          }
                        />

                        {isExpanded && (
                          <div
                            style={{
                              margin: '0 0 16px 44px',
                              padding: '16px',
                              background: 'var(--color-mist)',
                              borderRadius: 8,
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            {item.to_emails?.length ? (
                              <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 8 }}>
                                To: {item.to_emails.join(', ')}
                              </p>
                            ) : null}

                            {item.body && (
                              <p
                                style={{
                                  fontSize: 12,
                                  color: 'var(--color-text)',
                                  lineHeight: 1.7,
                                  whiteSpace: 'pre-wrap',
                                  marginBottom: 12,
                                }}
                              >
                                {item.body}
                              </p>
                            )}

                            {item.documents.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {item.documents.map((d) => (
                                  <span
                                    key={d.id}
                                    style={{
                                      fontSize: 10,
                                      padding: '4px 8px',
                                      borderRadius: 6,
                                      background: 'var(--color-panel)',
                                      border: '1px solid var(--color-border)',
                                      color: 'var(--color-text-sub)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <Paperclip size={9} />
                                    {d.file_name}
                                  </span>
                                ))}
                              </div>
                            )}

                            {item.email_log && (
                              <p
                                style={{
                                  fontSize: 10,
                                  color: 'var(--color-muted)',
                                  marginTop: 10,
                                  paddingTop: 10,
                                  borderTop: '1px solid var(--color-border)',
                                }}
                              >
                                {providerIcon(item.email_log.provider)} Logged via{' '}
                                {item.email_log.provider === 'microsoft' ? 'Outlook' : 'Gmail'} by{' '}
                                {item.email_log.logged_by_name} ·{' '}
                                {format(new Date(item.email_log.logged_at), 'MMM d, yyyy h:mm a')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* DOCUMENTS */}
            {activeTab === 'documents' && (
              <div style={{ paddingTop: 16 }}>
                {documents.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <FileText
                      size={32}
                      color="var(--color-muted)"
                      strokeWidth={1}
                      style={{ marginBottom: 12 }}
                    />
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        marginBottom: 4,
                      }}
                    >
                      No documents yet
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      Attachments from logged emails appear here automatically.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => void handleDownload(doc)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: 'var(--color-panel)',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{fileIcon(doc.mime_type)}</span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'var(--color-text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {doc.file_name}
                          </p>

                          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                            {doc.file_size_bytes !== null && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: 'var(--color-muted)',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {formatBytes(doc.file_size_bytes)}
                              </span>
                            )}

                            <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                              {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>

                        <Download size={13} color="var(--color-muted)" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* NOTES */}
            {activeTab === 'notes' && (
              <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    background: 'var(--color-panel)',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    overflow: 'hidden',
                  }}
                >
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Add an internal note…"
                    style={{
                      width: '100%',
                      minHeight: 80,
                      padding: '12px 14px',
                      background: 'none',
                      border: 'none',
                      resize: 'none',
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--color-text)',
                      lineHeight: 1.7,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderTop: '1px solid var(--color-border)',
                      background: 'var(--color-mist)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Lock size={10} color="var(--color-muted)" />
                      <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Internal only</span>
                    </div>

                    <button
                      onClick={() => void handleAddNote()}
                      disabled={!noteBody.trim() || savingNote}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '6px 12px',
                        borderRadius: 6,
                        background: noteBody.trim() ? '#1E5FA4' : 'var(--color-mist)',
                        border: 'none',
                        cursor: noteBody.trim() ? 'pointer' : 'default',
                        color: noteBody.trim() ? '#fff' : 'var(--color-muted)',
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      <Send size={11} />
                      {savingNote ? 'Saving…' : 'Add Note'}
                    </button>
                  </div>
                </div>

                {notes.length === 0 ? (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <StickyNote
                      size={28}
                      color="var(--color-muted)"
                      strokeWidth={1}
                      style={{ marginBottom: 10 }}
                    />
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>No notes yet.</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <div
                      key={note.id}
                      style={{
                        padding: '14px',
                        borderRadius: 8,
                        background: 'rgba(217,119,6,0.04)',
                        border: '1px solid rgba(217,119,6,0.15)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>
                          {note.created_by_name}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--color-muted)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>

                      <p
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text)',
                          lineHeight: 1.7,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {note.body}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* AUDIT */}
            {activeTab === 'audit' && (
              <div style={{ paddingTop: 16 }}>
                {audit.length === 0 ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--color-muted)',
                      textAlign: 'center',
                      padding: '40px 0',
                    }}
                  >
                    No audit entries.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {audit.map((entry, i) => (
                      <div
                        key={entry.id}
                        style={{
                          display: 'flex',
                          gap: 12,
                          paddingBottom: 14,
                          borderLeft: i < audit.length - 1 ? '1px solid var(--color-border)' : 'none',
                          marginLeft: 8,
                          paddingLeft: 16,
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: -5,
                            top: 2,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: 'var(--color-panel)',
                            border: '2px solid var(--color-border)',
                          }}
                        />

                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>
                              {auditLabel(entry)}
                            </span>
                            {entry.source_app && (
                              <span
                                style={{
                                  fontSize: 9,
                                  padding: '1px 6px',
                                  borderRadius: 100,
                                  background: 'var(--color-mist)',
                                  color: 'var(--color-muted)',
                                  border: '1px solid var(--color-border)',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {entry.source_app}
                              </span>
                            )}
                          </div>

                          {entry.old_value && entry.new_value && (
                            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                              <span style={{ textDecoration: 'line-through' }}>{entry.old_value}</span> →{' '}
                              <span style={{ color: '#16A34A' }}>{entry.new_value}</span>
                            </p>
                          )}

                          <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 3 }}>
                            {entry.user_name ? `${entry.user_name} · ` : ''}
                            {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}