import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Mail, Phone, FileText, Paperclip,
  MessageSquare, StickyNote, History, Download, Home, ExternalLink,
  RefreshCw, ChevronDown, ChevronUp, Send, Lock, Layers, Shield,
  AlertTriangle, Calendar, Clock, CheckCircle2, MoreHorizontal, Plus, X,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Case {
  id: string; case_number: string; tarion_case_number: string | null;
  tarion_case_number_normalized: string | null; display_name: string | null;
  title: string; status: string; case_type: string; period_type: string | null;
  brp_end_date: string | null; opened_at: string; closed_at: string | null;
  target_date: string | null; interaction_count: number; document_count: number;
  last_activity_at: string; lot_id: string | null; active_conciliation_id: string | null;
  has_conciliation: boolean | null;
}

interface WarrantyItem {
  id: string; item_number: number; location: string | null; floor_level: string | null;
  room: string | null; defect_area: string | null; description: string; status: string;
  chargeable: boolean | null; completed_at: string | null; assessed_at: string | null;
  assessed_by_id: string | null; assessment_notes: string | null;
  homeowner_present: boolean | null; warranty_decision: string | null;
  decision_by_id: string | null; decision_at: string | null; decision_notes: string | null;
  trade_required: string | null;
}

interface ItemEvidence {
  id: string; item_id: string; evidence_type: string; phase: string;
  file_url: string | null; file_name: string | null; storage_path: string | null;
  notes: string | null; captured_at: string; is_locked: boolean;
  is_before: boolean | null; homeowner_present: boolean | null;
}

interface TradeOption { id: string; trade_name: string; trade_type: string | null; }

interface ConciliationSubcase {
  id: string; case_id: string; stage: string; rfc_requested_at: string | null;
  inspection_deadline: string | null; inspection_date: string | null;
  inspection_time_slot: string | null; inspection_confirmed: boolean;
  report_issued_at: string | null; warranted_resolution_deadline: string | null;
  builder_settlement_offer: number | null; builder_offer_submitted_at: string | null;
  tarion_offer_decision: string | null; builder_directory_hit: boolean;
  tarion_claim_amount: number | null; admin_fee_amount: number | null;
  total_billed_to_builder: number | null; outcome: string | null;
}

interface ConciliationItem {
  id: string; item_number: number; room: string | null; description: string;
  tarion_determination: string | null; chargeable: boolean | null;
  rb04_exception: boolean; cpg_section: string | null; status: string;
  resolved_at: string | null; cash_settlement_amount: number | null;
  settlement_accepted_at: string | null; is_new_at_inspection: boolean;
}

interface Interaction {
  id: string; channel: string; direction: string; subject: string | null;
  body: string | null; from_email: string | null; from_name: string | null;
  to_emails: string[] | null; occurred_at: string; created_by_name: string;
  email_log: { provider: string; logged_by_name: string; logged_at: string; has_attachments: boolean; attachment_count: number } | null;
  documents: { id: string; file_name: string; mime_type: string }[];
}

interface CaseDocument {
  id: string; document_type: string; file_name: string; file_size_bytes: number | null;
  mime_type: string | null; storage_path: string; uploaded_by_id: string;
  uploaded_at: string; interaction_id: string | null;
  case_interactions: { subject: string | null; occurred_at: string } | null;
}

interface Note { id: string; body: string; is_internal: boolean; created_by_name: string; created_at: string; }
interface AuditEntry { id: string; action: string; field_name: string | null; old_value: string | null; new_value: string | null; user_name: string | null; source_app: string | null; created_at: string; metadata: Record<string, unknown> | null; }
interface UserProfile { id: string; company_id: string; first_name: string; last_name: string; access_level: string; is_owner: boolean; }
type IconType = LucideIcon;
type ItemFilter = 'ready' | 'nw' | 'all';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  outstanding:   { label: 'Outstanding',   color: '#DC2626', bg: 'rgba(220,38,38,0.10)'   },
  in_progress:   { label: 'In Progress',   color: '#D97706', bg: 'rgba(217,119,6,0.10)'   },
  complete:      { label: 'Complete',      color: '#16A34A', bg: 'rgba(22,163,74,0.10)'   },
  completed:     { label: 'Complete',      color: '#16A34A', bg: 'rgba(22,163,74,0.10)'   },
  not_warranted: { label: 'Not Warranted', color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
  duplicate:     { label: 'Duplicate',     color: '#9CA3AF', bg: 'rgba(156,163,175,0.10)' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  open:        { label: 'Open',        color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',   dot: '#1E5FA4' },
  in_progress: { label: 'In Progress', color: '#D97706', bg: 'rgba(217,119,6,0.10)',   dot: '#D97706' },
  resolved:    { label: 'Resolved',    color: '#16A34A', bg: 'rgba(22,163,74,0.10)',   dot: '#16A34A' },
  closed:      { label: 'Closed',      color: '#6B7280', bg: 'rgba(107,114,128,0.10)', dot: '#6B7280' },
  voided:      { label: 'Voided',      color: '#9CA3AF', bg: 'rgba(156,163,175,0.10)', dot: '#9CA3AF' },
};

const CHANNEL_CONFIG: Record<string, { icon: IconType; label: string; color: string }> = {
  email:      { icon: Mail,          label: 'Email',      color: '#1E5FA4' },
  phone:      { icon: Phone,         label: 'Phone',      color: '#16A34A' },
  note:       { icon: StickyNote,    label: 'Note',       color: '#D97706' },
  site_visit: { icon: Home,          label: 'Site Visit', color: '#7C3AED' },
  sms:        { icon: MessageSquare, label: 'SMS',        color: '#0891B2' },
  portal:     { icon: ExternalLink,  label: 'Portal',     color: '#6B7280' },
};

const TABS = [
  { key: 'items',        label: 'Items',        icon: Layers        },
  { key: 'conciliation', label: 'Conciliation', icon: Shield        },
  { key: 'interactions', label: 'Interactions', icon: MessageSquare },
  { key: 'documents',    label: 'Documents',    icon: FileText      },
  { key: 'notes',        label: 'Notes',        icon: StickyNote    },
  { key: 'audit',        label: 'Audit Trail',  icon: History       },
];

const CONCIL_STAGE_CONFIG = {
  rfc:        { label: 'RFC Filed',            color: '#D97706', bg: 'rgba(217,119,6,0.08)',  border: 'rgba(217,119,6,0.25)'  },
  inspection: { label: 'Inspection Scheduled', color: '#DC2626', bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.25)'  },
  warranted:  { label: 'Report Issued',        color: '#7C3AED', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.25)' },
  claim:      { label: 'Claim Active',         color: '#DC2626', bg: 'rgba(220,38,38,0.12)',  border: 'rgba(220,38,38,0.40)'  },
  cancelled:  { label: 'Cancelled',            color: '#6B7280', bg: 'rgba(107,114,128,0.08)',border: 'rgba(107,114,128,0.25)' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number | null) {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}
function fileIcon(mime: string | null) {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📑';
  return '📄';
}
function normalizeTarion(t: string) { const s = t.trim(); return s.startsWith('0') ? s.slice(1) : s; }
function isDone(status: string) { return ['complete','completed'].includes(status); }
function isNW(status: string) { return ['not_warranted','duplicate'].includes(status); }

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2, padding:'10px 14px', borderRadius:8, background:'var(--color-mist)', border:'1px solid var(--color-border)' }}>
      <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const, color:'var(--color-muted)' }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:700, color: color ?? 'var(--color-text)', fontFamily:'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

// ─── PhotoGrid — multiple uploads per evidence type ───────────────────────────

/** Photos the homeowner submitted through Tarion. They live in a private bucket, so each one is opened with a short-lived link. */
function OwnerPhotos({ photos }: { photos: { id: string; file_name: string | null; storage_path: string | null }[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const p of photos) {
        if (!p.storage_path) continue;
        const { data } = await supabase.storage.from('warranty-photos').createSignedUrl(p.storage_path, 3600);
        if (data?.signedUrl) next[p.id] = data.signedUrl;
      }
      if (alive) setUrls(next);
    })();
    return () => { alive = false; };
  }, [photos.map(p => p.id).join(',')]);
  if (!photos.length) return null;
  return (
    <div style={{ marginBottom:14 }}>
      <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, letterSpacing:'0.1em', color:'var(--color-muted)', marginBottom:8 }}>Homeowner photos ({photos.length})</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(84px, 1fr))', gap:6 }}>
        {photos.map(p => urls[p.id]
          ? <a key={p.id} href={urls[p.id]} target="_blank" rel="noreferrer"><img src={urls[p.id]} alt={p.file_name ?? 'Homeowner photo'} style={{ width:'100%', height:72, objectFit:'cover', borderRadius:6, display:'block' }} /></a>
          : <div key={p.id} style={{ height:72, borderRadius:6, background:'var(--color-mist)' }} />)}
      </div>
    </div>
  );
}

