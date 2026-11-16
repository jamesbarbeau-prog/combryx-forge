import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, RefreshCw, Calendar, Clock, User,
  ChevronDown, ChevronUp, CheckCircle2, AlertTriangle,
  Wrench, Truck, MoreHorizontal, MapPin, Phone,
  DollarSign, Layers, ChevronRight, Mail,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { VisitChecksPanel } from '@/components/visitchecks';
import { format, addDays, startOfWeek, isSameDay, isToday, isTomorrow, isPast } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  company_id: string;
  access_level: string;
  first_name: string;
  last_name: string;
  is_owner: boolean;
}

interface Company {
  id: string;
  name: string;
  org_type: string; // large_builder | small_builder
}

interface Tech {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

interface Vendor {
  id: string;
  name: string;
  trade: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  preferred: boolean;
}

interface WarrantyItem {
  id: string;
  item_number: number;
  room: string | null;
  description: string;
  status: string;
  warranty_decision: string | null;
  resolution_type: string | null;
  trade_required: string | null;
  trade_sequence: number | null;
  chargeable: boolean | null;
}

interface WorkOrder {
  id: string;
  company_id: string;
  case_id: string | null;
  lot_id: string | null;
  community_id: string | null;
  tech_id: string | null;
  status: string;
  priority: string;
  issue: string;
  description: string | null;
  address: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_estimate: number;
  items_total: number;
  items_complete: number;
  homeowner_confirmed: boolean;
  homeowner_phone: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  priority_score: number;
  total_cost: number;
  created_at: string;
  // Joined
  tech_name?: string | null;
  case_number?: string | null;
  lot_address?: string | null;
  lot_number?: string | null;
  community_name?: string | null;
  brp_end_date?: string | null;
  items?: WarrantyItem[];
}

interface ScheduleSuggestion {
  case_id: string;
  case_number: string;
  lot_address: string;
  community: string;
  tech_id: string;
  tech_name: string;
  priority_score: number;
  priority_items: number;
  days_needed: number;
  brp_end_date: string | null;
  status: string;
}

// ─── Constants ────────────────────────────────────────────────

const WO_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:      { label: 'Pending',      color: '#6C7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)'  },
  scheduled:    { label: 'Scheduled',    color: '#3F6A8F', bg: 'rgba(30,95,164,0.08)',   border: 'rgba(30,95,164,0.2)'    },
  in_progress:  { label: 'In Progress',  color: '#9A6A16', bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.25)'   },
  completed:    { label: 'Completed',    color: '#4A7A55', bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.2)'    },
  cancelled:    { label: 'Cancelled',    color: '#A5402F', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.2)'    },
  on_hold:      { label: 'On Hold',      color: '#6B5B95', bg: 'rgba(124,58,237,0.08)',  border: 'rgba(124,58,237,0.2)'   },
};

const TRADE_LABELS: Record<string, string> = {
  drywall:     'Drywall',     paint:       'Paint',
  plumbing:    'Plumbing',    electrical:  'Electrical',
  flooring:    'Flooring',    roofing:     'Roofing',
  siding:      'Siding',      masonry:     'Masonry',
  concrete:    'Concrete',    window:      'Windows',
  door:        'Doors',       hvac:        'HVAC',
  tile:        'Tile',        general:     'General',
};

const TRADE_COLORS: Record<string, string> = {
  drywall:    '#3F6A8F', paint:      '#6B5B95',
  plumbing:   '#3F7A8C', electrical: '#9A6A16',
  flooring:   '#4A7A55', roofing:    '#A5402F',
  siding:     '#6C7280', masonry:    '#92400E',
  concrete:   '#374151', window:     '#3F7A8C',
  door:       '#374151', hvac:       '#A5402F',
  tile:       '#6B5B95', general:    '#6C7280',
};

const TIME_SLOTS = [
  '07:00','07:30','08:00','08:30','09:00','09:30',
  '10:00','10:30','11:00','11:30','12:00','12:30',
  '13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00',
];

// ─── Helpers ──────────────────────────────────────────────────

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function priorityColor(score: number): string {
  if (score >= 100) return '#A5402F';
  if (score >= 60)  return '#9A6A16';
  if (score >= 30)  return '#3F6A8F';
  return '#4A7A55';
}

function priorityLabel(score: number): string {
  if (score >= 100) return 'Critical';
  if (score >= 60)  return 'High';
  if (score >= 30)  return 'Medium';
  return 'Low';
}

function daysUntilBRP(brpDate: string | null | undefined): number | null {
  if (!brpDate) return null;
  return Math.ceil((new Date(brpDate).getTime() - Date.now()) / 86400000);
}

// ─── Work Order Card ──────────────────────────────────────────

