import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Plus, Search, Phone, MapPin, Clock,
  CheckCircle2, AlertTriangle, Circle, Truck, Zap,
  User, Calendar, MoreHorizontal, Radio, Navigation, X,
} from 'lucide-react';

type CallStatus = 'queued' | 'dispatched' | 'en-route' | 'on-site' | 'complete' | 'cancelled';

interface Technician {
  id: string;
  initials: string | null;
  full_name: string;
  trade: string | null;
  status: string;
  phone: string | null;
  last_seen: string | null;
}

interface WorkOrder {
  id: string;
  call_type: string;
  issue: string;
  address: string;
  city: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  scheduled_time: string | null;
  estimated_duration: string | null;
  notes: string | null;
  created_at: string;
  clients?: { first_name: string; last_name: string; phone: string | null } | null;
  staff_id?: string | null;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  emergency: { label: 'Emergency', color: '#F05252', bg: 'rgba(240,82,82,0.10)'   },
  high:      { label: 'High',      color: '#B86A00', bg: 'rgba(184,106,0,0.10)'   },
  normal:    { label: 'Normal',    color: '#4A4640', bg: 'rgba(74,70,64,0.08)'    },
  low:       { label: 'Low',       color: '#8C8680', bg: 'rgba(140,134,128,0.08)' },
};

const STATUS_CONFIG: Record<string, { label: string; badge: string; icon: React.ElementType }> = {
  queued:     { label: 'Queued',     badge: 'forge-badge--neutral', icon: Circle       },
  dispatched: { label: 'Dispatched', badge: 'forge-badge--info',    icon: Radio        },
  'en-route': { label: 'En Route',   badge: 'forge-badge--warning', icon: Truck        },
  'on-site':  { label: 'On Site',    badge: 'forge-badge--gold',    icon: Zap          },
  complete:   { label: 'Complete',   badge: 'forge-badge--success', icon: CheckCircle2 },
  cancelled:  { label: 'Cancelled',  badge: 'forge-badge--danger',  icon: AlertTriangle},
};

const TYPE_COLOR: Record<string, string> = {
  Emergency:  '#F05252',
  Service:    '#FCE205',
  Estimate:   '#60A5FA',
  'Follow-up':'#2D7A50',
};

const TECH_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: 'Available', color: '#2D7A50', bg: 'rgba(45,122,80,0.12)'  },
  'on-job':  { label: 'On Job',    color: '#8A7600', bg: 'rgba(138,118,0,0.12)'  },
  driving:   { label: 'Driving',   color: '#1E5FA4', bg: 'rgba(30,95,164,0.12)'  },
  off:       { label: 'Off',       color: '#8C8680', bg: 'rgba(140,134,128,0.10)'},
};
function getLocationStatus(lastSeen: string | null): {
  color: string; label: string; dot: string;
} {
  if (!lastSeen) return { color: '#C8C2B4', label: 'No signal', dot: '#C8C2B4' };
  const mins = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  if (mins < 5)  return { color: '#2D7A50', label: `${Math.round(mins)}m ago`, dot: '#2D7A50' };
  if (mins < 30) return { color: '#B86A00', label: `${Math.round(mins)}m ago`, dot: '#B86A00' };
  return { color: '#B53D3D', label: `${Math.round(mins)}m ago`, dot: '#B53D3D' };
}

