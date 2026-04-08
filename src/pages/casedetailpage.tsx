import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Mail, Phone, FileText, Paperclip,
  MessageSquare, Clock, CheckCircle2, AlertTriangle, Home,
  User, Wrench, StickyNote, History, Plus, Download,
  Shield, Calendar, MoreHorizontal, ExternalLink, RefreshCw,
  ChevronDown, Send, Lock, Layers,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────

interface Case {
  id: string;
  case_number: string;
  title: string;
  status: string;
  case_type: string;
  priority: number;
  description: string | null;
  opened_at: string;
  closed_at: string | null;
  target_date: string | null;
  interaction_count: number;
  document_count: number;
  last_activity_at: string;
  lot_id: string | null;
  period_type: string | null;
  brp_end_date: string | null;
  properties?: null;
  contacts?: null;
  assigned_user?: null;
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
  email_log: {
    provider: string;
    has_attachments: boolean;
    attachment_count: number;
    logged_by_name: string;
    logged_at: string;
  } | null;
  documents: { id: string; file_name: string; mime_type: string }[];
}

interface Document {
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

// ─── Constants ────────────────────────────────────────────────
interface RolloverPreviewItem {
  item_number: number;
  room: string;
  description: string;
  action: 'will_roll' | 'blocked_cash_settled' | 'blocked_resolved' | 'blocked_not_structural';
  reason: string;
}

interface RolloverPreview {
  to_period: string;
  would_roll: number;
  blocked_cash_settled: number;
  blocked_resolved: number;
  blocked_not_structural: number;
  items: RolloverPreviewItem[];
}
const ITEM_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  outstanding:   { label: 'Outstanding',   color: '#DC2626', bg: 'rgba(220,38,38,0.10)'   },
  in_progress:   { label: 'In Progress',   color: '#D97706', bg: 'rgba(217,119,6,0.10)'   },
  completed:     { label: 'Completed',     color: '#16A34A', bg: 'rgba(22,163,74,0.10)'   },
  disputed:      { label: 'Disputed',      color: '#7C3AED', bg: 'rgba(124,58,237,0.10)'  },
  not_warranted: { label: 'Not Warranted', color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  open:          { label: 'Open',          color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',   dot: '#1E5FA4' },
  in_progress:   { label: 'In Progress',   color: '#D97706', bg: 'rgba(217,119,6,0.10)',   dot: '#D97706' },
  pending_parts: { label: 'Pending Parts', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)',  dot: '#7C3AED' },
  pending_owner: { label: 'Pending Owner', color: '#DC2626', bg: 'rgba(220,38,38,0.10)',   dot: '#DC2626' },
  resolved:      { label: 'Resolved',      color: '#16A34A', bg: 'rgba(22,163,74,0.10)',   dot: '#16A34A' },
  closed:        { label: 'Closed',        color: '#6B7280', bg: 'rgba(107,114,128,0.10)', dot: '#6B7280' },
  voided:        { label: 'Voided',        color: '#9CA3AF', bg: 'rgba(156,163,175,0.10)', dot: '#9CA3AF' },
};

const CHANNEL_CONFIG: Record<string, { icon: React.FC<{ size?: number; color?: string; strokeWidth?: number }>; label: string; color: string }> = {
  email:      { icon: Mail,          label: 'Email',      color: '#1E5FA4' },
  phone:      { icon: Phone,         label: 'Phone',      color: '#16A34A' },
  note:       { icon: StickyNote,    label: 'Note',       color: '#D97706' },
  site_visit: { icon: Home,          label: 'Site Visit', color: '#7C3AED' },
  sms:        { icon: MessageSquare, label: 'SMS',        color: '#0891B2' },
  portal:     { icon: ExternalLink,  label: 'Portal',     color: '#6B7280' },
};

const TABS = [
  { key: 'items',        label: 'Items',        icon: Layers        },
  { key: 'interactions', label: 'Interactions', icon: MessageSquare },
  { key: 'documents',    label: 'Documents',    icon: FileText      },
  { key: 'notes',        label: 'Notes',        icon: StickyNote    },
  { key: 'audit',        label: 'Audit Trail',  icon: History       },
];

// ─── Helpers ──────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string | null): string {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📑';
  if (mime.includes('word')) return '📝';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊';
  return '📄';
}

function providerIcon(provider: string): string {
  if (provider === 'microsoft') return '🔵';
  if (provider === 'google') return '🔴';
  return '📧';
}

// ─── Sub-components ───────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '10px 14px', borderRadius: 8,
      background: 'var(--color-mist)', border: '1px solid var(--color-border)',
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

function InteractionCard({ item, onExpand }: { item: Interaction; onExpand: (id: string) => void }) {
  const ch = CHANNEL_CONFIG[item.channel] ?? CHANNEL_CONFIG.note;
  const Icon = ch.icon;
  const isInbound = item.direction === 'inbound';

  return (
    <div
      style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
      onClick={() => onExpand(item.id)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: `${ch.color}18`, border: `1.5px solid ${ch.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color={ch.color} strokeWidth={1.8} />
        </div>
        <div style={{ width: 1, flex: 1, background: 'var(--color-border)', marginTop: 6 }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
            color: ch.color, background: `${ch.color}18`,
            textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>{ch.label}</span>
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 100,
            color: isInbound ? '#059669' : '#1E5FA4',
            background: isInbound ? 'rgba(5,150,105,0.10)' : 'rgba(30,95,164,0.10)',
          }}>{isInbound ? '↓ Inbound' : '↑ Outbound'}</span>
          <span style={{ fontSize: 10, color: 'var(--color-muted)', marginLeft: 'auto' }}>
            {formatDistanceToNow(new Date(item.occurred_at), { addSuffix: true })}
          </span>
        </div>

        {item.subject && (
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            <span style={{ fontSize: 10, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Paperclip size={10} /> {item.documents.length} file{item.documents.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {item.body && (
          <p style={{
            fontSize: 11, color: 'var(--color-muted)', marginTop: 6, lineHeight: 1.5,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {item.body}
          </p>
        )}
      </div>

      <ChevronRight size={13} color="var(--color-muted)" style={{ flexShrink: 0, alignSelf: 'center' }} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function CaseDetailPage() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [caseData, setCaseData]         = useState<Case | null>(null);
  const [items, setItems]               = useState<WarrantyItem[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [documents, setDocuments]       = useState<Document[]>([]);
  const [notes, setNotes]               = useState<Note[]>([]);
  const [audit, setAudit]               = useState<AuditEntry[]>([]);

  const [activeTab, setActiveTab]       = useState('items');
  const [loading, setLoading]           = useState(true);
  const [expandedInteraction, setExpanded] = useState<string | null>(null);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [noteBody, setNoteBody]         = useState('');
  const [savingNote, setSavingNote]     = useState(false);
  const [showRollover, setShowRollover] = useState(false);
  const [rolloverPreview, setRolloverPreview] = useState<RolloverPreview | null>(null);
  const [rolloverLoading, setRolloverLoading] = useState(false);
  const [rolloverCommitting, setRolloverCommitting] = useState(false);
  const [rolloverResult, setRolloverResult] = useState<{ toCaseId: string; rolled: number } | null>(null);

  // ── Fetchers ──────────────────────────────────────────────

  const fetchCase = useCallback(async () => {
    if (!caseId) return;
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();
    if (error) console.error('fetchCase error:', error);
    if (data) setCaseData(data as Case);
    setLoading(false);
  }, [caseId]);

  const fetchItems = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase
      .from('warranty_items')
      .select('id, item_number, location, floor_level, room, defect_area, description, status, chargeable, completed_at')
      .eq('case_id', caseId)
      .order('item_number');
    if (data) setItems(data as WarrantyItem[]);
  }, [caseId]);

  const fetchInteractions = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase
      .from('case_interactions')
      .select(`
        id, channel, direction, subject, body,
        from_email, from_name, to_emails, occurred_at,
        created_by_name,
        email_log:email_log_id(provider, has_attachments, attachment_count, logged_by_name, logged_at),
        documents:case_documents(id, file_name, mime_type)
      `)
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .order('occurred_at', { ascending: false });
    if (data) setInteractions(data as Interaction[]);
  }, [caseId]);

  const fetchDocuments = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase
      .from('case_documents')
      .select(`
        id, document_type, file_name, file_size_bytes, mime_type,
        storage_path, uploaded_by_id, uploaded_at, interaction_id,
        case_interactions:interaction_id(subject, occurred_at)
      `)
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });
    if (data) setDocuments(data as Document[]);
  }, [caseId]);

  const fetchNotes = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase
      .from('case_notes')
      .select('id, body, is_internal, created_by_name, created_at')
      .eq('case_id', caseId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (data) setNotes(data as Note[]);
  }, [caseId]);

  const fetchAudit = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase
      .from('case_audit_log')
      .select('id, action, field_name, old_value, new_value, user_name, source_app, created_at, metadata')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setAudit(data as AuditEntry[]);
  }, [caseId]);

  useEffect(() => {
    fetchCase();
    fetchItems();
    fetchInteractions();
    fetchDocuments();
    fetchNotes();
    fetchAudit();
  }, [fetchCase, fetchItems, fetchInteractions, fetchDocuments, fetchNotes, fetchAudit]);

  // ── Item status update ─────────────────────────────────────

  async function handleItemStatus(itemId: string, newStatus: string) {
    setUpdatingItem(itemId);
    await supabase
      .from('warranty_items')
      .update({
        status:       newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', itemId);
    await fetchItems();
    setUpdatingItem(null);
  }

  // ── Note submit ────────────────────────────────────────────

  async function handleAddNote() {
    if (!noteBody.trim() || !caseId || savingNote) return;
    setSavingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingNote(false); return; }
    const { data: profile } = await supabase
      .from('users')
      .select('company_id, first_name, last_name')
      .eq('id', user.id)
      .single();
    if (!profile) { setSavingNote(false); return; }
    await supabase.from('case_notes').insert({
      company_id:      profile.company_id,
      case_id:         caseId,
      body:            noteBody.trim(),
      is_internal:     true,
      created_by_id:   user.id,
      created_by_name: `${profile.first_name} ${profile.last_name}`,
    });
    setNoteBody('');
    setSavingNote(false);
    fetchNotes();
    fetchAudit();
  }

  // ── Document download ──────────────────────────────────────

  async function handleDownload(doc: Document) {
    const { data } = await supabase.storage
      .from('case-documents')
      .createSignedUrl(doc.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  // ── Audit label ────────────────────────────────────────────

  function auditLabel(entry: AuditEntry): string {
    const m: Record<string, string> = {
      email_logged:         '📧 Email logged',
      status_changed:       '🔄 Status changed',
      note_added:           '📝 Note added',
      doc_uploaded:         '📎 Document uploaded',
      case_created:         '✅ Case created',
      assigned:             '👤 Assigned',
      tarion_form_imported: '📋 Tarion form imported',
    };
    return m[entry.action] ?? entry.action.replace(/_/g, ' ');
  }

  // ── Guards ─────────────────────────────────────────────────
// ── Rollover helpers ───────────────────────────────────────

const NEXT_PERIOD: Record<string, string> = {
  initial:     'mid_year',
  mid_year:    'year_end',
  year_end:    'second_year',
  second_year: 'msd',
};

const PERIOD_LABELS: Record<string, string> = {
  initial:     '30-Day Initial',
  mid_year:    'Mid-Year',
  year_end:    'Year-End',
  second_year: '2nd Year',
  msd:         'MSD',
};

const nextPeriod = caseData ? NEXT_PERIOD[caseData.period_type ?? ''] : null;

async function handleRolloverPreview() {
  if (!caseData) return;
  setRolloverLoading(true);
  setShowRollover(true);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from('users').select('company_id').eq('id', user.id).single();
  if (!profile) return;
  const { data } = await supabase.rpc('rollover_period', {
    p_company_id:   profile.company_id,
    p_from_case_id: caseData.id,
    p_to_period:    nextPeriod,
    p_user_id:      user.id,
    p_preview_only: true,
  });
  setRolloverPreview(data as RolloverPreview);
  setRolloverLoading(false);
}

async function handleRolloverCommit() {
  if (!caseData) return;
  setRolloverCommitting(true);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from('users').select('company_id').eq('id', user.id).single();
  if (!profile) return;
  const { data } = await supabase.rpc('rollover_period', {
    p_company_id:   profile.company_id,
    p_from_case_id: caseData.id,
    p_to_period:    nextPeriod,
    p_user_id:      user.id,
    p_preview_only: false,
  });
  setRolloverCommitting(false);
  if (data?.success) {
    setRolloverResult({ toCaseId: data.to_case_id, rolled: data.rolled });
    fetchItems();
    fetchAudit();
  }
}
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-muted)', fontSize: 13 }}>
      Loading case…
    </div>
  );

  if (!caseData) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-muted)', fontSize: 13 }}>
      Case not found.
    </div>
  );

  const status      = STATUS_CONFIG[caseData.status] ?? STATUS_CONFIG.open;
  const outstanding = items.filter(i => i.status === 'outstanding').length;
  const completed   = items.filter(i => i.status === 'completed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--color-bg)' }}>

      {/* ── Header ───────────────────────────────────────── */}
      <div style={{
        padding: '14px 24px', borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-panel)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, padding: 0, fontFamily: 'var(--font-body)' }}
        >
          <ArrowLeft size={13} /> Back
        </button>
        <ChevronRight size={12} color="var(--color-muted)" />
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
          #{caseData.case_number}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {caseData.title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 100, background: status.bg, border: `1px solid ${status.color}30` }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: status.dot }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: status.color }}>{status.label}</span>
          <ChevronDown size={11} color={status.color} />
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
          borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)',
          cursor: 'pointer', color: 'var(--color-text-sub)', fontSize: 11, fontFamily: 'var(--font-body)',
        }}>
          <MoreHorizontal size={13} />
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT sidebar */}
        <div style={{
          width: 260, flexShrink: 0, borderRight: '1px solid var(--color-border)',
          overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <StatPill label="Outstanding" value={outstanding} color="#DC2626" />
            <StatPill label="Completed"   value={completed}   color="#16A34A" />
          </div>

          {/* Progress bar */}
          {items.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Progress</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>
                  {completed}/{items.length}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round((completed / items.length) * 100)}%`,
                  borderRadius: 100,
                  background: completed === items.length ? '#16A34A' : '#1E5FA4',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {/* Dates */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>Dates</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Opened</span>
                <span style={{ fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>
                  {format(new Date(caseData.opened_at), 'MMM d, yyyy')}
                </span>
              </div>
              {caseData.brp_end_date && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>BRP Ends</span>
                  <span style={{ fontSize: 11, color: '#DC2626', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {format(new Date(caseData.brp_end_date), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
              {caseData.target_date && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Target</span>
                  <span style={{ fontSize: 11, color: '#D97706', fontFamily: 'var(--font-mono)' }}>
                    {format(new Date(caseData.target_date), 'MMM d, yyyy')}
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

          {/* Email add-in banner */}
          <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(30,95,164,0.05)', border: '1px dashed rgba(30,95,164,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Mail size={11} color="#1E5FA4" />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#1E5FA4' }}>Email Add-ins Active</span>
            </div>
            <p style={{ fontSize: 10, color: 'var(--color-muted)', lineHeight: 1.5 }}>
              Log emails from Outlook or Gmail using case #{caseData.case_number}.
            </p>
          </div>
        </div>

        {/* RIGHT — tabs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'center',
            borderBottom: '1px solid var(--color-border)',
            padding: '0 24px', flexShrink: 0, background: 'var(--color-panel)',
          }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              let count: number | null = null;
              if (tab.key === 'items')        count = items.length;
              if (tab.key === 'interactions') count = interactions.length;
              if (tab.key === 'documents')    count = documents.length;
              if (tab.key === 'notes')        count = notes.length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '12px 14px', border: 'none', background: 'none',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? 'var(--color-text)' : 'var(--color-muted)',
                    borderBottom: active ? '2px solid #1E5FA4' : '2px solid transparent',
                    marginBottom: -1, transition: 'all 0.15s',
                  }}
                >
                  <Icon size={13} strokeWidth={1.8} />
                  {tab.label}
                  {count !== null && count > 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 100,
                      background: active ? 'rgba(30,95,164,0.15)' : 'var(--color-mist)',
                      color: active ? '#1E5FA4' : 'var(--color-muted)',
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => { fetchCase(); fetchItems(); fetchInteractions(); fetchDocuments(); fetchNotes(); fetchAudit(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
                borderRadius: 7, background: 'none', border: '1px solid var(--color-border)',
                cursor: 'pointer', color: 'var(--color-muted)', fontSize: 11, fontFamily: 'var(--font-body)',
              }}
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>

            {/* ── ITEMS ──────────────────────────────────── */}
            {activeTab === 'items' && (
              <div style={{ paddingTop: 16 }}>
                {items.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    {Object.entries(ITEM_STATUS).map(([key, cfg]) => {
                      const count = items.filter(i => i.status === key).length;
                      if (count === 0) return null;
                      return (
                        <div key={key} style={{
                          padding: '4px 10px', borderRadius: 100,
                          background: cfg.bg, fontSize: 11, fontWeight: 700, color: cfg.color,
                        }}>
                          {count} {cfg.label}
                        </div>
                      );
                    })}
                  {nextPeriod && (
                      <button
                        onClick={handleRolloverPreview}
                        style={{
                          marginLeft: 'auto', padding: '5px 14px', borderRadius: 6,
                          background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.25)',
                          color: '#7C3AED', fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'var(--font-body)',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        ↗ Roll to {PERIOD_LABELS[nextPeriod]}
                      </button>
                    )}
                  </div>
                )}

                {/* ── ROLLOVER MODAL ─────────────────────── */}
                {showRollover && (
                  <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000,
                  }}>
                    <div style={{
                      background: 'var(--color-panel)', borderRadius: 14,
                      padding: 28, width: 580, maxHeight: '80vh',
                      display: 'flex', flexDirection: 'column', gap: 16,
                      boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
                    }}>
                      {/* Modal header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 2 }}>
                            Roll to {PERIOD_LABELS[nextPeriod ?? '']}
                          </h2>
                          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                            Review which items will carry forward before committing.
                          </p>
                        </div>
                        <button
                          onClick={() => { setShowRollover(false); setRolloverPreview(null); setRolloverResult(null); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 18, lineHeight: 1 }}
                        >
                          ×
                        </button>
                      </div>

                      {/* Success state */}
                      {rolloverResult && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                            {rolloverResult.rolled} items rolled to {PERIOD_LABELS[nextPeriod ?? '']}
                          </p>
                          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 20 }}>
                            A new case has been created with the outstanding items.
                          </p>
                          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <button
                              onClick={() => navigate(`/warranty/cases/${rolloverResult.toCaseId}`)}
                              style={{
                                padding: '10px 20px', borderRadius: 8, background: '#7C3AED',
                                color: '#fff', border: 'none', cursor: 'pointer',
                                fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
                              }}
                            >
                              Open New Case →
                            </button>
                            <button
                              onClick={() => { setShowRollover(false); setRolloverPreview(null); setRolloverResult(null); }}
                              style={{
                                padding: '10px 20px', borderRadius: 8, background: 'var(--color-mist)',
                                color: 'var(--color-muted)', border: '1px solid var(--color-border)',
                                cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)',
                              }}
                            >
                              Stay Here
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Loading state */}
                      {rolloverLoading && !rolloverResult && (
                        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--color-muted)', fontSize: 13 }}>
                          Calculating rollover…
                        </div>
                      )}

                      {/* Preview state */}
                      {rolloverPreview && !rolloverResult && (
                        <>
                          {/* Summary counts */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', textAlign: 'center' }}>
                              <p style={{ fontSize: 22, fontWeight: 800, color: '#7C3AED' }}>{rolloverPreview.would_roll}</p>
                              <p style={{ fontSize: 10, color: '#7C3AED', fontWeight: 600 }}>Will Roll</p>
                            </div>
                            <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', textAlign: 'center' }}>
                              <p style={{ fontSize: 22, fontWeight: 800, color: '#16A34A' }}>{rolloverPreview.blocked_resolved}</p>
                              <p style={{ fontSize: 10, color: '#16A34A', fontWeight: 600 }}>Already Resolved</p>
                            </div>
                            <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', textAlign: 'center' }}>
                              <p style={{ fontSize: 22, fontWeight: 800, color: '#DC2626' }}>{rolloverPreview.blocked_cash_settled}</p>
                              <p style={{ fontSize: 10, color: '#DC2626', fontWeight: 600 }}>Cash Settled</p>
                            </div>
                          </div>

                          {/* Item list */}
                          <div style={{ overflowY: 'auto', maxHeight: 300, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {rolloverPreview.items.map((item, i) => {
                              const isRolling = item.action === 'will_roll';
                              const color = isRolling ? '#7C3AED' : item.action === 'blocked_cash_settled' ? '#DC2626' : '#16A34A';
                              const icon = isRolling ? '↗' : item.action === 'blocked_cash_settled' ? '💰' : '✓';
                              return (
                                <div key={i} style={{
                                  display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8,
                                  background: isRolling ? 'rgba(124,58,237,0.05)' : 'var(--color-mist)',
                                  border: `1px solid ${isRolling ? 'rgba(124,58,237,0.15)' : 'var(--color-border)'}`,
                                  alignItems: 'flex-start',
                                }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 1 }}>
                                    {String(item.item_number).padStart(2, '0')}
                                  </span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>
                                      {item.room} — {item.description}
                                    </p>
                                    <p style={{ fontSize: 10, color }}>
                                      {icon} {item.reason}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Commit button */}
                          {rolloverPreview.would_roll > 0 ? (
                            <button
                              onClick={handleRolloverCommit}
                              disabled={rolloverCommitting}
                              style={{
                                padding: '12px', borderRadius: 9, background: '#7C3AED',
                                color: '#fff', border: 'none', cursor: 'pointer',
                                fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)',
                              }}
                            >
                              {rolloverCommitting
                                ? 'Rolling items…'
                                : `Confirm — Roll ${rolloverPreview.would_roll} Items to ${PERIOD_LABELS[nextPeriod ?? '']}`}
                            </button>
                          ) : (
                            <p style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: '8px 0' }}>
                              No items to roll — all are resolved or blocked.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {items.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <Layers size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>No items yet</p>
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      Import a Tarion warranty form PDF to populate items automatically.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(item => {
                      const st          = ITEM_STATUS[item.status] ?? ITEM_STATUS.outstanding;
                      const isUpdating  = updatingItem === item.id;
                      const isCompleted = item.status === 'completed';
                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '14px 16px', borderRadius: 10,
                            background: isCompleted ? 'rgba(22,163,74,0.03)' : 'var(--color-panel)',
                            border: `1px solid ${isCompleted ? 'rgba(22,163,74,0.2)' : 'var(--color-border)'}`,
                            opacity: isUpdating ? 0.6 : 1,
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 800, color: 'var(--color-muted)',
                              fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 3, width: 24,
                            }}>
                              {String(item.item_number).padStart(2, '0')}
                            </span>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                                {item.location && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                    background: item.location === 'INTERIOR' ? 'rgba(30,95,164,0.10)' : 'rgba(22,163,74,0.10)',
                                    color: item.location === 'INTERIOR' ? '#1E5FA4' : '#16A34A',
                                  }}>
                                    {item.location}
                                  </span>
                                )}
                                {item.floor_level && (
                                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{item.floor_level}</span>
                                )}
                                {item.room && (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>{item.room}</span>
                                )}
                                {item.defect_area && item.defect_area !== 'Other' && (
                                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>· {item.defect_area}</span>
                                )}
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                                  background: st.bg, color: st.color, marginLeft: 'auto', flexShrink: 0,
                                }}>
                                  {st.label}
                                </span>
                              </div>

                              <p style={{
                                fontSize: 12, lineHeight: 1.5,
                                color: isCompleted ? 'var(--color-muted)' : 'var(--color-text)',
                                textDecoration: isCompleted ? 'line-through' : 'none',
                              }}>
                                {item.description}
                              </p>

                              {item.chargeable !== null && (
  <p style={{ fontSize: 10, marginTop: 4, fontWeight: 600, color: item.chargeable ? '#DC2626' : '#16A34A' }}>
    {item.chargeable ? '⚠ Chargeable to homeowner' : '✓ Builder responsibility'}
  </p>
)}

                              {item.completed_at && (
                                <p style={{ fontSize: 10, marginTop: 4, color: '#16A34A' }}>
                                  ✓ Completed {format(new Date(item.completed_at), 'MMM d, yyyy')}
                                </p>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              {item.status === 'outstanding' && (
                                <>
                                  <button
                                    onClick={() => handleItemStatus(item.id, 'in_progress')}
                                    disabled={isUpdating}
                                    style={{
                                      padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                      background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.25)',
                                      color: '#D97706', cursor: 'pointer', fontFamily: 'var(--font-body)',
                                    }}
                                  >
                                    Start
                                  </button>
                                  <button
                                    onClick={() => handleItemStatus(item.id, 'completed')}
                                    disabled={isUpdating}
                                    style={{
                                      padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                      background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)',
                                      color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)',
                                    }}
                                  >
                                    ✓ Complete
                                  </button>
                                </>
                              )}
                              {item.status === 'in_progress' && (
                                <button
                                  onClick={() => handleItemStatus(item.id, 'completed')}
                                  disabled={isUpdating}
                                  style={{
                                    padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                    background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)',
                                    color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)',
                                  }}
                                >
                                  ✓ Complete
                                </button>
                              )}
                              {item.status === 'completed' && (
                                <button
                                  onClick={() => handleItemStatus(item.id, 'outstanding')}
                                  disabled={isUpdating}
                                  style={{
                                    padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                    background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                                    color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)',
                                  }}
                                >
                                  Reopen
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── INTERACTIONS ───────────────────────────── */}
            {activeTab === 'interactions' && (
              <div style={{ paddingTop: 16 }}>
                {interactions.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <MessageSquare size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>No interactions yet</p>
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      Log an email from Outlook or Gmail using case #{caseData.case_number}.
                    </p>
                  </div>
                ) : (
                  interactions.map(item => {
                    const isExpanded = expandedInteraction === item.id;
                    return (
                      <div key={item.id}>
                        <InteractionCard item={item} onExpand={(id) => setExpanded(isExpanded ? null : id)} />
                        {isExpanded && (
                          <div style={{
                            margin: '0 0 16px 44px', padding: '16px',
                            background: 'var(--color-mist)', borderRadius: 8,
                            border: '1px solid var(--color-border)',
                          }}>
                            {item.to_emails?.length ? (
                              <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 8 }}>
                                To: {item.to_emails.join(', ')}
                              </p>
                            ) : null}
                            {item.body && (
                              <p style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                                {item.body}
                              </p>
                            )}
                            {item.documents.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {item.documents.map(d => (
                                  <span key={d.id} style={{
                                    fontSize: 10, padding: '4px 8px', borderRadius: 6,
                                    background: 'var(--color-panel)', border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 4,
                                  }}>
                                    <Paperclip size={9} /> {d.file_name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {item.email_log && (
                              <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                                {providerIcon(item.email_log.provider)} Logged via {item.email_log.provider === 'microsoft' ? 'Outlook' : 'Gmail'} by {item.email_log.logged_by_name} · {format(new Date(item.email_log.logged_at), 'MMM d, yyyy h:mm a')}
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

            {/* ── DOCUMENTS ──────────────────────────────── */}
            {activeTab === 'documents' && (
              <div style={{ paddingTop: 16 }}>
                {documents.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <FileText size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>No documents yet</p>
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Attachments from logged emails appear here automatically.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {documents.map(doc => (
                      <div
                        key={doc.id}
                        onClick={() => handleDownload(doc)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 14px', borderRadius: 8,
                          background: 'var(--color-panel)', border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{fileIcon(doc.mime_type)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.file_name}
                          </p>
                          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                            {doc.file_size_bytes && (
                              <span style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
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

            {/* ── NOTES ──────────────────────────────────── */}
            {activeTab === 'notes' && (
              <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'var(--color-panel)', borderRadius: 10, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                  <textarea
                    value={noteBody}
                    onChange={e => setNoteBody(e.target.value)}
                    placeholder="Add an internal note…"
                    style={{
                      width: '100%', minHeight: 80, padding: '12px 14px',
                      background: 'none', border: 'none', resize: 'none',
                      fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-text)',
                      lineHeight: 1.7, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderTop: '1px solid var(--color-border)',
                    background: 'var(--color-mist)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Lock size={10} color="var(--color-muted)" />
                      <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Internal only</span>
                    </div>
                    <button
                      onClick={handleAddNote}
                      disabled={!noteBody.trim() || savingNote}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: 6,
                        background: noteBody.trim() ? '#1E5FA4' : 'var(--color-mist)',
                        border: 'none', cursor: noteBody.trim() ? 'pointer' : 'default',
                        color: noteBody.trim() ? '#fff' : 'var(--color-muted)',
                        fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
                      }}
                    >
                      <Send size={11} /> {savingNote ? 'Saving…' : 'Add Note'}
                    </button>
                  </div>
                </div>

                {notes.length === 0 ? (
                  <div style={{ padding: '40px 0', textAlign: 'center' }}>
                    <StickyNote size={28} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 10 }} />
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>No notes yet.</p>
                  </div>
                ) : (
                  notes.map(note => (
                    <div key={note.id} style={{
                      padding: '14px', borderRadius: 8,
                      background: 'rgba(217,119,6,0.04)', border: '1px solid rgba(217,119,6,0.15)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>{note.created_by_name}</span>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                          {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {note.body}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── AUDIT TRAIL ────────────────────────────── */}
            {activeTab === 'audit' && (
              <div style={{ paddingTop: 16 }}>
                {audit.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: '40px 0' }}>No audit entries.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {audit.map((entry, i) => (
                      <div key={entry.id} style={{
                        display: 'flex', gap: 12, paddingBottom: 14,
                        borderLeft: i < audit.length - 1 ? '1px solid var(--color-border)' : 'none',
                        marginLeft: 8, paddingLeft: 16, position: 'relative',
                      }}>
                        <div style={{
                          position: 'absolute', left: -5, top: 2,
                          width: 10, height: 10, borderRadius: '50%',
                          background: 'var(--color-panel)', border: '2px solid var(--color-border)',
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>
                              {auditLabel(entry)}
                            </span>
                            {entry.source_app && (
                              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)', textTransform: 'capitalize' }}>
                                {entry.source_app}
                              </span>
                            )}
                          </div>
                          {entry.old_value && entry.new_value && (
                            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                              <span style={{ textDecoration: 'line-through' }}>{entry.old_value}</span>
                              {' → '}
                              <span style={{ color: '#16A34A' }}>{entry.new_value}</span>
                            </p>
                          )}
                          <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 3 }}>
                            {entry.user_name && `${entry.user_name} · `}
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