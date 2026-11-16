import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, RefreshCw, FileText, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, formatDistanceToNow } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  company_id: string;
  community_id: string | null;
  access_level: string;
  first_name: string;
  last_name: string;
  is_owner: boolean;
  approval_limit: number | null;
}

interface CostCode {
  id: string;
  code: string;
  name: string;
  category: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_name: string;
  description: string;
  category: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  required_approver_role: string | null;
  required_approver_id: string | null;
  submitted_by_id: string | null;
  submitted_at: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  rejected_by_id: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  case_id: string | null;
  community_id: string | null;
  cost_code_id: string | null;
  // Joined
  case_number?: string | null;
  community_name?: string | null;
  cost_code_name?: string | null;
  submitted_by_name?: string | null;
  approved_by_name?: string | null;
}

// ─── Constants ────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:            { label: 'Draft',            color: '#6C7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)'  },
  submitted:        { label: 'Submitted',        color: '#3F6A8F', bg: 'rgba(30,95,164,0.08)',   border: 'rgba(30,95,164,0.2)'    },
  pending_approval: { label: 'Pending Approval', color: '#9A6A16', bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.25)'   },
  approved:         { label: 'Approved',         color: '#4A7A55', bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.2)'    },
  rejected:         { label: 'Rejected',         color: '#A5402F', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.2)'    },
  cancelled:        { label: 'Cancelled',        color: '#8C919C', bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.2)'  },
  paid:             { label: 'Paid',             color: '#6B5B95', bg: 'rgba(124,58,237,0.08)',  border: 'rgba(124,58,237,0.2)'   },
};

const ROLE_LABELS: Record<string, string> = {
  manager:    'Manager',
  sr_manager: 'Sr. Manager',
  director:   'Director',
  vp:         'VP',
  owner:      'Owner / Accountant',
};

const CATEGORIES = [
  { value: 'labor',       label: 'Labor'        },
  { value: 'material',    label: 'Material'     },
  { value: 'subcontract', label: 'Subcontract'  },
  { value: 'gas',         label: 'Gas / Travel' },
  { value: 'overhead',    label: 'Overhead'     },
  { value: 'other',       label: 'Other'        },
];

// ─── Can approve? ─────────────────────────────────────────────

function canApprove(profile: UserProfile): boolean {
  return ['manager', 'sr_manager', 'director', 'vp', 'owner', 'company'].includes(profile.access_level)
    || profile.is_owner;
}

function canCreate(profile: UserProfile): boolean {
  return true; // all roles can create a PO
}

// ─── Approval limit label ─────────────────────────────────────

function approvalLimitLabel(profile: UserProfile): string {
  if (profile.is_owner || profile.approval_limit === null) return 'Unlimited';
  return `Up to $${profile.approval_limit.toLocaleString()}`;
}

// ─── PO Card ─────────────────────────────────────────────────