function openGoogleMaps(address: string, city?: string | null) {
  const full = city ? `${address}, ${city}, ON` : `${address}, ON`;
  const encoded = encodeURIComponent(full);
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`,
    '_blank'
  );
}

const EMPTY_FORM = {
  client_id: '',
  call_type: 'Service',
  issue: '',
  address: '',
  city: '',
  priority: 'normal',
  assigned_to: '',
  scheduled_time: '',
  estimated_duration: '',
  notes: '',
};

export default function DispatchPage() {
  const [workOrders, setWorkOrders]   = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [clients, setClients]         = useState<Client[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [showModal, setShowModal]     = useState(false);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('dispatch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchData() {
    setLoading(true);
    const [woRes, techRes, clientRes] = await Promise.all([
      supabase
  .from('work_orders')
  .select('*, clients(first_name, last_name, phone)')
  .order('created_at', { ascending: false }),
      supabase.from('staff').select('id, full_name, initials, trade, status, phone, last_seen'),
      supabase.from('clients').select('id, first_name, last_name, phone, address, city'),
    ]);
    if (woRes.data)     setWorkOrders(woRes.data as WorkOrder[]);
    if (techRes.data)   setTechnicians(techRes.data as Technician[]);
    if (clientRes.data) setClients(clientRes.data as Client[]);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await supabase
      .from('work_orders')
      .update({
        status,
        ...(status === 'complete' ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq('id', id);
  }

  async function assignTech(workOrderId: string, techId: string) {
    await supabase
      .from('work_orders')
      .update({ staff_id: techId, status: 'dispatched' })
      .eq('id', workOrderId);
  }

  /* Auto-fill address when client is selected */
  function handleClientChange(clientId: string) {
    const client = clients.find(c => c.id === clientId);
    setForm(f => ({
      ...f,
      client_id: clientId,
      address: client?.address ?? f.address,
      city: client?.city ?? f.city,
    }));
  }

  async function handleSubmit() {
    if (!form.issue.trim()) { setError('Issue description is required'); return; }
    if (!form.address.trim()) { setError('Address is required'); return; }
    setError('');
    setSaving(true);

    const payload: Record<string, unknown> = {
      call_type:          form.call_type,
      issue:              form.issue,
      address:            form.address,
      city:               form.city || null,
      priority:           form.priority,
      status:             form.assigned_to ? 'dispatched' : 'queued',
      notes:              form.notes || null,
      estimated_duration: form.estimated_duration || null,
      scheduled_time:     form.scheduled_time ? new Date(form.scheduled_time).toISOString() : null,
    };

    if (form.client_id)   payload.client_id   = form.client_id;
    if (form.assigned_to) payload.assigned_to  = form.assigned_to;

    /* Get company_id from current user */
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .single();
      if (profile) payload.company_id = profile.company_id;
    }

    const { error: insertError } = await supabase.from('work_orders').insert(payload);

    if (insertError) {
      setError(insertError.message);
    } else {
      setShowModal(false);
      setForm(EMPTY_FORM);
      fetchData();
    }
    setSaving(false);
  }

  const filtered = workOrders.filter(c => {
    const matchStatus = filterStatus === 'All' || c.status === filterStatus;
    const clientName = c.clients ? `${c.clients.first_name} ${c.clients.last_name}` : '';
    const matchSearch =
      clientName.toLowerCase().includes(search.toLowerCase()) ||
      c.issue.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const queuedCount    = workOrders.filter(c => c.status === 'queued').length;
  const activeCount    = workOrders.filter(c => ['dispatched','en-route','on-site'].includes(c.status)).length;
  const completeCount  = workOrders.filter(c => c.status === 'complete').length;
  const availableTechs = technicians.filter(t => t.status === 'available').length;

  const inputStyle = {
    width: '100%', height: 36, padding: '0 12px',
    borderRadius: 8, border: '1px solid var(--color-border)',
    background: 'var(--color-panel)', color: 'var(--color-text)',
    fontSize: 13, fontFamily: 'var(--font-body)',
  };

  const labelStyle = {
    fontSize: 10, fontWeight: 600 as const,
    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    color: 'var(--color-muted)', marginBottom: 6, display: 'block',
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── New Call Modal ── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            background: 'var(--color-panel)',
            borderRadius: 14,
            width: '100%', maxWidth: 560,
            boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}>

            {/* Modal header */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(252,226,5,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radio size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Call</span>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={16} color="var(--color-muted)" />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Call type + Priority row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Call Type</label>
                  <select
                    style={inputStyle}
                    value={form.call_type}
                    onChange={e => setForm(f => ({ ...f, call_type: e.target.value }))}
                  >
                    <option>Service</option>
                    <option>Estimate</option>
                    <option>Emergency</option>
                    <option>Follow-up</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <select
                    style={inputStyle}
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
              </div>

              {/* Client */}
              <div>
                <label style={labelStyle}>Client</label>
                <select
                  style={inputStyle}
                  value={form.client_id}
                  onChange={e => handleClientChange(e.target.value)}
                >
                  <option value="">Select client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Issue */}
              <div>
                <label style={labelStyle}>Issue / Description *</label>
                <textarea
                  style={{ ...inputStyle, height: 80, padding: '10px 12px', resize: 'vertical' }}
                  placeholder="Describe the issue or job required..."
                  value={form.issue}
                  onChange={e => setForm(f => ({ ...f, issue: e.target.value }))}
                />
              </div>

              {/* Address row */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Address *</label>
                  <input
                    style={inputStyle}
                    placeholder="123 Main St"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <input
                    style={inputStyle}
                    placeholder="Toronto"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  />
                </div>
              </div>

              {/* Schedule + Duration row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Scheduled Time</label>
                  <input
                    type="datetime-local"
                    style={inputStyle}
                    value={form.scheduled_time}
                    onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Est. Duration</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. 2h, 45m"
                    value={form.estimated_duration}
                    onChange={e => setForm(f => ({ ...f, estimated_duration: e.target.value }))}
                  />
                </div>
              </div>

              {/* Assign to */}
              <div>
                <label style={labelStyle}>Assign To (optional)</label>
                <select
                  style={inputStyle}
                  value={form.assigned_to}
                  onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                >
                  <option value="">Leave unassigned (queued)</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} — {t.trade ?? 'Technician'} ({t.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Internal Notes</label>
                <textarea
                  style={{ ...inputStyle, height: 64, padding: '10px 12px', resize: 'vertical' }}
                  placeholder="Any additional notes for the tech..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--color-danger-bg)',
                  border: '1px solid #DDB0B0',
                  color: 'var(--color-danger)', fontSize: 12,
                }}>
                  {error}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '14px 22px',
              borderTop: '1px solid var(--color-border)',
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              background: 'var(--color-panel-raised)',
            }}>
              <button
                className="forge-button forge-button--secondary"
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setError(''); }}
              >
                Cancel
              </button>
              <button
                className="forge-button forge-button--primary"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? 'Creating...' : form.assigned_to ? 'Create & Dispatch' : 'Create Call'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p className="forge-label" style={{ marginBottom: 4 }}>Operations</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Dispatch Board</h1>
          <p className="forge-subtitle" style={{ marginTop: 2 }}>
            {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}{activeCount} active · {queuedCount} queued · {availableTechs} techs available
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="forge-button forge-button--secondary">
            <Calendar size={13} /> Schedule View
          </button>
          <button className="forge-button forge-button--primary" onClick={() => setShowModal(true)}>
            <Plus size={13} /> New Call
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'In Queue',        value: String(queuedCount),    sub: 'awaiting dispatch',      color: 'var(--color-warning)' },
          { label: 'Active Today',    value: String(activeCount),    sub: 'dispatched or on site',  color: '#8A7600'              },
          { label: 'Completed Today', value: String(completeCount),  sub: 'calls closed',           color: 'var(--color-success)' },
          { label: 'Techs Available', value: String(availableTechs), sub: `of ${technicians.length} total`, color: 'var(--color-info)' },
        ].map(kpi => (
          <div key={kpi.label} className="forge-card" style={{ padding: '16px 18px' }}>
            <p className="forge-label" style={{ marginBottom: 8 }}>{kpi.label}</p>
            <p style={{ fontSize: 26, fontWeight: 800, color: kpi.color, letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{kpi.value}</p>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Main layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* LEFT — Call board */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
              <input
                className="forge-input"
                placeholder="Search calls, clients..."
                style={{ paddingLeft: 30 }}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {(['All', 'queued', 'dispatched', 'en-route', 'on-site', 'complete'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: filterStatus === s ? 700 : 400,
                  borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: filterStatus === s ? 'rgba(252,226,5,0.12)' : 'transparent',
                  border: filterStatus === s ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)',
                  color: filterStatus === s ? '#8A7600' : 'var(--color-muted)',
                  transition: 'all 0.12s',
                }}
              >
                {s === 'All' ? 'All' : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>

          {loading && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--color-muted)' }}>
              Loading dispatch board...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="forge-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <Radio size={28} color="var(--color-muted)" style={{ marginBottom: 12 }} />
              <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>No calls found</p>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16 }}>
                {filterStatus !== 'All' ? 'Try changing the filter' : 'Create your first work order to get started'}
              </p>
              <button className="forge-button forge-button--primary" onClick={() => setShowModal(true)}>
                <Plus size={13} /> New Call
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(call => {
              const clientName  = call.clients ? `${call.clients.first_name} ${call.clients.last_name}` : 'Unknown Client';
              const clientPhone = call.clients?.phone ?? '—';
              const tech = technicians.find(t => t.id === call.staff_id) ?? null;
              const isUrgent    = call.priority === 'emergency' || call.priority === 'high';
              const priorityCfg = PRIORITY_CONFIG[call.priority] ?? PRIORITY_CONFIG.normal;
              const statusCfg   = STATUS_CONFIG[call.status]   ?? STATUS_CONFIG.queued;
              const typeColor   = TYPE_COLOR[call.call_type]   ?? '#8C8680';

              return (
                <div key={call.id} className="forge-card" style={{
                  padding: '16px 18px',
                  borderLeft: `3px solid ${priorityCfg.color}`,
                  cursor: 'pointer',
                  opacity: call.status === 'complete' ? 0.65 : 1,
                }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

                    <div style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      background: `${typeColor}15`, border: `1px solid ${typeColor}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {call.call_type === 'Emergency' && <AlertTriangle size={14} color={typeColor} strokeWidth={2} />}
                      {call.call_type === 'Service'   && <Zap           size={14} color={typeColor} strokeWidth={2} />}
                      {call.call_type === 'Estimate'  && <User          size={14} color={typeColor} strokeWidth={2} />}
                      {call.call_type === 'Follow-up' && <CheckCircle2  size={14} color={typeColor} strokeWidth={2} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{clientName}</span>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                          {call.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={`forge-badge ${statusCfg.badge}`}>{statusCfg.label}</span>
                        {isUrgent && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100,
                            background: priorityCfg.bg, color: priorityCfg.color,
                            border: `1px solid ${priorityCfg.color}30`,
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>
                            {priorityCfg.label}
                          </span>
                        )}
                      </div>

                      <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 6, fontWeight: 500 }}>{call.issue}</p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => openGoogleMaps(call.address, call.city)}
                          style={{
                            fontSize: 11, color: '#1E5FA4', display: 'flex', alignItems: 'center', gap: 4,
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
                          }}
                        >
                          <MapPin size={10} /> {call.address}{call.city ? `, ${call.city}` : ''}
                        </button>
                        {call.scheduled_time && (
                          <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={10} />
                            {new Date(call.scheduled_time).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                            {call.estimated_duration ? ` · ${call.estimated_duration}` : ''}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Phone size={10} /> {clientPhone}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                      {tech ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'rgba(252,226,5,0.15)', border: '1px solid rgba(252,226,5,0.35)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: '#8A7600',
                          }}>
                            {tech.initials ?? tech.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>{tech.full_name}</p>
                            <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 1 }}>{tech.trade}</p>
                          </div>
                        </div>
                      ) : (
                        <select
                          onChange={e => { if (e.target.value) assignTech(call.id, e.target.value); }}
                          style={{
                            fontSize: 11, padding: '5px 8px', borderRadius: 6,
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-panel)', color: 'var(--color-text)', cursor: 'pointer',
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Assign tech...</option>
                          {technicians.map(t => (
                            <option key={t.id} value={t.id}>{t.full_name} ({t.status})</option>
                          ))}
                        </select>
                      )}

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="forge-button forge-button--secondary forge-button--sm"
                          onClick={() => openGoogleMaps(call.address, call.city)}
                          style={{ gap: 4 }}
                        >
                          <Navigation size={11} /> Directions
                        </button>

                        {call.status === 'queued' && (
                          <button className="forge-button forge-button--primary forge-button--sm" onClick={() => updateStatus(call.id, 'dispatched')}>
                            Dispatch
                          </button>
                        )}
                        {call.status === 'dispatched' && (
                          <button className="forge-button forge-button--primary forge-button--sm" onClick={() => updateStatus(call.id, 'en-route')}>
                            En Route
                          </button>
                        )}
                        {call.status === 'en-route' && (
                          <button className="forge-button forge-button--primary forge-button--sm" onClick={() => updateStatus(call.id, 'on-site')}>
                            On Site
                          </button>
                        )}
                        {call.status === 'on-site' && (
                          <button className="forge-button forge-button--primary forge-button--sm" onClick={() => updateStatus(call.id, 'complete')}>
                            Complete
                          </button>
                        )}
                        <button className="forge-icon-button" style={{ width: 28, height: 28 }}>
                          <MoreHorizontal size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Crew board */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="forge-card">
            <div className="forge-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Truck size={13} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Crew Status</span>
              </div>
              <span className="forge-badge forge-badge--success">{availableTechs} free</span>
            </div>

            {loading && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-muted)', fontSize: 12 }}>
                Loading crew...
              </div>
            )}

            {!loading && technicians.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-muted)', fontSize: 12 }}>
                No technicians found — add team members in Settings
              </div>
            )}