function PhotoGrid({ photos, label, evidenceType, itemId, caseId, companyId, profileId, isUploading, onUpload, onRefresh }: {
  photos: ItemEvidence[]; label: string; evidenceType: string;
  itemId: string; caseId: string; companyId: string; profileId: string;
  isUploading: boolean; onUpload: (itemId: string, file: File, type: string, phase: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const phase = evidenceType.includes('assessment') ? 'assessment' : evidenceType.includes('signature') ? 'completion' : 'repair';
  return (
    <div style={{ padding:10, borderRadius:8, background:'var(--color-panel)', border:'1px solid var(--color-border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.07em', color:'var(--color-muted)' }}>{label}</span>
        <label style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:5, background:'rgba(30,95,164,0.10)', border:'1px solid rgba(30,95,164,0.25)', color:'#1E5FA4', fontSize:9, fontWeight:600, cursor: isUploading ? 'wait' : 'pointer' }}>
          <Plus size={9} /> Add
          <input type="file" accept="image/*,application/pdf" multiple style={{ display:'none' }} disabled={isUploading}
            onChange={async e => {
              const files = Array.from(e.target.files ?? []);
              for (const f of files) await onUpload(itemId, f, evidenceType, phase);
              e.target.value = '';
              onRefresh();
            }} />
        </label>
      </div>
      {photos.length === 0
        ? <p style={{ fontSize:10, color:'var(--color-muted)', fontStyle:'italic' }}>No photos yet</p>
        : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(70px,1fr))', gap:5 }}>
            {photos.map(p => (
              <div key={p.id}>
                {p.file_url && /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file_name ?? '') ? (
                  <a href={p.file_url} target="_blank" rel="noreferrer">
                    <img src={p.file_url} alt={p.file_name ?? ''} style={{ width:'100%', height:58, objectFit:'cover', borderRadius:5, display:'block' }} />
                  </a>
                ) : (
                  <a href={p.file_url ?? '#'} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', justifyContent:'center', height:58, borderRadius:5, background:'var(--color-mist)', border:'1px solid var(--color-border)', fontSize:18, textDecoration:'none' }}>📄</a>
                )}
                <p style={{ fontSize:8, color:'var(--color-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {format(new Date(p.captured_at), 'MMM d h:mm a')}
                </p>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CaseDetailPage() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [caseData,           setCaseData]           = useState<Case | null>(null);
  const [profile,            setProfile]            = useState<UserProfile | null>(null);
  const [items,              setItems]              = useState<WarrantyItem[]>([]);
  const [trades,             setTrades]             = useState<TradeOption[]>([]);
  const [interactions,       setInteractions]       = useState<Interaction[]>([]);
  const [documents,          setDocuments]          = useState<CaseDocument[]>([]);
  const [notes,              setNotes]              = useState<Note[]>([]);
  const [audit,              setAudit]              = useState<AuditEntry[]>([]);
  const [conciliation,       setConciliation]       = useState<ConciliationSubcase | null>(null);
  const [concilItems,        setConcilItems]        = useState<ConciliationItem[]>([]);
  const [evidence,           setEvidence]           = useState<Record<string, ItemEvidence[]>>({});

  const [activeTab,          setActiveTab]          = useState('items');
  const [itemFilter,         setItemFilter]         = useState<ItemFilter>('all');
  const [loading,            setLoading]            = useState(true);
  const [expandedItem,       setExpandedItem]       = useState<string | null>(null);
  const [expandedInteraction,setExpandedInteraction]= useState<string | null>(null);
  const [updatingItem,       setUpdatingItem]       = useState<string | null>(null);
  const [savingTrade,        setSavingTrade]        = useState<string | null>(null);
  const [noteBody,           setNoteBody]           = useState('');
  const [savingNote,         setSavingNote]         = useState(false);
  const [tarionInput,        setTarionInput]        = useState('');
  const [savingTarion,       setSavingTarion]       = useState(false);
  const [offerAmount,        setOfferAmount]        = useState('');
  const [savingOffer,        setSavingOffer]        = useState(false);
  const [creatingWorkCase,   setCreatingWorkCase]   = useState(false);
  const [overrideItemId,     setOverrideItemId]     = useState<string | null>(null);
  const [overrideReason,     setOverrideReason]     = useState('');
  const [itemNotes,          setItemNotes]          = useState<Record<string, string>>({});
  const [uploadingEvidence,  setUploadingEvidence]  = useState<string | null>(null);
  const [lockingAssessment,  setLockingAssessment]  = useState(false);

  // ── Fetchers ─────────────────────────────────────────────────────────────────

  const fetchCase = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase.from('cases').select('*').eq('id', caseId).single();
    if (data) { setCaseData(data as Case); if (data.tarion_case_number) setTarionInput(data.tarion_case_number); }
    setLoading(false);
  }, [caseId]);

  const fetchItems = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase
      .from('warranty_items')
      .select('id,item_number,location,floor_level,room,defect_area,description,status,chargeable,completed_at,assessed_at,assessed_by_id,assessment_notes,homeowner_present,warranty_decision,decision_by_id,decision_at,decision_notes,trade_required')
      .eq('case_id', caseId).is('deleted_at', null).order('item_number');
    if (data) setItems(data as WarrantyItem[]);
  }, [caseId]);

  const fetchTrades = useCallback(async () => {
    const { data } = await supabase.from('trades').select('id,trade_name,trade_type').eq('is_active', true).order('trade_name');
    if (data) setTrades(data as TradeOption[]);
  }, []);

  const fetchEvidence = useCallback(async (itemIds: string[]) => {
    if (!itemIds.length) return;
    const { data } = await supabase
      .from('warranty_item_evidence')
      .select('id,item_id,evidence_type,phase,file_url,file_name,storage_path,notes,captured_at,is_locked,is_before,homeowner_present')
      .in('item_id', itemIds).order('captured_at', { ascending: true });
    if (data) {
      const grouped: Record<string, ItemEvidence[]> = {};
      for (const e of data as ItemEvidence[]) { if (!grouped[e.item_id]) grouped[e.item_id] = []; grouped[e.item_id].push(e); }
      setEvidence(grouped);
    }
  }, []);

  const fetchConciliation = useCallback(async () => {
    if (!caseId) return;
    const { data: sub } = await supabase.from('conciliation_subcases').select('*').eq('case_id', caseId).is('outcome', null).not('stage','eq','cancelled').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (sub) {
      setConciliation(sub as ConciliationSubcase);
      const { data: ci } = await supabase.from('conciliation_items').select('*').eq('subcase_id', sub.id).order('item_number');
      if (ci) setConcilItems(ci as ConciliationItem[]);
    } else { setConciliation(null); setConcilItems([]); }
  }, [caseId]);

  const fetchInteractions = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase.from('case_interactions').select('id,channel,direction,subject,body,from_email,from_name,to_emails,occurred_at,created_by_name,email_log:email_log_id(provider,has_attachments,attachment_count,logged_by_name,logged_at),documents:case_documents(id,file_name,mime_type)').eq('case_id', caseId).is('deleted_at', null).order('occurred_at', { ascending: false });
    if (data) setInteractions(data as unknown as Interaction[]);
  }, [caseId]);

  const fetchDocuments = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase.from('case_documents').select('id,document_type,file_name,file_size_bytes,mime_type,storage_path,uploaded_by_id,uploaded_at,interaction_id,case_interactions:interaction_id(subject,occurred_at)').eq('case_id', caseId).is('deleted_at', null).order('uploaded_at', { ascending: false });
    if (data) setDocuments(data as unknown as CaseDocument[]);
  }, [caseId]);

  const fetchNotes = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase.from('case_notes').select('id,body,is_internal,created_by_name,created_at').eq('case_id', caseId).is('deleted_at', null).order('created_at', { ascending: false });
    if (data) setNotes(data as Note[]);
  }, [caseId]);

  const fetchAudit = useCallback(async () => {
    if (!caseId) return;
    const { data } = await supabase.from('case_audit_log').select('id,action,field_name,old_value,new_value,user_name,source_app,created_at,metadata').eq('case_id', caseId).order('created_at', { ascending: false }).limit(100);
    if (data) setAudit(data as AuditEntry[]);
  }, [caseId]);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('users').select('id,company_id,first_name,last_name,access_level,is_owner').eq('id', user.id).single();
    if (data) setProfile(data as UserProfile);
  }, []);

  const refreshAll = useCallback(() => {
    fetchCase(); fetchItems(); fetchConciliation(); fetchInteractions();
    fetchDocuments(); fetchNotes(); fetchAudit(); fetchProfile(); fetchTrades();
  }, [fetchCase, fetchItems, fetchConciliation, fetchInteractions, fetchDocuments, fetchNotes, fetchAudit, fetchProfile, fetchTrades]);

  useEffect(() => { refreshAll(); }, [refreshAll]);
  useEffect(() => { if (items.length) fetchEvidence(items.map(i => i.id)); else setEvidence({}); }, [items, fetchEvidence]);

  // Auto-switch filter based on case status
  useEffect(() => {
    if (caseData?.status === 'in_progress') setItemFilter('ready');
    else setItemFilter('all');
  }, [caseData?.status]);

  // ── Evidence helpers ──────────────────────────────────────────────────────────

  function getPhotos(itemId: string, type: string) { return (evidence[itemId] ?? []).filter(e => e.evidence_type === type); }
  function evidenceScore(itemId: string) {
    let s = 0;
    if (getPhotos(itemId, 'assessment_photo').length)       s += 34;
    if (getPhotos(itemId, 'completion_photo_after').length) s += 33;
    if (getPhotos(itemId, 'homeowner_signature').length)    s += 33;
    return s;
  }

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function handleUploadEvidence(itemId: string, file: File, evidenceType: string, phase: string) {
    if (!caseData || !profile) return;
    setUploadingEvidence(itemId);
    try {
      const ext = file.name.split('.').pop();
      const path = `evidence/${caseData.id}/${itemId}/${evidenceType}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('case-documents').upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('case-documents').getPublicUrl(path);
      await supabase.from('warranty_item_evidence').insert({ company_id: profile.company_id, item_id: itemId, case_id: caseData.id, evidence_type: evidenceType, phase, file_url: urlData.publicUrl, file_name: file.name, storage_path: path, is_before: evidenceType === 'completion_photo_before', captured_by_id: profile.id });
      await fetchEvidence(items.map(i => i.id));
    } catch (e) { console.error('Upload error:', e); }
    setUploadingEvidence(null);
  }

  async function handleAssignTrade(itemId: string, tradeName: string) {
    setSavingTrade(itemId);
    await supabase.from('warranty_items').update({ trade_required: tradeName || null }).eq('id', itemId);
    await fetchItems();
    setSavingTrade(null);
  }

  async function handleItemDecision(itemId: string, decision: 'repair' | 'not_warranted') {
    setUpdatingItem(itemId);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('warranty_items').update({
      status: decision === 'not_warranted' ? 'not_warranted' : 'outstanding',
      warranty_decision: decision === 'not_warranted' ? 'not_warranty' : 'warranty_approved',
      decision_by_id: user?.id,
      decision_at: new Date().toISOString(),
    }).eq('id', itemId);
    await fetchItems();
    setUpdatingItem(null);
  }

  async function handleSaveSOW(itemId: string, value: string) {
    await supabase.from('warranty_items').update({ assessment_notes: value.trim() || null }).eq('id', itemId);
    await fetchItems();
  }

  async function handleItemStatus(itemId: string, newStatus: string) {
    setUpdatingItem(itemId);
    await supabase.from('warranty_items').update({ status: newStatus, completed_at: isDone(newStatus) ? new Date().toISOString() : null }).eq('id', itemId);
    await fetchItems();
    setUpdatingItem(null);
  }

  async function handleAssessmentComplete() {
    if (!caseId || !profile) return;
    setLockingAssessment(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('cases').update({ status: 'in_progress' }).eq('id', caseId);
    await supabase.from('case_audit_log').insert({ company_id: profile.company_id, case_id: caseId, action: 'assessment_completed', user_id: user?.id, user_name: `${profile.first_name} ${profile.last_name}`, source_app: 'web', metadata: { items_for_repair: items.filter(i => i.status === 'outstanding' && i.trade_required).length, items_not_warranted: items.filter(i => isNW(i.status)).length } });
    await fetchCase(); await fetchAudit();
    setLockingAssessment(false);
  }

  async function handleSaveItemNote(itemId: string) {
    const note = itemNotes[itemId];
    if (!note?.trim() || !caseData || !profile) return;
    await supabase.from('warranty_item_evidence').insert({ company_id: profile.company_id, item_id: itemId, case_id: caseData.id, evidence_type: 'access_log', phase: 'repair', notes: note.trim(), captured_by_id: profile.id });
    setItemNotes(prev => ({ ...prev, [itemId]: '' }));
    await fetchEvidence(items.map(i => i.id));
  }

  async function handleCompleteWithOverride(itemId: string) {
    if (!overrideReason.trim() || !profile || !caseId) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('warranty_items').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', itemId);
    await supabase.from('case_audit_log').insert({ company_id: profile.company_id, case_id: caseId, action: 'item_completed_override', user_id: user?.id, user_name: `${profile.first_name} ${profile.last_name}`, source_app: 'web', metadata: { item_id: itemId, override_reason: overrideReason } });
    setOverrideItemId(null); setOverrideReason('');
    await fetchItems();
  }

  async function handleSaveTarionCase() {
    if (!tarionInput.trim() || !caseId) return;
    setSavingTarion(true);
    await supabase.from('cases').update({ tarion_case_number: tarionInput.trim(), tarion_case_number_normalized: normalizeTarion(tarionInput) }).eq('id', caseId);
    await fetchCase();
    setSavingTarion(false);
  }

  async function handleSaveOffer() {
    if (!offerAmount || !conciliation) return;
    setSavingOffer(true);
    await supabase.from('conciliation_subcases').update({ builder_settlement_offer: parseFloat(offerAmount), builder_offer_submitted_at: new Date().toISOString() }).eq('id', conciliation.id);
    await fetchConciliation(); setOfferAmount('');
    setSavingOffer(false);
  }

  async function handleAddNote() {
    if (!noteBody.trim() || !caseId || savingNote) return;
    setSavingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingNote(false); return; }
    const { data: p } = await supabase.from('users').select('company_id,first_name,last_name').eq('id', user.id).single();
    if (!p) { setSavingNote(false); return; }
    await supabase.from('case_notes').insert({ company_id: p.company_id, case_id: caseId, body: noteBody.trim(), is_internal: true, created_by_id: user.id, created_by_name: `${p.first_name} ${p.last_name}` });
    setNoteBody(''); await fetchNotes(); await fetchAudit();
    setSavingNote(false);
  }

  async function handleDownload(doc: CaseDocument) {
    const { data } = await supabase.storage.from('case-documents').createSignedUrl(doc.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function handleCreateWorkCase() {
    if (!caseData?.tarion_case_number_normalized || !conciliation) return;
    setCreatingWorkCase(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreatingWorkCase(false); return; }
    const { data: p } = await supabase.from('users').select('company_id,first_name,last_name').eq('id', user.id).single();
    if (!p) { setCreatingWorkCase(false); return; }
    const workNum = `${caseData.tarion_case_number_normalized}-C`;
    const warranted = concilItems.filter(i => i.tarion_determination === 'warranted');
    const { data: existing } = await supabase.from('cases').select('id').eq('company_id', p.company_id).eq('tarion_case_number_normalized', workNum).maybeSingle();
    if (existing) { navigate(`/warranty/cases/${existing.id}`); setCreatingWorkCase(false); return; }
    const { data: newCase } = await supabase.from('cases').insert({ company_id: p.company_id, case_number: workNum, tarion_case_number: workNum, tarion_case_number_normalized: workNum, title: `Conciliation Work — ${caseData.display_name ?? caseData.title}`, case_type: 'conciliation', period_type: 'conciliation', status: 'open', lot_id: caseData.lot_id, opened_at: conciliation.report_issued_at ?? new Date().toISOString(), brp_end_date: conciliation.warranted_resolution_deadline, created_by_id: user.id }).select('id').single();
    if (newCase && warranted.length) await supabase.from('warranty_items').insert(warranted.map((item, idx) => ({ company_id: p.company_id, case_id: newCase.id, item_number: idx+1, room: item.room, description: item.description, status: 'outstanding', chargeable: item.chargeable })));
    if (newCase) navigate(`/warranty/cases/${newCase.id}`);
    setCreatingWorkCase(false);
  }

  function auditLabel(e: AuditEntry) {
    const map: Record<string,string> = { email_logged:'📧 Email logged', status_changed:'🔄 Status changed', note_added:'📝 Note added', doc_uploaded:'📎 Document uploaded', case_created:'✅ Case created', assessment_completed:'✅ Assessment completed', conciliation_opened:'⚖️ Conciliation RFC recorded', conciliation_work_case_created:'🔨 Work case created', item_completed_override:'⚠️ Override completion' };
    return map[e.action] ?? e.action.replace(/_/g,' ');
  }

  // ── Guards ────────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--color-muted)', fontSize:13 }}>Loading case…</div>;
  if (!caseData) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--color-muted)', fontSize:13 }}>Case not found.</div>;

  // ── Derived ───────────────────────────────────────────────────────────────────

  const status          = STATUS_CONFIG[caseData.status] ?? STATUS_CONFIG.open;
  const completedCount  = items.filter(i => isDone(i.status)).length;
  const outstandingCount= items.filter(i => i.status === 'outstanding').length;
  const nwCount         = items.filter(i => isNW(i.status)).length;
  const readyCount      = items.filter(i => i.status === 'outstanding' && i.trade_required).length;
  const needsTradeCount = items.filter(i => i.status === 'outstanding' && !i.trade_required).length;
  const isConcilCase    = caseData.case_type === 'conciliation';
  const concilStage     = conciliation ? CONCIL_STAGE_CONFIG[conciliation.stage as keyof typeof CONCIL_STAGE_CONFIG] ?? CONCIL_STAGE_CONFIG.rfc : null;
  const inspDeadlineDays= conciliation?.inspection_deadline ? differenceInDays(new Date(conciliation.inspection_deadline), new Date()) : null;
  const warrantedDeadline= conciliation?.warranted_resolution_deadline ? differenceInDays(new Date(conciliation.warranted_resolution_deadline), new Date()) : null;
  const warrantedItems  = concilItems.filter(i => i.tarion_determination === 'warranted');
  const notWarrantedItems= concilItems.filter(i => i.tarion_determination === 'not_warranted');
  const workCaseNumber  = caseData.tarion_case_number_normalized ? `${caseData.tarion_case_number_normalized}-C` : null;
  const isManager       = ['manager','sr_manager','director','vp','owner','company'].includes(profile?.access_level ?? '');
  const assessmentDone  = caseData.status === 'in_progress';
  const readyToSchedule = assessmentDone && readyCount > 0;

  // Filtered items for display
  const filteredItems = items.filter(i => {
    if (itemFilter === 'ready') return i.status === 'outstanding' && i.trade_required;
    if (itemFilter === 'nw')    return isNW(i.status);
    return true;
  });

  const FILTERS: { key: ItemFilter; label: string; count: number; color: string }[] = [
    { key: 'ready', label: 'Ready to book', count: readyCount,    color: '#16A34A' },
    { key: 'nw',    label: 'Not warranted', count: nwCount,       color: '#6B7280' },
    { key: 'all',   label: 'All items',     count: items.length,  color: '#1E5FA4' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', background:'var(--color-bg)' }}>

      {/* ── Header ── */}
      <div style={{ padding:'14px 24px', borderBottom:'1px solid var(--color-border)', background:'var(--color-panel)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={() => navigate(-1)} style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', color:'var(--color-muted)', fontSize:12, padding:0, fontFamily:'var(--font-body)' }}>
          <ArrowLeft size={13} /> Back
        </button>
        <ChevronRight size={12} color="var(--color-muted)" />
        <span style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--color-muted)' }}>
          {caseData.tarion_case_number_normalized ? `#${caseData.tarion_case_number_normalized}` : `#${caseData.case_number}`}
        </span>
        {isConcilCase && <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:100, background:'rgba(220,38,38,0.12)', color:'#DC2626', border:'1px solid rgba(220,38,38,0.3)', textTransform:'uppercase' as const, letterSpacing:'0.08em' }}>Conciliation</span>}
        <span style={{ flex:1, fontSize:13, fontWeight:600, color:'var(--color-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{caseData.display_name ?? caseData.title}</span>
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:100, background:status.bg, border:`1px solid ${status.color}30` }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:status.dot }} />
          <span style={{ fontSize:11, fontWeight:700, color:status.color }}>{status.label}</span>
        </div>
        <button style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 10px', borderRadius:7, background:'var(--color-mist)', border:'1px solid var(--color-border)', cursor:'pointer', color:'var(--color-muted)', fontSize:11, fontFamily:'var(--font-body)' }}>
          <MoreHorizontal size={13} />
        </button>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{ width:260, flexShrink:0, borderRight:'1px solid var(--color-border)', overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:18 }}>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <StatPill label="Outstanding" value={outstandingCount} color="#DC2626" />
            <StatPill label="Complete"    value={completedCount}   color="#16A34A" />
          </div>
          {nwCount > 0 && <StatPill label="Not Warranted" value={nwCount} color="#6B7280" />}

          {items.length > 0 && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:10, color:'var(--color-muted)' }}>Progress</span>
                <span style={{ fontSize:10, fontWeight:700, color:'var(--color-text)', fontFamily:'var(--font-mono)' }}>{completedCount}/{items.length}</span>
              </div>
              <div style={{ height:6, borderRadius:100, background:'var(--color-mist)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${items.length ? Math.round((completedCount/items.length)*100) : 0}%`, borderRadius:100, background: completedCount === items.length ? '#16A34A' : '#1E5FA4', transition:'width 0.3s ease' }} />
              </div>
            </div>
          )}

          {/* Assessment complete / Schedule */}
          {caseData.status === 'open' && items.length > 0 && (
            <div style={{ padding:'12px 14px', borderRadius:8, background: needsTradeCount > 0 ? 'rgba(217,119,6,0.06)' : 'rgba(22,163,74,0.06)', border:`1px solid ${needsTradeCount > 0 ? 'rgba(217,119,6,0.25)' : 'rgba(22,163,74,0.25)'}` }}>
              {needsTradeCount > 0 ? (
                <>
                  <p style={{ fontSize:10, fontWeight:700, color:'#D97706', marginBottom:4 }}>Assessment in progress</p>
                  <p style={{ fontSize:10, color:'var(--color-muted)' }}>{needsTradeCount} item{needsTradeCount !== 1 ? 's' : ''} still need a trade assigned</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize:10, fontWeight:700, color:'#16A34A', marginBottom:6 }}>All items assessed</p>
                  <button onClick={handleAssessmentComplete} disabled={lockingAssessment}
                    style={{ width:'100%', padding:'8px 0', borderRadius:7, background:'#16A34A', border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor: lockingAssessment ? 'default' : 'pointer', fontFamily:'var(--font-body)', opacity: lockingAssessment ? 0.7 : 1 }}>
                    {lockingAssessment ? 'Submitting…' : 'Assessment Complete →'}
                  </button>
                </>
              )}
            </div>
          )}

          {readyToSchedule && (
            <div style={{ padding:'12px 14px', borderRadius:8, background:'rgba(30,95,164,0.06)', border:'1px solid rgba(30,95,164,0.25)' }}>
              <p style={{ fontSize:10, fontWeight:700, color:'#1E5FA4', marginBottom:4 }}>Ready to schedule</p>
              <p style={{ fontSize:10, color:'var(--color-muted)', marginBottom:8 }}>
                {readyCount} item{readyCount !== 1 ? 's' : ''} · {[...new Set(items.filter(i=>i.trade_required).map(i=>i.trade_required))].length} trade{[...new Set(items.filter(i=>i.trade_required).map(i=>i.trade_required))].length !== 1 ? 's' : ''}
              </p>
              <button style={{ width:'100%', padding:'8px 0', borderRadius:7, background:'#1E5FA4', border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                Schedule all items →
              </button>
            </div>
          )}

          {/* Tarion # */}
          <div>
            <p style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const, color:'var(--color-muted)', marginBottom:8 }}>Tarion Case #</p>
            {caseData.tarion_case_number_normalized ? (
              <p style={{ fontSize:14, fontWeight:800, color:'var(--color-text)', fontFamily:'var(--font-mono)' }}>{caseData.tarion_case_number_normalized}</p>
            ) : (
              <div style={{ display:'flex', gap:6 }}>
                <input value={tarionInput} onChange={e => setTarionInput(e.target.value)} placeholder="e.g. 9874453"
                  style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid var(--color-border)', background:'var(--color-mist)', fontSize:11, fontFamily:'var(--font-mono)', color:'var(--color-text)', outline:'none' }} />
                <button onClick={handleSaveTarionCase} disabled={!tarionInput.trim() || savingTarion}
                  style={{ padding:'6px 10px', borderRadius:6, background:'#1E5FA4', border:'none', color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  {savingTarion ? '…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {/* Conciliation badge */}
          {conciliation && concilStage && (
            <div style={{ padding:'10px 12px', borderRadius:8, background:concilStage.bg, border:`1px solid ${concilStage.border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <Shield size={11} color={concilStage.color} />
                <span style={{ fontSize:10, fontWeight:700, color:concilStage.color }}>{concilStage.label}</span>
              </div>
              {conciliation.stage === 'rfc' && inspDeadlineDays !== null && (
                <p style={{ fontSize:10, color: inspDeadlineDays <= 3 ? '#DC2626' : concilStage.color, fontWeight:600 }}>
                  {inspDeadlineDays <= 0 ? 'Deadline passed' : `${inspDeadlineDays}d to inspection`}
                </p>
              )}
              {conciliation.stage === 'warranted' && warrantedDeadline !== null && (
                <p style={{ fontSize:10, color: warrantedDeadline <= 7 ? '#DC2626' : '#7C3AED', fontWeight:600 }}>
                  {warrantedDeadline <= 0 ? '⚠ Deadline passed' : `${warrantedDeadline}d to resolve`}
                </p>
              )}
              <button onClick={() => setActiveTab('conciliation')} style={{ marginTop:6, fontSize:10, color:concilStage.color, background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-body)', padding:0, fontWeight:600 }}>View Conciliation →</button>
            </div>
          )}

          {/* Dates */}
          <div>
            <p style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' as const, color:'var(--color-muted)', marginBottom:8 }}>Dates</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:11, color:'var(--color-muted)' }}>Opened</span>
                <span style={{ fontSize:11, color:'var(--color-text)', fontFamily:'var(--font-mono)' }}>{format(new Date(caseData.opened_at), 'MMM d, yyyy')}</span>
              </div>
              {caseData.brp_end_date && (
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontSize:11, color:'var(--color-muted)' }}>BRP Ends</span>
                  <span style={{ fontSize:11, color:'#DC2626', fontFamily:'var(--font-mono)', fontWeight:700 }}>{format(new Date(caseData.brp_end_date), 'MMM d, yyyy')}</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:11, color:'var(--color-muted)' }}>Last activity</span>
                <span style={{ fontSize:11, color:'var(--color-muted)' }}>{formatDistanceToNow(new Date(caseData.last_activity_at), { addSuffix:true })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Tab bar */}
          <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid var(--color-border)', padding:'0 24px', flexShrink:0, background:'var(--color-panel)' }}>
            {TABS.map(tab => {
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
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ display:'flex', alignItems:'center', gap:6, padding:'12px 14px', border:'none', background:'none', cursor:'pointer', fontFamily:'var(--font-body)', fontSize:12, fontWeight: active ? 700 : 500, color: active ? (isCT ? '#DC2626' : 'var(--color-text)') : 'var(--color-muted)', borderBottom: active ? `2px solid ${isCT ? '#DC2626' : '#1E5FA4'}` : '2px solid transparent', marginBottom:-1, transition:'all 0.15s' }}>
                  <Icon size={13} strokeWidth={1.8} />
                  {tab.label}
                  {count !== null && count > 0 && (
                    <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:100, background: active ? (isCT ? 'rgba(220,38,38,0.15)' : 'rgba(30,95,164,0.15)') : 'var(--color-mist)', color: active ? (isCT ? '#DC2626' : '#1E5FA4') : 'var(--color-muted)' }}>{count}</span>
                  )}
                </button>
              );
            })}
            <div style={{ flex:1 }} />
            <button onClick={refreshAll} style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 10px', borderRadius:7, background:'none', border:'1px solid var(--color-border)', cursor:'pointer', color:'var(--color-muted)', fontSize:11, fontFamily:'var(--font-body)' }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>

          {/* Tab content */}
          <div style={{ flex:1, overflowY:'auto', padding:'0 24px 24px' }}>

            {/* ── ITEMS ── */}
            {activeTab === 'items' && (
              <div style={{ paddingTop:16 }}>

                {/* Filter tabs */}
                {items.length > 0 && (
                  <div style={{ display:'flex', gap:6, marginBottom:16 }}>
                    {FILTERS.map(f => (
                      <button key={f.key} onClick={() => setItemFilter(f.key)}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:`1px solid ${itemFilter === f.key ? f.color + '50' : 'var(--color-border)'}`, background: itemFilter === f.key ? f.color + '12' : 'var(--color-panel)', cursor:'pointer', fontFamily:'var(--font-body)', transition:'all 0.15s' }}>
                        <span style={{ fontSize:12, fontWeight: itemFilter === f.key ? 700 : 500, color: itemFilter === f.key ? f.color : 'var(--color-muted)' }}>{f.label}</span>
                        <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:100, background: itemFilter === f.key ? f.color + '20' : 'var(--color-mist)', color: itemFilter === f.key ? f.color : 'var(--color-muted)' }}>{f.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {filteredItems.length === 0 ? (
                  <div style={{ padding:'40px 0', textAlign:'center' }}>
                    <Layers size={28} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom:10 }} />
                    <p style={{ fontSize:13, fontWeight:600, color:'var(--color-text)', marginBottom:4 }}>
                      {itemFilter === 'ready' ? 'No items ready to book yet' : itemFilter === 'nw' ? 'No items marked not warranted' : 'No items yet'}
                    </p>
                    <p style={{ fontSize:12, color:'var(--color-muted)' }}>
                      {itemFilter === 'ready' ? 'Assign a trade to outstanding items to make them ready to book.' : itemFilter === 'nw' ? 'Items marked not warranted during assessment will appear here.' : 'Import a Tarion warranty form to populate items.'}
                    </p>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {filteredItems.map((item, idx) => {
                      const st           = ITEM_STATUS[item.status] ?? ITEM_STATUS.outstanding;
                      const isItemDone   = isDone(item.status);
                      const isItemNW     = isNW(item.status);
                      const isExpanded   = expandedItem === item.id;
                      const isUpdating   = updatingItem === item.id;
                      const isUploading  = uploadingEvidence === item.id;
                      const ownerPhotos  = getPhotos(item.id, 'owner_photo');
                      const assessPhotos = getPhotos(item.id, 'assessment_photo');
                      const afterPhotos  = getPhotos(item.id, 'completion_photo_after');
                      const sigPhotos    = getPhotos(item.id, 'homeowner_signature');
                      const docPhotos    = getPhotos(item.id, 'engineering_doc').concat(getPhotos(item.id, 'other'));
                      const accessLogs   = (evidence[item.id] ?? []).filter(e => e.evidence_type === 'access_log');
                      const score        = evidenceScore(item.id);
                      const scoreColor   = score >= 75 ? '#16A34A' : score >= 50 ? '#D97706' : '#DC2626';
                      const canComplete  = afterPhotos.length > 0;

                      return (
                        <div key={item.id} style={{ borderRadius:10, overflow:'hidden', background: isItemDone ? 'rgba(22,163,74,0.02)' : isItemNW ? 'rgba(107,114,128,0.02)' : 'var(--color-panel)', border:`1px solid ${isItemDone ? 'rgba(22,163,74,0.25)' : isExpanded ? 'rgba(30,95,164,0.3)' : 'var(--color-border)'}`, opacity: isUpdating ? 0.6 : 1, transition:'all 0.15s' }}>

                          {/* Item header */}
                          <div onClick={() => setExpandedItem(isExpanded ? null : item.id)} style={{ padding:'13px 16px', cursor:'pointer', display:'flex', alignItems:'flex-start', gap:12 }}>
                            <span style={{ fontSize:11, fontWeight:800, color:'var(--color-muted)', fontFamily:'var(--font-mono)', flexShrink:0, marginTop:3, minWidth:24 }}>
                              {String(idx + 1).padStart(2,'0')}
                            </span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                                {item.room && <span style={{ fontSize:11, fontWeight:600, color:'var(--color-text)' }}>{item.room}</span>}
                                {item.floor_level && <span style={{ fontSize:10, color:'var(--color-muted)' }}>{item.floor_level}</span>}
                                {item.trade_required && (
                                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4, background:'rgba(30,95,164,0.10)', border:'1px solid rgba(30,95,164,0.2)', color:'#1E5FA4' }}>{item.trade_required}</span>
                                )}
                                <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:100, background:st.bg, color:st.color, marginLeft:'auto', flexShrink:0 }}>{st.label}</span>
                              </div>
                              <p style={{ fontSize:12, lineHeight:1.5, color: isItemDone || isItemNW ? 'var(--color-muted)' : 'var(--color-text)', textDecoration: isItemDone ? 'line-through' : 'none' }}>
                                {item.description}
                              </p>
                              {item.assessment_notes && (
                                <p style={{ fontSize:10, color:'#D97706', marginTop:3, fontStyle:'italic' }}>SOW: {item.assessment_notes}</p>
                              )}
                            </div>
                            <div style={{ flexShrink:0, textAlign:'right' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4, justifyContent:'flex-end' }}>
                                <div style={{ width:48, height:3, borderRadius:100, background:'var(--color-mist)', overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${score}%`, background:scoreColor, borderRadius:100 }} />
                                </div>
                                <span style={{ fontSize:9, fontWeight:700, color:scoreColor }}>{score}%</span>
                              </div>
                              <span style={{ fontSize:9, color:'var(--color-muted)' }}>evidence</span>
                            </div>
                            {isExpanded ? <ChevronUp size={13} color="var(--color-muted)" style={{ flexShrink:0, marginTop:4 }} /> : <ChevronDown size={13} color="var(--color-muted)" style={{ flexShrink:0, marginTop:4 }} />}
                          </div>

                          {/* Expanded panel */}
                          {isExpanded && (
                            <div style={{ borderTop:'1px solid var(--color-border)', background:'var(--color-mist)', padding:16 }}>

                              {/* Trade assignment */}
                              <div style={{ marginBottom:14 }}>
                                <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.07em', color:'var(--color-muted)', marginBottom:6 }}>Assign trade</p>
                                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                                  <select value={item.trade_required ?? ''} onChange={e => handleAssignTrade(item.id, e.target.value)} disabled={savingTrade === item.id}
                                    style={{ flex:1, padding:'8px 10px', borderRadius:7, border:'1px solid var(--color-border)', background:'var(--color-panel)', fontSize:12, color:'var(--color-text)', fontFamily:'var(--font-body)', outline:'none', cursor:'pointer' }}>
                                    <option value="">— Select trade —</option>
                                    {trades.map(t => <option key={t.id} value={t.trade_name}>{t.trade_name}{t.trade_type ? ` (${t.trade_type})` : ''}</option>)}
                                  </select>
                                  {savingTrade === item.id && <RefreshCw size={13} color="var(--color-muted)" style={{ animation:'spin 1s linear infinite', flexShrink:0 }} />}
                                </div>
                              </div>

                              {/* Repair / NW decision */}
                              {!isItemDone && !isItemNW && (
                                <div style={{ marginBottom:14, display:'flex', gap:8 }}>
                                  <button onClick={() => handleItemDecision(item.id, 'repair')}
                                    style={{ flex:1, padding:'8px 0', borderRadius:7, background: item.warranty_decision === 'warranty_approved' ? '#16A34A' : 'rgba(22,163,74,0.10)', border:`1px solid ${item.warranty_decision === 'warranty_approved' ? '#16A34A' : 'rgba(22,163,74,0.3)'}`, color: item.warranty_decision === 'warranty_approved' ? '#fff' : '#16A34A', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                                    {item.warranty_decision === 'warranty_approved' ? '✓ Repair approved' : 'Approve repair'}
                                  </button>
                                  <button onClick={() => handleItemDecision(item.id, 'not_warranted')}
                                    style={{ flex:1, padding:'8px 0', borderRadius:7, background:'rgba(107,114,128,0.10)', border:'1px solid rgba(107,114,128,0.25)', color:'#6B7280', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                                    Not warranted
                                  </button>
                                </div>
                              )}

                              <OwnerPhotos photos={ownerPhotos} />

                              {/* Phase 1 */}
                              <div style={{ marginBottom:16 }}>
                                <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, letterSpacing:'0.1em', color:'var(--color-muted)', marginBottom:10 }}>Phase 1 — Assessment</p>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                  <PhotoGrid photos={assessPhotos} label="Assessment photos" evidenceType="assessment_photo" itemId={item.id} caseId={caseData.id} companyId={profile?.company_id ?? ''} profileId={profile?.id ?? ''} isUploading={isUploading} onUpload={handleUploadEvidence} onRefresh={() => fetchEvidence(items.map(i=>i.id))} />
                                  <div style={{ padding:10, borderRadius:8, background:'var(--color-panel)', border:'1px solid var(--color-border)' }}>
                                    <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.07em', color:'var(--color-muted)', marginBottom:6 }}>Scope of work</p>
                                    <textarea
                                      defaultValue={item.assessment_notes ?? ''}
                                      onBlur={async e => {
                                        const val = e.target.value.trim();
                                        if (val !== (item.assessment_notes ?? '').trim()) await handleSaveSOW(item.id, val);
                                      }}
                                      placeholder="Describe scope of work…"
                                      rows={4}
                                      style={{ width:'100%', padding:'4px 0', background:'none', border:'none', resize:'none', fontFamily:'var(--font-body)', fontSize:11, color:'var(--color-text)', lineHeight:1.5, outline:'none', boxSizing:'border-box' as const }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Phase 2 */}
                              <div style={{ marginBottom:16 }}>
                                <p style={{ fontSize:9, fontWeight:800, textTransform:'uppercase' as const, letterSpacing:'0.1em', color:'var(--color-muted)', marginBottom:10 }}>Phase 2 — Repair</p>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                                  <PhotoGrid photos={afterPhotos} label="After repair photos" evidenceType="completion_photo_after" itemId={item.id} caseId={caseData.id} companyId={profile?.company_id ?? ''} profileId={profile?.id ?? ''} isUploading={isUploading} onUpload={handleUploadEvidence} onRefresh={() => fetchEvidence(items.map(i=>i.id))} />
                                  <PhotoGrid photos={sigPhotos} label="Homeowner signatures" evidenceType="homeowner_signature" itemId={item.id} caseId={caseData.id} companyId={profile?.company_id ?? ''} profileId={profile?.id ?? ''} isUploading={isUploading} onUpload={handleUploadEvidence} onRefresh={() => fetchEvidence(items.map(i=>i.id))} />
                                </div>
                                <div style={{ marginBottom:8 }}>
                                  <PhotoGrid photos={docPhotos} label="Supporting documents" evidenceType="engineering_doc" itemId={item.id} caseId={caseData.id} companyId={profile?.company_id ?? ''} profileId={profile?.id ?? ''} isUploading={isUploading} onUpload={handleUploadEvidence} onRefresh={() => fetchEvidence(items.map(i=>i.id))} />
                                </div>

                                {/* Access logs */}
                                {accessLogs.map(n => (
                                  <div key={n.id} style={{ padding:'6px 10px', borderRadius:6, background:'rgba(217,119,6,0.06)', border:'1px solid rgba(217,119,6,0.15)', marginBottom:6 }}>
                                    <p style={{ fontSize:11, color:'var(--color-text)', lineHeight:1.5 }}>{n.notes}</p>
                                    <p style={{ fontSize:9, color:'var(--color-muted)', marginTop:2 }}>{format(new Date(n.captured_at), 'MMM d, h:mm a')}</p>
                                  </div>
                                ))}

                                <div style={{ display:'flex', gap:6 }}>
                                  <input value={itemNotes[item.id] ?? ''} onChange={e => setItemNotes(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="Add tech note or access log entry…"
                                    style={{ flex:1, padding:'7px 10px', borderRadius:6, border:'1px solid var(--color-border)', background:'var(--color-panel)', fontSize:11, color:'var(--color-text)', fontFamily:'var(--font-body)', outline:'none' }} />
                                  <button onClick={() => handleSaveItemNote(item.id)} disabled={!itemNotes[item.id]?.trim()}
                                    style={{ padding:'7px 14px', borderRadius:6, background: itemNotes[item.id]?.trim() ? '#1E5FA4' : 'var(--color-mist)', border:'none', color: itemNotes[item.id]?.trim() ? '#fff' : 'var(--color-muted)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                                    Save
                                  </button>
                                </div>
                              </div>

                              {/* Completion actions */}
                              <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:12, borderTop:'1px solid var(--color-border)' }}>
                                {!isItemDone && !isItemNW && (
                                  <>
                                    <button onClick={() => canComplete && handleItemStatus(item.id, 'complete')} disabled={isUpdating || !canComplete}
                                      title={!canComplete ? 'After repair photo required' : ''}
                                      style={{ padding:'7px 16px', borderRadius:7, fontSize:11, fontWeight:700, background: canComplete ? '#16A34A' : 'var(--color-mist)', border:`1px solid ${canComplete ? '#16A34A' : 'var(--color-border)'}`, color: canComplete ? '#fff' : 'var(--color-muted)', cursor: canComplete ? 'pointer' : 'not-allowed', fontFamily:'var(--font-body)' }}>
                                      {canComplete ? '✓ Mark complete' : 'Photo required'}
                                    </button>
                                    {!canComplete && isManager && overrideItemId !== item.id && (
                                      <button onClick={() => setOverrideItemId(item.id)}
                                        style={{ padding:'7px 14px', borderRadius:7, fontSize:11, fontWeight:600, background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)', color:'#DC2626', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                                        Manager override
                                      </button>
                                    )}
                                    {overrideItemId === item.id && (
                                      <div style={{ flex:1, display:'flex', gap:6, alignItems:'center' }}>
                                        <input value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Reason for override (required)…"
                                          style={{ flex:1, padding:'7px 10px', borderRadius:6, border:'1px solid rgba(220,38,38,0.3)', background:'rgba(220,38,38,0.04)', fontSize:11, color:'var(--color-text)', fontFamily:'var(--font-body)', outline:'none' }} />
                                        <button onClick={() => handleCompleteWithOverride(item.id)} disabled={!overrideReason.trim()}
                                          style={{ padding:'7px 14px', borderRadius:6, background: overrideReason.trim() ? '#DC2626' : 'var(--color-mist)', border:'none', color: overrideReason.trim() ? '#fff' : 'var(--color-muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                                          Confirm
                                        </button>
                                        <button onClick={() => { setOverrideItemId(null); setOverrideReason(''); }}
                                          style={{ padding:'7px 10px', borderRadius:6, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', fontSize:11, cursor:'pointer', fontFamily:'var(--font-body)' }}>
                                          <X size={12} />
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                                {isItemDone && (
                                  <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                                    <p style={{ fontSize:11, color:'#16A34A', fontWeight:600 }}>✓ Completed {item.completed_at ? format(new Date(item.completed_at), 'MMM d, yyyy') : ''}</p>
                                    <button onClick={() => handleItemStatus(item.id, 'outstanding')} disabled={isUpdating}
                                      style={{ marginLeft:'auto', padding:'5px 12px', borderRadius:6, fontSize:10, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                                      Reopen
                                    </button>
                                  </div>
                                )}
                                {isItemNW && (
                                  <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                                    <p style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>Not warranted — closed</p>
                                    <button onClick={() => handleItemStatus(item.id, 'outstanding')} disabled={isUpdating}
                                      style={{ marginLeft:'auto', padding:'5px 12px', borderRadius:6, fontSize:10, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>
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

            {/* ── CONCILIATION ── */}
            {activeTab === 'conciliation' && (
              <div style={{ paddingTop:16 }}>
                {!conciliation ? (
                  <div style={{ padding:'60px 0', textAlign:'center' }}>
                    <Shield size={36} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom:12 }} />
                    <p style={{ fontSize:13, fontWeight:600, color:'var(--color-text)', marginBottom:6 }}>No active conciliation</p>
                    <p style={{ fontSize:12, color:'var(--color-muted)', marginBottom:20 }}>Record when the homeowner files an RFC with Tarion.</p>
                    <button onClick={async () => {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;
                      const { data: p } = await supabase.from('users').select('company_id').eq('id', user.id).single();
                      if (!p) return;
                      const { error } = await supabase.rpc('open_conciliation', { p_company_id: p.company_id, p_case_id: caseId, p_user_id: user.id, p_rfc_requested_at: new Date().toISOString(), p_rfc_received_at: new Date().toISOString() });
                      if (!error) { await fetchConciliation(); await fetchCase(); await fetchAudit(); }
                    }} style={{ padding:'10px 24px', borderRadius:8, background:'#DC2626', color:'#fff', border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'var(--font-body)' }}>
                      ⚖️ Record RFC Filed
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    {concilStage && (
                      <div style={{ padding:'14px 18px', borderRadius:10, background:concilStage.bg, border:`1px solid ${concilStage.border}`, display:'flex', alignItems:'center', gap:12 }}>
                        <Shield size={18} color={concilStage.color} strokeWidth={1.5} />
                        <div>
                          <p style={{ fontSize:13, fontWeight:800, color:concilStage.color }}>{concilStage.label}</p>
                          <p style={{ fontSize:11, color:concilStage.color, opacity:0.8 }}>RFC filed {conciliation.rfc_requested_at ? format(new Date(conciliation.rfc_requested_at), 'MMM d, yyyy') : '—'}</p>
                        </div>
                      </div>
                    )}
                    <div style={{ padding:'16px 18px', borderRadius:10, background:'var(--color-panel)', border:'1px solid var(--color-border)' }}>
                      <p style={{ fontSize:11, fontWeight:700, color:'var(--color-text)', marginBottom:10 }}>💰 Builder Settlement Offer</p>
                      {conciliation.builder_settlement_offer ? (
                        <p style={{ fontSize:18, fontWeight:900, color:'#16A34A', fontFamily:'var(--font-mono)' }}>${conciliation.builder_settlement_offer.toLocaleString('en-CA', { minimumFractionDigits:2 })}</p>
                      ) : (
                        <div style={{ display:'flex', gap:8 }}>
                          <input type="number" value={offerAmount} onChange={e => setOfferAmount(e.target.value)} placeholder="Enter offer amount"
                            style={{ flex:1, padding:'8px 10px', borderRadius:6, border:'1px solid var(--color-border)', background:'var(--color-mist)', fontSize:12, fontFamily:'var(--font-mono)', color:'var(--color-text)', outline:'none' }} />
                          <button onClick={handleSaveOffer} disabled={!offerAmount || savingOffer}
                            style={{ padding:'8px 16px', borderRadius:6, background: offerAmount ? '#16A34A' : 'var(--color-mist)', border:'none', color: offerAmount ? '#fff' : 'var(--color-muted)', fontSize:11, fontWeight:700, cursor: offerAmount ? 'pointer' : 'default', fontFamily:'var(--font-body)' }}>
                            {savingOffer ? 'Saving…' : 'Record offer'}
                          </button>
                        </div>
                      )}
                    </div>
                    {warrantedItems.length > 0 && (
                      <div>
                        <p style={{ fontSize:12, fontWeight:700, color:'var(--color-text)', marginBottom:10 }}>Warranted Items</p>
                        {warrantedItems.map((item, i) => (
                          <div key={item.id} style={{ padding:'10px 14px', borderRadius:8, background:'rgba(220,38,38,0.04)', border:'1px solid rgba(220,38,38,0.15)', marginBottom:6, display:'flex', gap:10 }}>
                            <span style={{ fontSize:10, fontWeight:800, color:'var(--color-muted)', fontFamily:'var(--font-mono)', flexShrink:0, width:20 }}>{String(i+1).padStart(2,'0')}</span>
                            <div><p style={{ fontSize:11, color:'var(--color-text)', lineHeight:1.5 }}>{item.description}</p></div>
                          </div>
                        ))}
                      </div>
                    )}
                    {notWarrantedItems.length > 0 && (
                      <div style={{ padding:'10px 14px', borderRadius:8, background:'var(--color-mist)', border:'1px solid var(--color-border)' }}>
                        <p style={{ fontSize:11, color:'var(--color-muted)', fontWeight:600 }}>✓ {notWarrantedItems.length} item{notWarrantedItems.length > 1 ? 's' : ''} not warranted</p>
                      </div>
                    )}
                    {warrantedItems.length > 0 && conciliation.stage === 'warranted' && (
                      <div style={{ padding:'16px 18px', borderRadius:10, background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.25)' }}>
                        <p style={{ fontSize:12, fontWeight:700, color:'#7C3AED', marginBottom:6 }}>🔨 Create Conciliation Work Case</p>
                        {!caseData.tarion_case_number_normalized ? (
                          <p style={{ fontSize:11, color:'var(--color-muted)' }}>Enter the Tarion case number in the sidebar first.</p>
                        ) : (
                          <>
                            <p style={{ fontSize:11, color:'var(--color-muted)', marginBottom:12 }}>Creates case <strong style={{ fontFamily:'var(--font-mono)', color:'#7C3AED' }}>{workCaseNumber}</strong> with {warrantedItems.length} warranted item{warrantedItems.length > 1 ? 's' : ''}.</p>
                            <button onClick={handleCreateWorkCase} disabled={creatingWorkCase}
                              style={{ padding:'10px 24px', borderRadius:8, background:'#7C3AED', color:'#fff', border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'var(--font-body)' }}>
                              {creatingWorkCase ? 'Creating…' : `Create ${workCaseNumber}`}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── INTERACTIONS ── */}
            {activeTab === 'interactions' && (
              <div style={{ paddingTop:16 }}>
                {interactions.length === 0 ? (
                  <div style={{ padding:'60px 0', textAlign:'center' }}>
                    <MessageSquare size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom:12 }} />
                    <p style={{ fontSize:13, fontWeight:600, color:'var(--color-text)', marginBottom:4 }}>No interactions yet</p>
                    <p style={{ fontSize:12, color:'var(--color-muted)' }}>All portal messages appear here automatically.</p>
                  </div>
                ) : interactions.map(item => {
                  const ch = CHANNEL_CONFIG[item.channel] ?? CHANNEL_CONFIG.note;
                  const Icon = ch.icon;
                  const isExpanded = expandedInteraction === item.id;
                  return (
                    <div key={item.id}>
                      <div style={{ display:'flex', gap:12, padding:'14px 0', borderBottom:'1px solid var(--color-border)', cursor:'pointer' }} onClick={() => setExpandedInteraction(isExpanded ? null : item.id)}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', background:`${ch.color}18`, border:`1.5px solid ${ch.color}40`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Icon size={14} color={ch.color} strokeWidth={1.8} />
                          </div>
                          <div style={{ width:1, flex:1, background:'var(--color-border)', marginTop:6 }} />
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:100, color:ch.color, background:`${ch.color}18`, textTransform:'uppercase' as const, letterSpacing:'0.07em' }}>{ch.label}</span>
                            <span style={{ fontSize:9, fontWeight:600, padding:'2px 7px', borderRadius:100, color: item.direction === 'inbound' ? '#059669' : '#1E5FA4', background: item.direction === 'inbound' ? 'rgba(5,150,105,0.10)' : 'rgba(30,95,164,0.10)' }}>{item.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}</span>
                            <span style={{ fontSize:10, color:'var(--color-muted)', marginLeft:'auto' }}>{formatDistanceToNow(new Date(item.occurred_at), { addSuffix:true })}</span>
                          </div>
                          {item.subject && <p style={{ fontSize:12, fontWeight:600, color:'var(--color-text)', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.subject}</p>}
                          {item.body && <p style={{ fontSize:11, color:'var(--color-muted)', marginTop:4, lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as any }}>{item.body}</p>}
                        </div>
                        <ChevronRight size={13} color="var(--color-muted)" style={{ flexShrink:0, alignSelf:'center' }} />
                      </div>
                      {isExpanded && (
                        <div style={{ margin:'0 0 16px 44px', padding:16, background:'var(--color-mist)', borderRadius:8, border:'1px solid var(--color-border)' }}>
                          {item.body && <p style={{ fontSize:12, color:'var(--color-text)', lineHeight:1.7, whiteSpace:'pre-wrap', marginBottom:12 }}>{item.body}</p>}
                          {item.documents.length > 0 && (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                              {item.documents.map(d => <span key={d.id} style={{ fontSize:10, padding:'4px 8px', borderRadius:6, background:'var(--color-panel)', border:'1px solid var(--color-border)', color:'var(--color-muted)', display:'flex', alignItems:'center', gap:4 }}><Paperclip size={9} />{d.file_name}</span>)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── DOCUMENTS ── */}
            {activeTab === 'documents' && (
              <div style={{ paddingTop:16 }}>
                {documents.length === 0 ? (
                  <div style={{ padding:'60px 0', textAlign:'center' }}>
                    <FileText size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom:12 }} />
                    <p style={{ fontSize:13, fontWeight:600, color:'var(--color-text)', marginBottom:4 }}>No documents yet</p>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {documents.map(doc => (
                      <div key={doc.id} onClick={() => handleDownload(doc)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:8, background:'var(--color-panel)', border:'1px solid var(--color-border)', cursor:'pointer' }}>
                        <span style={{ fontSize:20 }}>{fileIcon(doc.mime_type)}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:12, fontWeight:600, color:'var(--color-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.file_name}</p>
                          <div style={{ display:'flex', gap:8, marginTop:2 }}>
                            {doc.file_size_bytes !== null && <span style={{ fontSize:10, color:'var(--color-muted)', fontFamily:'var(--font-mono)' }}>{formatBytes(doc.file_size_bytes)}</span>}
                            <span style={{ fontSize:10, color:'var(--color-muted)' }}>{format(new Date(doc.uploaded_at), 'MMM d, yyyy')}</span>
                          </div>
                        </div>
                        <Download size={13} color="var(--color-muted)" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── NOTES ── */}
            {activeTab === 'notes' && (
              <div style={{ paddingTop:16, display:'flex', flexDirection:'column', gap:16 }}>
                <div style={{ background:'var(--color-panel)', borderRadius:10, border:'1px solid var(--color-border)', overflow:'hidden' }}>
                  <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Add an internal note…"
                    style={{ width:'100%', minHeight:80, padding:'12px 14px', background:'none', border:'none', resize:'none', fontFamily:'var(--font-body)', fontSize:12, color:'var(--color-text)', lineHeight:1.7, outline:'none', boxSizing:'border-box' as const }} />
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderTop:'1px solid var(--color-border)', background:'var(--color-mist)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <Lock size={10} color="var(--color-muted)" />
                      <span style={{ fontSize:10, color:'var(--color-muted)' }}>Internal only</span>
                    </div>
                    <button onClick={handleAddNote} disabled={!noteBody.trim() || savingNote}
                      style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:6, background: noteBody.trim() ? '#1E5FA4' : 'var(--color-mist)', border:'none', cursor: noteBody.trim() ? 'pointer' : 'default', color: noteBody.trim() ? '#fff' : 'var(--color-muted)', fontSize:11, fontWeight:600, fontFamily:'var(--font-body)' }}>
                      <Send size={11} />{savingNote ? 'Saving…' : 'Add Note'}
                    </button>
                  </div>
                </div>
                {notes.map(note => (
                  <div key={note.id} style={{ padding:14, borderRadius:8, background:'rgba(217,119,6,0.04)', border:'1px solid rgba(217,119,6,0.15)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:11, fontWeight:600, color:'var(--color-text)' }}>{note.created_by_name}</span>
                      <span style={{ fontSize:10, color:'var(--color-muted)', fontFamily:'var(--font-mono)' }}>{format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                    <p style={{ fontSize:12, color:'var(--color-text)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{note.body}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── AUDIT ── */}
            {activeTab === 'audit' && (
              <div style={{ paddingTop:16 }}>
                {audit.length === 0 ? (
                  <p style={{ fontSize:12, color:'var(--color-muted)', textAlign:'center', padding:'40px 0' }}>No audit entries.</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column' }}>
                    {audit.map((entry, i) => (
                      <div key={entry.id} style={{ display:'flex', gap:12, paddingBottom:14, borderLeft: i < audit.length-1 ? '1px solid var(--color-border)' : 'none', marginLeft:8, paddingLeft:16, position:'relative' }}>
                        <div style={{ position:'absolute', left:-5, top:2, width:10, height:10, borderRadius:'50%', background:'var(--color-panel)', border:'2px solid var(--color-border)' }} />
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:12, color:'var(--color-text)', fontWeight:500 }}>{auditLabel(entry)}</span>
                            {entry.source_app && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:100, background:'var(--color-mist)', color:'var(--color-muted)', border:'1px solid var(--color-border)', textTransform:'capitalize' as const }}>{entry.source_app}</span>}
                          </div>
                          {entry.old_value && entry.new_value && (
                            <p style={{ fontSize:11, color:'var(--color-muted)', marginTop:2 }}><span style={{ textDecoration:'line-through' }}>{entry.old_value}</span> → <span style={{ color:'#16A34A' }}>{entry.new_value}</span></p>
                          )}
                          <p style={{ fontSize:10, color:'var(--color-muted)', marginTop:3 }}>
                            {entry.user_name ? `${entry.user_name} · ` : ''}{format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
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
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}