function POCard({
  po,
  profile,
  onApprove,
  onReject,
  onExpand,
  isExpanded,
}: {
  po: PurchaseOrder;
  profile: UserProfile;
  onApprove: (po: PurchaseOrder) => void;
  onReject: (po: PurchaseOrder) => void;
  onExpand: (id: string) => void;
  isExpanded: boolean;
}) {
  const st = STATUS_CONFIG[po.status] ?? STATUS_CONFIG.draft;
  const isPending = po.status === 'pending_approval';
  const isMyApproval = isPending && po.required_approver_id === profile.id;
  const isMine = po.submitted_by_id === profile.id;

  return (
    <div style={{
      borderRadius: 10,
      background: 'var(--color-panel)',
      border: `1px solid ${isMyApproval ? 'rgba(217,119,6,0.35)' : 'var(--color-border)'}`,
      overflow: 'hidden',
      transition: 'all 0.12s',
    }}>
      {/* Main row */}
      <div
        onClick={() => onExpand(po.id)}
        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
      >
        {/* Urgency dot */}
        {isMyApproval && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9A6A16', boxShadow: '0 0 8px rgba(217,119,6,0.7)', flexShrink: 0 }} />
        )}

        {/* PO number */}
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)', flexShrink: 0, width: 100 }}>
          {po.po_number}
        </span>

        {/* Vendor + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 2 }}>{po.vendor_name}</p>
          <p style={{ fontSize: 11, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {po.description}
            {po.community_name && ` · ${po.community_name}`}
            {po.case_number && ` · #${po.case_number}`}
          </p>
        </div>

        {/* Category */}
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
          {po.category}
        </span>

        {/* Required approver */}
        {po.required_approver_role && isPending && (
          <span style={{ fontSize: 10, fontWeight: 600, color: '#9A6A16', flexShrink: 0 }}>
            → {ROLE_LABELS[po.required_approver_role] ?? po.required_approver_role}
          </span>
        )}

        {/* Amount */}
        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', flexShrink: 0, width: 100, textAlign: 'right' }}>
          ${po.total_amount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
        </span>

        {/* Status */}
        <div style={{ padding: '3px 10px', borderRadius: 100, background: st.bg, border: `1px solid ${st.border}`, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>
        </div>

        {/* Expand */}
        {isExpanded
          ? <ChevronUp size={13} color="var(--color-muted)" />
          : <ChevronDown size={13} color="var(--color-muted)" />
        }
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--color-border)', background: 'var(--color-mist)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
            {[
              { label: 'Submitted by', value: po.submitted_by_name ?? '—' },
              { label: 'Submitted',    value: po.submitted_at ? formatDistanceToNow(new Date(po.submitted_at), { addSuffix: true }) : '—' },
              { label: 'Amount',       value: `$${po.amount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}` },
              { label: 'Tax',          value: `$${po.tax_amount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}` },
            ].map(s => (
              <div key={s.label}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 3 }}>{s.label}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{s.value}</p>
              </div>
            ))}
          </div>

          {po.cost_code_name && (
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 12 }}>
              Cost Code: <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{po.cost_code_name}</span>
            </p>
          )}

          {po.approved_at && (
            <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: '#4A7A55', fontWeight: 600 }}>
                ✓ Approved by {po.approved_by_name} · {format(new Date(po.approved_at), 'MMM d, yyyy h:mm a')}
              </p>
              {po.approval_notes && <p style={{ fontSize: 11, color: '#4A7A55', marginTop: 3 }}>{po.approval_notes}</p>}
            </div>
          )}

          {po.rejected_at && (
            <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', marginBottom: 10 }}>
              <p style={{ fontSize: 11, color: '#A5402F', fontWeight: 600 }}>
                ✕ Rejected by {po.approved_by_name ?? '—'} · {format(new Date(po.rejected_at), 'MMM d, yyyy h:mm a')}
              </p>
              {po.rejection_reason && <p style={{ fontSize: 11, color: '#A5402F', marginTop: 3 }}>{po.rejection_reason}</p>}
            </div>
          )}

          {/* Approve / Reject buttons — only for designated approver */}
          {isMyApproval && canApprove(profile) && (!isMine || profile.is_owner) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={e => { e.stopPropagation(); onApprove(po); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 7, background: '#4A7A55', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                <CheckCircle2 size={13} /> Approve
              </button>
              <button
                onClick={e => { e.stopPropagation(); onReject(po); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 7, background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.25)', color: '#A5402F', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                <XCircle size={13} /> Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create PO Modal ──────────────────────────────────────────

function CreatePOModal({
  profile,
  costCodes,
  onClose,
  onCreated,
}: {
  profile: UserProfile;
  costCodes: CostCode[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [vendorName, setVendorName]   = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]       = useState('material');
  const [costCodeId, setCostCodeId]   = useState('');
  const [amount, setAmount]           = useState('');
  const [taxAmount, setTaxAmount]     = useState('0');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const total = (parseFloat(amount || '0') + parseFloat(taxAmount || '0'));

  async function handleSubmit() {
    if (!vendorName.trim() || !description.trim() || !amount) {
      setError('Vendor, description, and amount are required.');
      return;
    }
    setSaving(true);
    setError('');

    // Generate PO number
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', profile.company_id);

    const poNumber = `PO-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`;

    const { data: newPO, error: insertError } = await supabase
      .from('purchase_orders')
      .insert({
        company_id:    profile.company_id,
        po_number:     poNumber,
        vendor_name:   vendorName.trim(),
        description:   description.trim(),
        category,
        cost_code_id:  costCodeId || null,
        amount:        parseFloat(amount),
        tax_amount:    parseFloat(taxAmount || '0'),
        status:        'draft',
        created_by_id: profile.id,
      })
      .select('id')
      .single();

    if (insertError || !newPO) {
      setError(insertError?.message ?? 'Failed to create PO.');
      setSaving(false);
      return;
    }

    // Submit immediately for approval
    const { data: result } = await supabase.rpc('submit_po', {
      p_company_id: profile.company_id,
      p_po_id:      newPO.id,
      p_user_id:    profile.id,
    });

    if (result && !result.success) {
      setError(result.error ?? 'Failed to submit PO.');
      setSaving(false);
      return;
    }

    setSaving(false);
    onCreated();
    onClose();
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    border: '1px solid var(--color-border)', background: 'var(--color-mist)',
    fontSize: 12, color: 'var(--color-text)', fontFamily: 'var(--font-body)',
    outline: 'none', boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 5, display: 'block',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: 'var(--color-panel)', borderRadius: 14,
        border: '1px solid var(--color-border)', width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text)' }}>New Purchase Order</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 18, fontFamily: 'var(--font-body)' }}>✕</button>
        </div>

        <div style={{ padding: '20px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 7, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: '#A5402F', fontWeight: 600 }}>{error}</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div>
              <label style={labelStyle}>Vendor / Trade *</label>
              <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="e.g. Drywall Pro Inc." style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the scope of work…"
                style={{ ...inputStyle, minHeight: 72, resize: 'none' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Cost Code</label>
                <select value={costCodeId} onChange={e => setCostCodeId(e.target.value)} style={inputStyle}>
                  <option value="">— Select —</option>
                  {costCodes.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Amount (CAD) *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>$</span>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>HST / Tax</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>$</span>
                  <input type="number" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} placeholder="0.00"
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
                </div>
              </div>
            </div>

            {/* Total + approval preview */}
            {amount && (
              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Total</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>
                    ${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                  Required approval: {' '}
                  <span style={{ fontWeight: 700, color: '#9A6A16' }}>
                    {total <= 5000  ? 'Manager'
                    : total <= 15000 ? 'Sr. Manager'
                    : total <= 25000 ? 'Director'
                    : 'VP / Owner'}
                  </span>
                  {' '}— will be routed automatically
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving || !vendorName.trim() || !description.trim() || !amount}
            style={{ padding: '8px 24px', borderRadius: 7, background: vendorName && description && amount ? '#3F6A8F' : 'var(--color-mist)', border: 'none', color: vendorName && description && amount ? '#fff' : 'var(--color-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {saving ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────

function RejectModal({
  po,
  profile,
  onClose,
  onRejected,
}: {
  po: PurchaseOrder;
  profile: UserProfile;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleReject() {
    if (!reason.trim()) return;
    setSaving(true);
    await supabase.rpc('reject_po', {
      p_company_id:  profile.company_id,
      p_po_id:       po.id,
      p_rejector_id: profile.id,
      p_reason:      reason.trim(),
    });
    setSaving(false);
    onRejected();
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 24 }}>
      <div style={{ background: 'var(--color-panel)', borderRadius: 14, border: '1px solid var(--color-border)', width: '100%', maxWidth: 420 }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#A5402F' }}>Reject PO</p>
          <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3 }}>{po.po_number} · {po.vendor_name} · ${po.total_amount.toLocaleString()}</p>
        </div>
        <div style={{ padding: '20px' }}>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6, display: 'block' }}>
            Reason for rejection *
          </label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why this PO is being rejected…"
            style={{ width: '100%', minHeight: 90, padding: '10px 12px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-mist)', fontSize: 12, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
          <button onClick={handleReject} disabled={!reason.trim() || saving}
            style={{ padding: '8px 24px', borderRadius: 7, background: reason.trim() ? '#A5402F' : 'var(--color-mist)', border: 'none', color: reason.trim() ? '#fff' : 'var(--color-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {saving ? 'Rejecting…' : 'Reject PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function POApprovalsPage() {
  const navigate = useNavigate();

  const [profile, setProfile]         = useState<UserProfile | null>(null);
  const [costCodes, setCostCodes]     = useState<CostCode[]>([]);
  const [pendingPOs, setPendingPOs]   = useState<PurchaseOrder[]>([]);
  const [historyPOs, setHistoryPOs]   = useState<PurchaseOrder[]>([]);
  const [myPOs, setMyPOs]             = useState<PurchaseOrder[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [rejectingPO, setRejectingPO] = useState<PurchaseOrder | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<'pending' | 'history' | 'mine'>('pending');

  // ── Fetch profile ────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('id, company_id, community_id, access_level, first_name, last_name, is_owner, approval_limit')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data as UserProfile);
  }, []);

  // ── Fetch cost codes ─────────────────────────────────────────

  const fetchCostCodes = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('cost_codes')
      .select('id, code, name, category')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .order('code');
    if (data) setCostCodes(data as CostCode[]);
  }, [profile]);

  // ── Fetch POs ─────────────────────────────────────────────────

  const fetchPOs = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    // Fetch all POs for this company
    const { data } = await supabase
      .from('purchase_orders')
      .select(`
        id, po_number, vendor_name, description, category,
        amount, tax_amount, total_amount, status,
        required_approver_role, required_approver_id,
        submitted_by_id, submitted_at,
        approved_by_id, approved_at, approval_notes,
        rejected_by_id, rejected_at, rejection_reason,
        created_at, case_id, community_id, cost_code_id
      `)
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    // Enrich with names via separate queries
    const userIds = [...new Set([
      ...data.map(p => p.submitted_by_id),
      ...data.map(p => p.approved_by_id),
    ].filter(Boolean))];

    const caseIds      = [...new Set(data.map(p => p.case_id).filter(Boolean))];
    const communityIds = [...new Set(data.map(p => p.community_id).filter(Boolean))];
    const codeIds      = [...new Set(data.map(p => p.cost_code_id).filter(Boolean))];

    const [usersRes, casesRes, commRes, codesRes] = await Promise.all([
      userIds.length      ? supabase.from('users').select('id, first_name, last_name').in('id', userIds) : { data: [] },
      caseIds.length      ? supabase.from('cases').select('id, case_number').in('id', caseIds) : { data: [] },
      communityIds.length ? supabase.from('warranty_communities').select('id, name').in('id', communityIds) : { data: [] },
      codeIds.length      ? supabase.from('cost_codes').select('id, code, name').in('id', codeIds) : { data: [] },
    ]);

    const userMap: Record<string, string> = {};
    for (const u of (usersRes.data ?? []) as { id: string; first_name: string; last_name: string }[]) {
      userMap[u.id] = `${u.first_name} ${u.last_name}`;
    }
    const caseMap: Record<string, string> = {};
    for (const c of (casesRes.data ?? []) as { id: string; case_number: string }[]) {
      caseMap[c.id] = c.case_number;
    }
    const commMap: Record<string, string> = {};
    for (const c of (commRes.data ?? []) as { id: string; name: string }[]) {
      commMap[c.id] = c.name;
    }
    const codeMap: Record<string, string> = {};
    for (const c of (codesRes.data ?? []) as { id: string; code: string; name: string }[]) {
      codeMap[c.id] = `${c.code} · ${c.name}`;
    }

    const enriched: PurchaseOrder[] = data.map(p => ({
      ...p,
      submitted_by_name: p.submitted_by_id ? userMap[p.submitted_by_id] : null,
      approved_by_name:  p.approved_by_id  ? userMap[p.approved_by_id]  : null,
      case_number:       p.case_id         ? caseMap[p.case_id]          : null,
      community_name:    p.community_id    ? commMap[p.community_id]     : null,
      cost_code_name:    p.cost_code_id    ? codeMap[p.cost_code_id]     : null,
    }));

    // Split into buckets
    // Pending = waiting for MY approval (manager+)
    setPendingPOs(enriched.filter(p =>
      p.status === 'pending_approval' && p.required_approver_id === profile.id
    ));

    // History = POs I approved or rejected
    setHistoryPOs(enriched.filter(p =>
      (p.approved_by_id === profile.id || p.rejected_by_id === profile.id)
    ));

    // Mine = POs I submitted
    setMyPOs(enriched.filter(p => p.submitted_by_id === profile.id));

    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => { if (profile) { fetchCostCodes(); fetchPOs(); } }, [profile, fetchCostCodes, fetchPOs]);

  // ── Approve ───────────────────────────────────────────────────

  async function handleApprove(po: PurchaseOrder) {
    if (!profile) return;
    setApprovingId(po.id);
    const { data, error } = await supabase.rpc('approve_po', {
      p_company_id:  profile.company_id,
      p_po_id:       po.id,
      p_approver_id: profile.id,
      p_notes:       null,
    });
    console.log('approve result:', data, 'error:', error);
    setApprovingId(null);
    fetchPOs();
  }

  if (!profile) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-muted)', fontSize: 13 }}>
      Loading…
    </div>
  );

  const isApprover = canApprove(profile);
  const tabs = [
    { key: 'pending', label: 'Awaiting My Approval', count: pendingPOs.length, show: isApprover },
    { key: 'history', label: 'My Approval History',  count: historyPOs.length, show: isApprover },
    { key: 'mine',    label: 'My Submitted POs',     count: myPOs.length,      show: true       },
  ].filter(t => t.show);

  const activePOs = activeTab === 'pending' ? pendingPOs
    : activeTab === 'history' ? historyPOs
    : myPOs;

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1100, margin: '0 auto', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, padding: 0, fontFamily: 'var(--font-body)' }}>
            <ArrowLeft size={13} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: 2 }}>PO Approvals</h1>
            {isApprover && (
              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                Your approval authority: <span style={{ fontWeight: 700, color: '#4A7A55' }}>{approvalLimitLabel(profile)}</span>
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchPOs} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 7, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 11, fontFamily: 'var(--font-body)' }}>
            <RefreshCw size={11} />
          </button>
          <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: '#3F6A8F', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            <Plus size={13} /> New PO
          </button>
        </div>
      </div>

      {/* Pending alert banner */}
      {pendingPOs.length > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9A6A16', boxShadow: '0 0 8px rgba(217,119,6,0.7)', flexShrink: 0 }} />
          <p style={{ fontSize: 12, fontWeight: 700, color: '#9A6A16' }}>
            {pendingPOs.length} PO{pendingPOs.length > 1 ? 's' : ''} waiting for your approval
          </p>
          <button onClick={() => setActiveTab('pending')} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#9A6A16', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Review now →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 0 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
            style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 12,
              fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? 'var(--color-text)' : 'var(--color-muted)',
              borderBottom: activeTab === tab.key ? '2px solid #3F6A8F' : '2px solid transparent',
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 100,
                background: activeTab === tab.key ? 'rgba(30,95,164,0.15)' : 'var(--color-mist)',
                color: activeTab === tab.key ? '#3F6A8F' : 'var(--color-muted)',
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* PO List */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading POs…</div>
      ) : activePOs.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <FileText size={36} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
            {activeTab === 'pending' ? 'No POs awaiting your approval' : activeTab === 'history' ? 'No approval history yet' : 'No POs submitted yet'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {activeTab === 'mine' ? 'Create a new PO using the button above.' : ''}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activePOs.map(po => (
            <POCard
              key={po.id}
              po={po}
              profile={profile}
              isExpanded={expandedId === po.id}
              onExpand={id => setExpandedId(expandedId === id ? null : id)}
              onApprove={handleApprove}
              onReject={po => setRejectingPO(po)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreatePOModal
          profile={profile}
          costCodes={costCodes}
          onClose={() => setShowCreate(false)}
          onCreated={fetchPOs}
        />
      )}

      {rejectingPO && (
        <RejectModal
          po={rejectingPO}
          profile={profile}
          onClose={() => setRejectingPO(null)}
          onRejected={fetchPOs}
        />
      )}
    </div>
  );
}