function WOCard({
  wo, profile, techs, isExpanded, onExpand, onUpdate,
}: {
  wo: WorkOrder;
  profile: UserProfile;
  techs: Tech[];
  isExpanded: boolean;
  onExpand: (id: string) => void;
  onUpdate: () => void;
}) {
  const st         = WO_STATUS[wo.status] ?? WO_STATUS.pending;
  const brpDays    = daysUntilBRP(wo.brp_end_date);
  const brpColor   = brpDays === null ? '#6C7280' : brpDays < 0 ? '#A5402F' : brpDays < 14 ? '#A5402F' : brpDays < 30 ? '#9A6A16' : '#4A7A55';
  const pColor     = priorityColor(wo.priority_score);
  const progress   = wo.items_total > 0 ? Math.round((wo.items_complete / wo.items_total) * 100) : 0;
  const isManager  = ['manager','sr_manager','director','vp','owner','company'].includes(profile.access_level) || profile.is_owner;
  const [editing, setEditing]   = useState(false);
  const [newTech, setNewTech]   = useState(wo.tech_id ?? '');
  const [newDate, setNewDate]   = useState(wo.scheduled_date ?? '');
  const [newTime, setNewTime]   = useState(wo.scheduled_time ?? '08:00');
  const [saving, setSaving]     = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  async function handleSaveSchedule() {
    setSaving(true);
    await supabase.from('work_orders').update({
      tech_id:        newTech || null,
      scheduled_date: newDate || null,
      scheduled_time: newTime || null,
      status:         newDate ? 'scheduled' : 'pending',
    }).eq('id', wo.id);
    setSaving(false);
    setEditing(false);
    onUpdate();
  }

  async function handleStatusChange(newStatus: string) {
    await supabase.from('work_orders').update({
      status:       newStatus,
      completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
    }).eq('id', wo.id);
    onUpdate();
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    await supabase.from('work_orders').update({
      status:              'cancelled',
      cancellation_reason: cancelReason,
      cancelled_at:        new Date().toISOString(),
    }).eq('id', wo.id);
    setCancelling(false);
    onUpdate();
  }

  // Trade items grouped
  const tradeItems = wo.items?.filter(i =>
    i.resolution_type === 'trade_required' &&
    i.warranty_decision !== 'not_warranted'
  ) ?? [];
  const techItems = wo.items?.filter(i =>
    i.resolution_type === 'tech' &&
    i.warranty_decision !== 'not_warranted'
  ) ?? [];

  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      background: 'var(--color-panel)',
      border: `1px solid ${wo.status === 'cancelled' ? 'rgba(220,38,38,0.15)' : wo.priority_score >= 60 ? 'rgba(217,119,6,0.2)' : 'var(--color-border)'}`,
      opacity: wo.status === 'cancelled' ? 0.7 : 1,
    }}>

      {/* Header row */}
      <div onClick={() => onExpand(wo.id)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Priority score */}
        <div style={{ flexShrink: 0, textAlign: 'center', width: 44 }}>
          <p style={{ fontSize: 16, fontWeight: 900, color: pColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{wo.priority_score}</p>
          <p style={{ fontSize: 8, color: pColor, fontWeight: 700, textTransform: 'uppercase' }}>{priorityLabel(wo.priority_score)}</p>
        </div>

        {/* Address + case */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)' }}>
              {wo.lot_number ? `Lot ${wo.lot_number}` : wo.lot_address ?? wo.issue}
            </p>
            {wo.community_name && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{wo.community_name}</span>}
            {wo.case_number && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>#{wo.case_number}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {wo.lot_address && wo.lot_number && (
              <span style={{ fontSize: 10, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={9} /> {wo.lot_address}
              </span>
            )}
            {wo.tech_name && (
              <span style={{ fontSize: 10, color: 'var(--color-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                <User size={9} color="#3F6A8F" /> {wo.tech_name}
              </span>
            )}
            {wo.scheduled_date && (
              <span style={{ fontSize: 10, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Calendar size={9} color="#3F6A8F" />
                {isToday(new Date(wo.scheduled_date)) ? 'Today'
                  : isTomorrow(new Date(wo.scheduled_date)) ? 'Tomorrow'
                  : format(new Date(wo.scheduled_date), 'EEE MMM d')}
                {wo.scheduled_time && ` · ${fmt12(wo.scheduled_time)}`}
              </span>
            )}
          </div>
        </div>

        {/* Items progress */}
        {wo.items_total > 0 && (
          <div style={{ flexShrink: 0, textAlign: 'center', width: 60 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
              {wo.items_complete}/{wo.items_total}
            </div>
            <div style={{ height: 3, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#4A7A55' : '#3F6A8F', borderRadius: 100 }} />
            </div>
          </div>
        )}

        {/* BRP countdown */}
        {brpDays !== null && (
          <div style={{ flexShrink: 0, textAlign: 'center', width: 50 }}>
            <p style={{ fontSize: 14, fontWeight: 900, color: brpColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {brpDays < 0 ? '!' : brpDays}
            </p>
            <p style={{ fontSize: 8, color: brpColor, fontWeight: 700, textTransform: 'uppercase' }}>
              {brpDays < 0 ? 'expired' : 'days BRP'}
            </p>
          </div>
        )}

        {/* Status */}
        <div style={{ padding: '3px 10px', borderRadius: 100, background: st.bg, border: `1px solid ${st.border}`, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>
        </div>

        {isExpanded ? <ChevronUp size={13} color="var(--color-muted)" /> : <ChevronDown size={13} color="var(--color-muted)" />}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-mist)', padding: '16px 18px' }}>

          {/* Schedule editor */}
          {isManager && (editing ? (
            <div style={{ padding: '14px', borderRadius: 8, background: 'var(--color-panel)', border: '1px solid var(--color-border)', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', marginBottom: 12 }}>Edit Schedule</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4, display: 'block' }}>Tech</label>
                  <select value={newTech} onChange={e => setNewTech(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-mist)', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none' }}>
                    <option value="">— Unassigned —</option>
                    {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4, display: 'block' }}>Date</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-mist)', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4, display: 'block' }}>Time</label>
                  <select value={newTime} onChange={e => setNewTime(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-mist)', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none' }}>
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{fmt12(t)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveSchedule} disabled={saving}
                  style={{ padding: '7px 16px', borderRadius: 6, background: '#3F6A8F', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {saving ? 'Saving…' : 'Save Schedule'}
                </button>
                <button onClick={() => setEditing(false)}
                  style={{ padding: '7px 14px', borderRadius: 6, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => setEditing(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, background: 'rgba(30,95,164,0.10)', border: '1px solid rgba(30,95,164,0.25)', color: '#3F6A8F', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <Calendar size={11} /> Edit Schedule
              </button>
              {wo.status === 'scheduled' && (
                <button onClick={() => handleStatusChange('in_progress')}
                  style={{ padding: '7px 14px', borderRadius: 6, background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.25)', color: '#9A6A16', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Start Work
                </button>
              )}
              {(wo.status === 'in_progress' || wo.status === 'scheduled') && (
                <button onClick={() => handleStatusChange('completed')}
                  style={{ padding: '7px 14px', borderRadius: 6, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', color: '#4A7A55', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  ✓ Complete
                </button>
              )}
              <a 
  href={`mailto:${techs.find(t => t.id === wo.tech_id)?.email || ''}?subject=Work Order: Lot ${wo.lot_number || ''} - ${wo.community_name || ''}&body=Issue: ${wo.issue}%0D%0AAddress: ${wo.lot_address || ''}%0D%0AScheduled: ${wo.scheduled_date} at ${wo.scheduled_time}`}
  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
>
  <Phone size={11} /> Mail Tech
</a>
              {wo.status !== 'cancelled' && wo.status !== 'completed' && (
                <button onClick={() => setCancelling(!cancelling)}
                  style={{ padding: '7px 14px', borderRadius: 6, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#A5402F', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', marginLeft: 'auto' }}>
                  Cancel Visit
                </button>
              )}
            </div>
          ))}

          {/* Cancellation form */}
          {cancelling && (
            <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.2)', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#A5402F', marginBottom: 8 }}>Reason for cancellation</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                  placeholder="Homeowner not available, access denied, etc…"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(220,38,38,0.3)', background: 'var(--color-panel)', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none' }} />
                <button onClick={handleCancel} disabled={!cancelReason.trim()}
                  style={{ padding: '7px 14px', borderRadius: 6, background: cancelReason.trim() ? '#A5402F' : 'var(--color-mist)', border: 'none', color: cancelReason.trim() ? '#fff' : 'var(--color-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Confirm
                </button>
              </div>
            </div>
          )}

          {/* Items split by resolution type */}
          <div style={{ display: 'grid', gridTemplateColumns: techItems.length > 0 && tradeItems.length > 0 ? '1fr 1fr' : '1fr', gap: 12 }}>

            {/* Tech items */}
            {techItems.length > 0 && (
              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Wrench size={11} color="#3F6A8F" />
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#3F6A8F', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tech Items ({techItems.length})</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {techItems.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 1 }}>
                        {String(item.item_number).padStart(2,'0')}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {item.room && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text)' }}>{item.room} · </span>}
                        <span style={{ fontSize: 10, color: 'var(--color-muted)', lineHeight: 1.4 }}>{item.description}</span>
                      </div>
                      {item.status === 'completed' && <CheckCircle2 size={12} color="#4A7A55" style={{ flexShrink: 0, marginTop: 1 }} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trade items */}
            {tradeItems.length > 0 && (
              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Truck size={11} color="#9A6A16" />
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#9A6A16', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Trade Required ({tradeItems.length})</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tradeItems.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 1 }}>
                        {String(item.item_number).padStart(2,'0')}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {item.room && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text)' }}>{item.room} · </span>}
                        <span style={{ fontSize: 10, color: 'var(--color-muted)', lineHeight: 1.4 }}>{item.description}</span>
                      </div>
                      {item.trade_required && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${TRADE_COLORS[item.trade_required] ?? '#6C7280'}15`, color: TRADE_COLORS[item.trade_required] ?? '#6C7280', flexShrink: 0 }}>
                          {TRADE_LABELS[item.trade_required] ?? item.trade_required}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Homeowner confirmation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '8px 12px', borderRadius: 7, background: wo.homeowner_confirmed ? 'rgba(22,163,74,0.08)' : 'var(--color-panel)', border: `1px solid ${wo.homeowner_confirmed ? 'rgba(22,163,74,0.2)' : 'var(--color-border)'}` }}>
            <CheckCircle2 size={13} color={wo.homeowner_confirmed ? '#4A7A55' : 'var(--color-muted)'} />
            <span style={{ fontSize: 11, color: wo.homeowner_confirmed ? '#4A7A55' : 'var(--color-muted)', fontWeight: 600 }}>
              {wo.homeowner_confirmed ? 'Homeowner confirmed' : 'Awaiting homeowner confirmation'}
            </span>
            {wo.homeowner_phone && (
              <span style={{ fontSize: 10, color: 'var(--color-muted)', marginLeft: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Phone size={9} /> {wo.homeowner_phone}
              </span>
            )}
            {!wo.homeowner_confirmed && (
              <button onClick={async () => {
                await supabase.from('work_orders').update({ homeowner_confirmed: true }).eq('id', wo.id);
                onUpdate();
              }} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 5, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', color: '#4A7A55', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Mark Confirmed
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Schedule Suggestion Card ─────────────────────────────────

function SuggestionCard({
  s, onAccept, onSkip,
}: {
  s: ScheduleSuggestion;
  onAccept: (s: ScheduleSuggestion, date: string) => void;
  onSkip: (s: ScheduleSuggestion) => void;
}) {
  const [date, setDate] = useState('');
  const pColor = priorityColor(s.priority_score);

  return (
    <div style={{ padding: '14px 16px', borderRadius: 9, background: 'var(--color-panel)', border: `1px solid rgba(217,119,6,0.25)` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{ flexShrink: 0, textAlign: 'center', width: 40 }}>
          <p style={{ fontSize: 15, fontWeight: 900, color: pColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{s.priority_score}</p>
          <p style={{ fontSize: 8, color: pColor, fontWeight: 700 }}>{priorityLabel(s.priority_score)}</p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 2 }}>{s.lot_address}</p>
          <p style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 4 }}>
            {s.community} · #{s.case_number}
            {s.brp_end_date && (
  <span style={{ color: daysUntilBRP(s.brp_end_date)! < 14 ? '#A5402F' : 'inherit', fontWeight: 700 }}>
    {` · BRP: ${format(new Date(s.brp_end_date), 'MMM d')} (${daysUntilBRP(s.brp_end_date)}d left)`}
  </span>
)}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(30,95,164,0.10)', color: '#3F6A8F' }}>
              👤 {s.tech_name}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(217,119,6,0.10)', color: '#9A6A16' }}>
              {s.priority_items} priority items
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)' }}>
              ~{s.days_needed} day{s.days_needed > 1 ? 's' : ''} needed
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-mist)', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none' }} />
        <button onClick={() => date && onAccept(s, date)} disabled={!date}
          style={{ padding: '6px 14px', borderRadius: 6, background: date ? '#4A7A55' : 'var(--color-mist)', border: 'none', color: date ? '#fff' : 'var(--color-muted)', fontSize: 11, fontWeight: 700, cursor: date ? 'pointer' : 'default', fontFamily: 'var(--font-body)' }}>
          Schedule
        </button>
        <button onClick={() => onSkip(s)}
          style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function WorkOrdersPage() {
  const navigate = useNavigate();

  const [profile, setProfile]         = useState<UserProfile | null>(null);
  const [company, setCompany]         = useState<Company | null>(null);
  const [techs, setTechs]             = useState<Tech[]>([]);
  const [workOrders, setWorkOrders]   = useState<WorkOrder[]>([]);
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [loading, setLoading]         = useState(true);
  const [running, setRunning]         = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [activeTab, setActiveTab]     = useState<'all' | 'today' | 'unscheduled' | 'completed'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [weekStart, setWeekStart]     = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Create WO form state
  const [cases, setCases]             = useState<{ id: string; case_number: string; lot_address: string; community: string }[]>([]);
  const [selectedCase, setSelectedCase] = useState('');
  const [selectedTech, setSelectedTech] = useState('');
  const [woDate, setWODate]           = useState('');
  const [woTime, setWOTime]           = useState('08:00');
  const [woIssue, setWOIssue]         = useState('');
  const [creatingWO, setCreatingWO]   = useState(false);

  // ── Fetch profile + company ──────────────────────────────────

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = await supabase.from('users')
      .select('id, company_id, access_level, first_name, last_name, is_owner')
      .eq('id', user.id).single();
    if (!p) return;
    setProfile(p as UserProfile);
    const { data: c } = await supabase.from('companies')
      .select('id, name, org_type')
      .eq('id', (p as UserProfile).company_id).single();
    if (c) setCompany(c as Company);
  }, []);

  // ── Fetch techs ──────────────────────────────────────────────

  const fetchTechs = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('techs')
      .select('id, name, phone, email, is_active')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .order('name');
    if (data) setTechs(data as Tech[]);
  }, [profile]);

  // ── Fetch work orders ────────────────────────────────────────

  const fetchWorkOrders = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data: wos } = await supabase
      .from('work_orders')
      .select(`
        id, company_id, case_id, lot_id, community_id, tech_id,
        status, priority, issue, description, address,
        scheduled_date, scheduled_time, duration_estimate,
        items_total, items_complete, homeowner_confirmed,
        homeowner_phone, cancellation_reason, cancelled_at,
        priority_score, total_cost, created_at
      `)
      .eq('company_id', profile.company_id)
      .order('priority_score', { ascending: false })
      .order('scheduled_date', { ascending: true, nullsFirst: false });

    if (!wos) { setLoading(false); return; }

    // Enrich with related data
    const techIds   = [...new Set((wos as WorkOrder[]).map(w => w.tech_id).filter(Boolean))];
    const caseIds   = [...new Set((wos as WorkOrder[]).map(w => w.case_id).filter(Boolean))];
    const lotIds    = [...new Set((wos as WorkOrder[]).map(w => w.lot_id).filter(Boolean))];
    const commIds   = [...new Set((wos as WorkOrder[]).map(w => w.community_id).filter(Boolean))];

    const [techsRes, casesRes, lotsRes, commsRes] = await Promise.all([
      techIds.length ? supabase.from('techs').select('id, name').in('id', techIds) : { data: [] },
      caseIds.length ? supabase.from('cases').select('id, case_number, brp_end_date').in('id', caseIds) : { data: [] },
      lotIds.length  ? supabase.from('warranty_lots').select('id, address, lot_number').in('id', lotIds) : { data: [] },
      commIds.length ? supabase.from('warranty_communities').select('id, name').in('id', commIds) : { data: [] },
    ]);

    const techMap: Record<string, string> = {};
    for (const t of (techsRes.data ?? []) as { id: string; name: string }[]) techMap[t.id] = t.name;

    const caseMap: Record<string, { case_number: string; brp_end_date: string | null }> = {};
    for (const c of (casesRes.data ?? []) as { id: string; case_number: string; brp_end_date: string | null }[]) caseMap[c.id] = c;

    const lotMap: Record<string, { address: string; lot_number: string }> = {};
    for (const l of (lotsRes.data ?? []) as { id: string; address: string; lot_number: string }[]) lotMap[l.id] = l;

    const commMap: Record<string, string> = {};
    for (const c of (commsRes.data ?? []) as { id: string; name: string }[]) commMap[c.id] = c.name;

    // Fetch items for each work order
    const woIds = (wos as WorkOrder[]).map(w => w.id);
    const { data: woItemLinks } = woIds.length ? await supabase
      .from('work_order_items')
      .select('work_order_id, warranty_item_id')
      .in('work_order_id', woIds) : { data: [] };

    const itemIds = [...new Set((woItemLinks ?? []).map((l: Record<string, string>) => l.warranty_item_id))];
    const { data: itemData } = itemIds.length ? await supabase
      .from('warranty_items')
      .select('id, item_number, room, description, status, warranty_decision, resolution_type, trade_required, trade_sequence, chargeable')
      .in('id', itemIds) : { data: [] };

    const itemMap: Record<string, WarrantyItem> = {};
    for (const item of (itemData ?? []) as WarrantyItem[]) itemMap[item.id] = item;

    const woItemsMap: Record<string, WarrantyItem[]> = {};
    for (const link of (woItemLinks ?? []) as { work_order_id: string; warranty_item_id: string }[]) {
      if (!woItemsMap[link.work_order_id]) woItemsMap[link.work_order_id] = [];
      if (itemMap[link.warranty_item_id]) woItemsMap[link.work_order_id].push(itemMap[link.warranty_item_id]);
    }

    const enriched: WorkOrder[] = (wos as WorkOrder[]).map(w => ({
      ...w,
      tech_name:      w.tech_id ? techMap[w.tech_id] : null,
      case_number:    w.case_id ? caseMap[w.case_id]?.case_number : null,
      brp_end_date:   w.case_id ? caseMap[w.case_id]?.brp_end_date : null,
      lot_address:    w.lot_id  ? lotMap[w.lot_id]?.address : null,
      lot_number:     w.lot_id  ? lotMap[w.lot_id]?.lot_number : null,
      community_name: w.community_id ? commMap[w.community_id] : null,
      items:          woItemsMap[w.id] ?? [],
    }));

    setWorkOrders(enriched);
    setLoading(false);
  }, [profile]);

  // ── Fetch cases for create WO ────────────────────────────────

  const fetchCases = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('cases')
      .select(`
        id, case_number,
        warranty_lots:lot_id ( address, warranty_communities:community_id ( name ) )
      `)
      .eq('company_id', profile.company_id)
      .not('status', 'in', '("resolved","closed","voided")')
      .order('created_at', { ascending: false });
    if (data) {
      setCases((data as Record<string, unknown>[]).map(c => {
        const lot  = c.warranty_lots as Record<string, unknown> | null;
        const comm = lot?.warranty_communities as Record<string, unknown> | null;
        return {
          id:          c.id as string,
          case_number: c.case_number as string,
          lot_address: lot?.address as string ?? '—',
          community:   comm?.name as string ?? '—',
        };
      }));
    }
  }, [profile]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => {
    if (profile) { fetchTechs(); fetchWorkOrders(); fetchCases(); }
  }, [profile, fetchTechs, fetchWorkOrders, fetchCases]);

  // ── Run AI schedule suggestions ──────────────────────────────

  async function handleRunSchedule() {
    if (!profile) return;
    setRunning(true);
    const { data } = await supabase.rpc('suggest_schedule', {
      p_company_id: profile.company_id,
      p_days_ahead: 5,
    });
    if (data?.success && data.suggestions) {
      setSuggestions(data.suggestions as ScheduleSuggestion[]);
    }
    setRunning(false);
  }

  // ── Accept suggestion → create work order ────────────────────

  async function handleAcceptSuggestion(s: ScheduleSuggestion, date: string) {
    if (!profile) return;

    // Find the case to get lot_id and community_id
    const { data: caseData } = await supabase
      .from('cases')
      .select('lot_id, warranty_lots:lot_id ( community_id )')
      .eq('id', s.case_id)
      .single();

    const lot       = (caseData as Record<string, unknown> | null)?.warranty_lots as Record<string, unknown> | null;
    const communityId = lot?.community_id as string ?? null;

    const { data: newWO } = await supabase.from('work_orders').insert({
      company_id:     profile.company_id,
      case_id:        s.case_id,
      lot_id:         (caseData as Record<string, unknown> | null)?.lot_id as string ?? null,
      community_id:   communityId,
      tech_id:        s.tech_id,
      status:         'scheduled',
      priority:       s.priority_score >= 60 ? 'urgent' : s.priority_score >= 30 ? 'high' : 'normal',
      issue:          `Warranty repair — ${s.lot_address}`,
      scheduled_date: date,
      scheduled_time: '08:00',
      priority_score: s.priority_score,
    }).select('id').single();

    if (newWO) {
      // Link warranted items to this work order
      const { data: items } = await supabase
        .from('warranty_items')
        .select('id, warranty_decision')
        .eq('case_id', s.case_id)
        .in('warranty_decision', ['warranted','not_sure','needs_investigation'])
        .not('status', 'eq', 'completed');

      if (items && items.length > 0) {
        await supabase.from('work_order_items').insert(
          (items as { id: string; warranty_decision: string }[]).map(item => ({
            company_id:      profile.company_id,
            work_order_id:   (newWO as { id: string }).id,
            warranty_item_id: item.id,
          }))
        );
        await supabase.from('work_orders').update({ items_total: items.length }).eq('id', (newWO as { id: string }).id);
      }
    }

    setSuggestions(prev => prev.filter(p => p.case_id !== s.case_id));
    fetchWorkOrders();
  }

  // ── Create manual work order ─────────────────────────────────

  async function handleCreateWO() {
    if (!profile || !selectedCase || !woIssue.trim()) return;
    setCreatingWO(true);

    const caseInfo = cases.find(c => c.id === selectedCase);
    const { data: caseData } = await supabase
      .from('cases')
      .select('lot_id, warranty_lots:lot_id ( community_id )')
      .eq('id', selectedCase).single();

    const lot         = (caseData as Record<string, unknown> | null)?.warranty_lots as Record<string, unknown> | null;
    const communityId = lot?.community_id as string ?? null;

    const { data: newWO } = await supabase.from('work_orders').insert({
      company_id:     profile.company_id,
      case_id:        selectedCase,
      lot_id:         (caseData as Record<string, unknown> | null)?.lot_id as string ?? null,
      community_id:   communityId,
      tech_id:        selectedTech || null,
      status:         woDate ? 'scheduled' : 'pending',
      priority:       'normal',
      issue:          woIssue.trim(),
      scheduled_date: woDate || null,
      scheduled_time: woDate ? woTime : null,
      address:        caseInfo?.lot_address ?? null,
      priority_score: 30, // Default to Medium priority for manual entries
        }).select('id').single();

    if (newWO) {
      // Auto-link outstanding warranted items
      const { data: items } = await supabase
        .from('warranty_items')
        .select('id')
        .eq('case_id', selectedCase)
        .in('warranty_decision', ['warranted','not_sure','needs_investigation'])
        .not('status', 'eq', 'completed');

      if (items && items.length > 0) {
        await supabase.from('work_order_items').insert(
          (items as { id: string }[]).map(item => ({
            company_id:      profile.company_id,
            work_order_id:   (newWO as { id: string }).id,
            warranty_item_id: item.id,
          }))
        );
        await supabase.from('work_orders').update({ items_total: items.length }).eq('id', (newWO as { id: string }).id);
      }
    }

    setCreatingWO(false);
    setShowCreate(false);
    setSelectedCase('');
    setSelectedTech('');
    setWODate('');
    setWOIssue('');
    fetchWorkOrders();
  }

  // ── Filtered work orders ─────────────────────────────────────

  const filtered = workOrders.filter(wo => {
    if (activeTab === 'today')       return wo.scheduled_date && isToday(new Date(wo.scheduled_date));
    if (activeTab === 'unscheduled') return !wo.scheduled_date && wo.status !== 'completed' && wo.status !== 'cancelled';
    if (activeTab === 'completed')   return wo.status === 'completed';
    if (statusFilter !== 'all')      return wo.status === statusFilter;
    return true;
  });

  const todayCount       = workOrders.filter(w => w.scheduled_date && isToday(new Date(w.scheduled_date))).length;
  const unscheduledCount = workOrders.filter(w => !w.scheduled_date && w.status !== 'completed' && w.status !== 'cancelled').length;

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid var(--color-border)', background: 'var(--color-mist)',
    fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)',
    outline: 'none', boxSizing: 'border-box' as const,
  };

  if (!profile) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-muted)', fontSize: 13 }}>Loading…</div>
  );

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1200, margin: '0 auto', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, padding: 0, fontFamily: 'var(--font-body)' }}>
            <ArrowLeft size={13} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: 2 }}>Work Orders</h1>
            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              {company?.org_type === 'small_builder' ? 'Trade scheduling mode' : 'Tech + trade scheduling'}
              {' · '}{workOrders.filter(w => w.status !== 'completed' && w.status !== 'cancelled').length} active
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchWorkOrders} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 7, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 11, fontFamily: 'var(--font-body)' }}>
            <RefreshCw size={11} />
          </button>
          <button onClick={handleRunSchedule} disabled={running}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: running ? 'var(--color-mist)' : 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)', color: '#9A6A16', fontSize: 12, fontWeight: 700, cursor: running ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
            {running ? '⏳ Running…' : '🤖 Suggest Schedule'}
          </button>
          <button onClick={() => setShowCreate(!showCreate)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 7, background: '#3F6A8F', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            <Plus size={13} /> New Work Order
          </button>
        </div>
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.2)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 16 }}>🤖</span>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#9A6A16' }}>Schedule Suggestions — {suggestions.length} lots ranked by priority</p>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 4 }}>Pick a date and confirm or skip each suggestion</p>
            <button onClick={() => setSuggestions([])} style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Dismiss all
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {suggestions.map((s, i) => (
              <SuggestionCard
                key={`${s.case_id}-${i}`}
                s={s}
                onAccept={handleAcceptSuggestion}
                onSkip={sg => setSuggestions(prev => prev.filter(p => p.case_id !== sg.case_id))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Portal visit checks */}
      <VisitChecksPanel />

      {/* Create WO form */}
      {showCreate && (
        <div style={{ padding: '18px 20px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)', marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 14 }}>New Work Order</p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4, display: 'block' }}>Case *</label>
              <select value={selectedCase} onChange={e => setSelectedCase(e.target.value)} style={inputStyle}>
                <option value="">— Select case —</option>
                {cases.map(c => <option key={c.id} value={c.id}>{c.lot_address} · #{c.case_number} · {c.community}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4, display: 'block' }}>
                {company?.org_type === 'small_builder' ? 'Trade' : 'Tech'}
              </label>
              <select value={selectedTech} onChange={e => setSelectedTech(e.target.value)} style={inputStyle}>
                <option value="">— Unassigned —</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4, display: 'block' }}>Date</label>
              <input type="date" value={woDate} onChange={e => setWODate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4, display: 'block' }}>Time</label>
              <select value={woTime} onChange={e => setWOTime(e.target.value)} style={inputStyle}>
                {TIME_SLOTS.map(t => <option key={t} value={t}>{fmt12(t)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4, display: 'block' }}>Description *</label>
            <input value={woIssue} onChange={e => setWOIssue(e.target.value)} placeholder="e.g. Initial warranty repair visit — all outstanding items"
              style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreateWO} disabled={creatingWO || !selectedCase || !woIssue.trim()}
              style={{ padding: '8px 20px', borderRadius: 7, background: selectedCase && woIssue ? '#3F6A8F' : 'var(--color-mist)', border: 'none', color: selectedCase && woIssue ? '#fff' : 'var(--color-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {creatingWO ? 'Creating…' : 'Create Work Order'}
            </button>
            <button onClick={() => setShowCreate(false)}
              style={{ padding: '8px 16px', borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--color-border)' }}>
        {([
          { key: 'all',         label: 'All Work Orders',     count: workOrders.length           },
          { key: 'today',       label: "Today's Schedule",    count: todayCount                  },
          { key: 'unscheduled', label: 'Unscheduled',         count: unscheduledCount            },
          { key: 'completed',   label: 'Completed',           count: workOrders.filter(w => w.status === 'completed').length },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 12,
            fontWeight: activeTab === tab.key ? 700 : 500,
            color: activeTab === tab.key ? 'var(--color-text)' : 'var(--color-muted)',
            borderBottom: activeTab === tab.key ? '2px solid #3F6A8F' : '2px solid transparent',
            marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 100, background: activeTab === tab.key ? 'rgba(30,95,164,0.15)' : 'var(--color-mist)', color: activeTab === tab.key ? '#3F6A8F' : 'var(--color-muted)' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}

        {/* Status filter */}
        {activeTab === 'all' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-mist)', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none' }}>
              <option value="all">All Statuses</option>
              {Object.entries(WO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Unscheduled alert */}
      {unscheduledCount > 0 && activeTab === 'all' && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.2)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={13} color="#9A6A16" />
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9A6A16' }}>
            {unscheduledCount} work order{unscheduledCount > 1 ? 's' : ''} not yet scheduled
          </p>
          <button onClick={() => setActiveTab('unscheduled')} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#9A6A16', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            View →
          </button>
        </div>
      )}

      {/* Work order list */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading work orders…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Wrench size={36} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
            {activeTab === 'today' ? "Nothing scheduled for today" :
             activeTab === 'unscheduled' ? "All work orders are scheduled" :
             activeTab === 'completed' ? "No completed work orders yet" :
             "No work orders yet"}
          </p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {activeTab === 'all' ? 'Click "Suggest Schedule" to have the AI prioritize your cases, or create a work order manually.' : ''}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Today grouping header */}
          {activeTab === 'today' && filtered.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
              {techs.filter(t => filtered.some(w => w.tech_id === t.id)).map(tech => (
                <div key={tech.id} style={{ padding: '5px 12px', borderRadius: 100, background: 'rgba(30,95,164,0.10)', border: '1px solid rgba(30,95,164,0.2)', fontSize: 11, fontWeight: 600, color: '#3F6A8F' }}>
                  👤 {tech.name} — {filtered.filter(w => w.tech_id === tech.id).length} lot{filtered.filter(w => w.tech_id === tech.id).length > 1 ? 's' : ''}
                </div>
              ))}
            </div>
          )}

          {filtered.map(wo => (
            <WOCard
              key={wo.id}
              wo={wo}
              profile={profile}
              techs={techs}
              isExpanded={expandedId === wo.id}
              onExpand={id => setExpandedId(expandedId === id ? null : id)}
              onUpdate={fetchWorkOrders}
            />
          ))}
        </div>
      )}
    </div>
  );
}