{technicians.map((tech, i) => {
  const cfg = TECH_STATUS_CONFIG[tech.status] ?? TECH_STATUS_CONFIG.off;
  const loc = getLocationStatus(tech.last_seen);
  return (
    <div key={tech.id} style={{
      padding: '12px 16px',
      borderBottom: i < technicians.length - 1 ? '1px solid var(--color-border)' : 'none',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {/* Avatar with location pulse */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: cfg.bg, border: `1px solid ${cfg.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: cfg.color,
        }}>
          {tech.initials ?? tech.full_name.slice(0, 2).toUpperCase()}
        </div>
        {/* Location dot */}
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 9, height: 9, borderRadius: '50%',
          background: loc.dot,
          border: '1.5px solid var(--color-panel)',
          boxShadow: tech.last_seen && (Date.now() - new Date(tech.last_seen).getTime()) < 300000
            ? `0 0 6px ${loc.dot}` : 'none',
        }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{tech.full_name}</p>
        <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>{tech.trade ?? 'Technician'}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 100,
          background: cfg.bg, color: cfg.color,
          border: `1px solid ${cfg.color}30`,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {cfg.label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: loc.dot,
          }} />
          <span style={{ fontSize: 9, color: loc.color }}>{loc.label}</span>
        </div>
      </div>
    </div>
  );
})}
          </div>

          <div className="forge-card">
            <div className="forge-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Radio size={13} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Live Updates</span>
              </div>
            </div>
            {workOrders.slice(0, 5).map((wo, i) => (
              <div key={wo.id} style={{
                padding: '10px 16px',
                borderBottom: i < 4 ? '1px solid var(--color-border)' : 'none',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                  background: wo.status === 'complete' ? 'var(--color-success)'
                    : wo.status === 'cancelled' ? 'var(--color-danger)' : '#FCE205',
                }} />
                <div>
                  <p style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.4 }}>
                    <strong style={{ fontWeight: 600 }}>
                      {wo.clients ? `${wo.clients.first_name} ${wo.clients.last_name}` : 'Unknown'}
                    </strong>
                    {' — '}{wo.issue}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>
                    {new Date(wo.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{STATUS_CONFIG[wo.status]?.label ?? wo.status}
                  </p>
                </div>
              </div>
            ))}
            {!loading && workOrders.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 12 }}>
                No activity yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}