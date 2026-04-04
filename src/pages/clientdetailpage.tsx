import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Phone, Mail, MapPin, Building2, Calendar,
  FileText, DollarSign, Hammer, MessageSquare, Plus,
  ChevronRight, Edit2, MoreHorizontal, CheckCircle2,
  AlertTriangle, Clock, User, Briefcase, Shield, Download,
  Lock, Image, Receipt, ClipboardList,
} from 'lucide-react';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string;
  postal_code: string | null;
  property_type: string;
  lead_source: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  stage: string;
  status: string;
  value: number;
  completion_pct: number;
  start_date: string | null;
  end_date: string | null;
  type: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  amount_paid: number;
  due_date: string | null;
  created_at: string;
}

interface WorkOrder {
  id: string;
  call_type: string;
  issue: string;
  status: string;
  priority: string;
  scheduled_time: string | null;
  created_at: string;
}

interface Opportunity {
  id: string;
  name: string;
  value: number;
  stage: string;
  probability: number;
  created_at: string;
}

const STAGE_BADGE: Record<string, string> = {
  Sell:   'forge-badge--info',
  Define: 'forge-badge--neutral',
  Plan:   'forge-badge--neutral',
  Build:  'forge-badge--gold',
  Buy:    'forge-badge--gold',
  Bill:   'forge-badge--success',
  Closed: 'forge-badge--neutral',
};

const STATUS_BADGE: Record<string, string> = {
  active:   'forge-badge--success',
  blocked:  'forge-badge--danger',
  'on-hold':'forge-badge--warning',
  complete: 'forge-badge--neutral',
  queued:   'forge-badge--neutral',
  dispatched:'forge-badge--info',
  'en-route':'forge-badge--warning',
  'on-site':'forge-badge--gold',
};

const INV_BADGE: Record<string, string> = {
  draft:   'forge-badge--neutral',
  sent:    'forge-badge--info',
  paid:    'forge-badge--success',
  overdue: 'forge-badge--danger',
  partial: 'forge-badge--warning',
};

function formatMoney(v: number) {
  return '$' + v.toLocaleString('en-CA');
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionCard({ title, icon: Icon, action, children }: {
  title: string;
  icon: React.ElementType;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="forge-card" style={{ marginBottom: 16 }}>
      <div className="forge-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={14} color="#FCE205" strokeWidth={1.5} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        </div>
        {action && (
          <button
            className="forge-button forge-button--secondary forge-button--sm"
            onClick={action.onClick}
          >
            <Plus size={11} /> {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 12 }}>
      {message}
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [client, setClient]           = useState<Client | null>(null);
  const [projects, setProjects]       = useState<Project[]>([]);
  const [invoices, setInvoices]       = useState<Invoice[]>([]);
  const [workOrders, setWorkOrders]   = useState<WorkOrder[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'invoices' | 'calls' | 'vault' | 'notes'>('overview');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes]             = useState('');

  useEffect(() => {
    if (id) fetchAll(id);
  }, [id]);

  async function fetchAll(clientId: string) {
    setLoading(true);
    const [clientRes, projectRes, invoiceRes, woRes, oppRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).single(),
      supabase.from('projects').select('id, name, stage, status, value, completion_pct, start_date, end_date, type').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('invoices').select('id, invoice_number, status, total, amount_paid, due_date, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('work_orders').select('id, call_type, issue, status, priority, scheduled_time, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('opportunities').select('id, name, value, stage, probability, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
    ]);

    if (clientRes.data) {
      setClient(clientRes.data as Client);
      setNotes(clientRes.data.notes ?? '');
    }
    if (projectRes.data)  setProjects(projectRes.data as Project[]);
    if (invoiceRes.data)  setInvoices(invoiceRes.data as Invoice[]);
    if (woRes.data)       setWorkOrders(woRes.data as WorkOrder[]);
    if (oppRes.data)      setOpportunities(oppRes.data as Opportunity[]);
    setLoading(false);
  }

  async function saveNotes() {
    if (!id) return;
    await supabase.from('clients').update({ notes }).eq('id', id);
    setEditingNotes(false);
  }

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-muted)' }}>
        Loading client...
      </div>
    );
  }

  if (!client) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-muted)' }}>
        Client not found
      </div>
    );
  }

  const totalBilled   = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid     = invoices.reduce((s, i) => s + i.amount_paid, 0);
  const totalOutstanding = totalBilled - totalPaid;
  const activeProjects = projects.filter(p => p.status === 'active').length;

  const TABS = [
    { key: 'overview',  label: 'Overview'                        },
    { key: 'projects',  label: `Projects (${projects.length})`   },
    { key: 'invoices',  label: `Invoices (${invoices.length})`   },
    { key: 'calls',     label: `Calls (${workOrders.length})`    },
    { key: 'vault',     label: 'Vault & Defense'                 },
    { key: 'notes',     label: 'Notes'                           },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Back button */}
      <button
        className="forge-button forge-button--ghost forge-button--sm"
        onClick={() => navigate('/forge/clients')}
        style={{ marginBottom: 20, gap: 6 }}
      >
        <ArrowLeft size={13} /> Back to Clients
      </button>

      {/* Client header */}
      <div className="forge-card" style={{ marginBottom: 20, overflow: 'hidden' }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(252,226,5,0.08) 0%, rgba(252,226,5,0.02) 100%)',
          padding: '24px 24px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>

              {/* Avatar */}
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(252,226,5,0.15)',
                border: '2px solid rgba(252,226,5,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 800, color: '#8A7600',
                flexShrink: 0,
              }}>
                {client.first_name[0]}{client.last_name[0]}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
                    {client.first_name} {client.last_name}
                  </h1>
                  <span className={`forge-badge ${client.status === 'active' ? 'forge-badge--success' : 'forge-badge--neutral'}`}>
                    {client.status}
                  </span>
                  <span className="forge-badge forge-badge--neutral">{client.property_type}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  {client.phone && (
                    <a href={`tel:${client.phone}`} style={{ fontSize: 12, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      <Phone size={11} /> {client.phone}
                    </a>
                  )}
                  {client.email && (
                    <a href={`mailto:${client.email}`} style={{ fontSize: 12, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      <Mail size={11} /> {client.email}
                    </a>
                  )}
                  {client.address && (
                    <span style={{ fontSize: 12, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} /> {client.address}, {client.city}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="forge-button forge-button--secondary forge-button--sm">
                <Edit2 size={11} /> Edit
              </button>
              <button className="forge-button forge-button--primary forge-button--sm">
                <Plus size={11} /> New Project
              </button>
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 20 }}>
            {[
              { label: 'Total Billed',     value: formatMoney(totalBilled),       color: 'var(--color-text)'    },
              { label: 'Total Paid',       value: formatMoney(totalPaid),         color: 'var(--color-success)' },
              { label: 'Outstanding',      value: formatMoney(totalOutstanding),  color: totalOutstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)' },
              { label: 'Active Projects',  value: String(activeProjects),         color: '#8A7600'              },
            ].map(kpi => (
              <div key={kpi.label} style={{
                background: 'rgba(255,255,255,0.6)',
                borderRadius: 8, padding: '12px 14px',
                border: '1px solid var(--color-border)',
              }}>
                <p className="forge-label" style={{ marginBottom: 6 }}>{kpi.label}</p>
                <p style={{ fontSize: 18, fontWeight: 800, color: kpi.color, letterSpacing: '-0.02em', fontFamily: 'var(--font-mono)' }}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                padding: '11px 16px', fontSize: 12,
                fontWeight: activeTab === tab.key ? 700 : 400,
                color: activeTab === tab.key ? '#8A7600' : 'var(--color-muted)',
                background: activeTab === tab.key ? 'rgba(252,226,5,0.06)' : 'transparent',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: activeTab === tab.key ? '2px solid #FCE205' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Client info */}
          <SectionCard title="Client Information" icon={User}>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Full Name',     value: `${client.first_name} ${client.last_name}` },
                { label: 'Phone',         value: client.phone ?? '—'         },
                { label: 'Email',         value: client.email ?? '—'         },
                { label: 'Address',       value: client.address ? `${client.address}, ${client.city}, ${client.province}` : '—' },
                { label: 'Postal Code',   value: client.postal_code ?? '—'   },
                { label: 'Property Type', value: client.property_type        },
                { label: 'Lead Source',   value: client.lead_source ?? '—'   },
                { label: 'Client Since',  value: formatDate(client.created_at) },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="forge-label">{row.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500, textAlign: 'right', maxWidth: 200 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Opportunities */}
          <SectionCard title="Opportunities" icon={Briefcase} action={{ label: 'New', onClick: () => {} }}>
            {opportunities.length === 0 ? (
              <EmptyState message="No opportunities yet" />
            ) : (
              opportunities.map((opp, i) => (
                <div key={opp.id} style={{
                  padding: '12px 18px',
                  borderBottom: i < opportunities.length - 1 ? '1px solid var(--color-border)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>{opp.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>
                      {opp.probability}% probability · {formatDate(opp.created_at)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {formatMoney(opp.value)}
                    </span>
                    <span className={`forge-badge ${opp.stage === 'Won' ? 'forge-badge--success' : opp.stage === 'Lost' ? 'forge-badge--danger' : 'forge-badge--gold'}`}>
                      {opp.stage}
                    </span>
                  </div>
                </div>
              ))
            )}
          </SectionCard>

          {/* Recent projects */}
          <SectionCard title="Recent Projects" icon={Hammer}>
            {projects.length === 0 ? (
              <EmptyState message="No projects yet" />
            ) : (
              projects.slice(0, 3).map((p, i) => (
                <div key={p.id} style={{
                  padding: '12px 18px',
                  borderBottom: i < Math.min(projects.length, 3) - 1 ? '1px solid var(--color-border)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  cursor: 'pointer',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-mist)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span className={`forge-badge ${STAGE_BADGE[p.stage] ?? 'forge-badge--neutral'}`}>{p.stage}</span>
                      <span className={`forge-badge ${STATUS_BADGE[p.status] ?? 'forge-badge--neutral'}`}>{p.status}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{formatMoney(p.value)}</p>
                    <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>{p.completion_pct}% complete</p>
                  </div>
                </div>
              ))
            )}
          </SectionCard>

          {/* Recent invoices */}
          <SectionCard title="Recent Invoices" icon={DollarSign}>
            {invoices.length === 0 ? (
              <EmptyState message="No invoices yet" />
            ) : (
              invoices.slice(0, 3).map((inv, i) => (
                <div key={inv.id} style={{
                  padding: '12px 18px',
                  borderBottom: i < Math.min(invoices.length, 3) - 1 ? '1px solid var(--color-border)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>{inv.invoice_number}</p>
                    <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>Due {formatDate(inv.due_date)}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {formatMoney(inv.total)}
                    </span>
                    <span className={`forge-badge ${INV_BADGE[inv.status] ?? 'forge-badge--neutral'}`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </SectionCard>

        </div>
      )}

      {/* ── PROJECTS TAB ── */}
      {activeTab === 'projects' && (
        <SectionCard title="All Projects" icon={Hammer} action={{ label: 'New Project', onClick: () => {} }}>
          {projects.length === 0 ? (
            <EmptyState message="No projects for this client yet" />
          ) : (
            <table className="forge-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Progress</th>
                  <th>Timeline</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</td>
                    <td><span className="forge-badge forge-badge--neutral">{p.type}</span></td>
                    <td><span className={`forge-badge ${STAGE_BADGE[p.stage] ?? 'forge-badge--neutral'}`}>{p.stage}</span></td>
                    <td><span className={`forge-badge ${STATUS_BADGE[p.status] ?? 'forge-badge--neutral'}`}>{p.status}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatMoney(p.value)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ background: 'var(--color-mist)', borderRadius: 100, height: 4, width: 60, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${p.completion_pct}%`, borderRadius: 100, background: p.completion_pct >= 90 ? 'var(--color-success)' : '#8A7600' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{p.completion_pct}%</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                      {formatDate(p.start_date)} → {formatDate(p.end_date)}
                    </td>
                    <td><ChevronRight size={13} color="var(--color-muted)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      {/* ── INVOICES TAB ── */}
      {activeTab === 'invoices' && (
        <SectionCard title="All Invoices" icon={DollarSign} action={{ label: 'New Invoice', onClick: () => {} }}>
          {invoices.length === 0 ? (
            <EmptyState message="No invoices for this client yet" />
          ) : (
            <table className="forge-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Outstanding</th>
                  <th>Due Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{inv.invoice_number}</td>
                    <td><span className={`forge-badge ${INV_BADGE[inv.status] ?? 'forge-badge--neutral'}`}>{inv.status}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatMoney(inv.total)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>{formatMoney(inv.amount_paid)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: inv.total - inv.amount_paid > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {formatMoney(inv.total - inv.amount_paid)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>{formatDate(inv.due_date)}</td>
                    <td><ChevronRight size={13} color="var(--color-muted)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      {/* ── CALLS TAB ── */}
      {activeTab === 'calls' && (
        <SectionCard title="Service Calls & Work Orders" icon={Clock} action={{ label: 'New Call', onClick: () => {} }}>
          {workOrders.length === 0 ? (
            <EmptyState message="No service calls for this client yet" />
          ) : (
            <table className="forge-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {workOrders.map(wo => (
                  <tr key={wo.id} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{wo.issue}</td>
                    <td><span className="forge-badge forge-badge--neutral">{wo.call_type}</span></td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                        background: wo.priority === 'emergency' ? 'var(--color-danger-bg)' : wo.priority === 'high' ? 'var(--color-warning-bg)' : 'var(--color-mist)',
                        color: wo.priority === 'emergency' ? 'var(--color-danger)' : wo.priority === 'high' ? 'var(--color-warning)' : 'var(--color-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {wo.priority}
                      </span>
                    </td>
                    <td><span className={`forge-badge ${STATUS_BADGE[wo.status] ?? 'forge-badge--neutral'}`}>{wo.status}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>{formatDate(wo.scheduled_time)}</td>
                    <td><ChevronRight size={13} color="var(--color-muted)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}
{/* ── VAULT & DEFENSE TAB ── */}
{activeTab === 'vault' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Defense File Generator */}
          <div className="forge-card" style={{ overflow: 'hidden' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(252,226,5,0.10) 0%, rgba(252,226,5,0.03) 100%)',
              padding: '24px',
              borderBottom: '1px solid var(--color-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: 'rgba(252,226,5,0.15)',
                    border: '1px solid rgba(252,226,5,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Shield size={22} color="#8A7600" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                      Defense File Generator
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--color-text-sub)', maxWidth: 420 }}>
                      Compile a court-ready, tamper-proof PDF containing all evidence
                      for this client's projects. Each file is SHA-256 hashed and timestamped.
                    </p>
                  </div>
                </div>
              </div>

              {/* What gets included */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 20 }}>
                {[
                  { icon: FileText,      label: 'Contracts & Scope',    count: projects.length > 0 ? `${projects.length} projects` : 'None' },
                  { icon: Image,         label: 'Site Photos',          count: 'All field photos'    },
                  { icon: Mail,          label: 'Logged Emails',        count: 'All communications'  },
                  { icon: Receipt,       label: 'Invoices & Payments',  count: `${invoices.length} invoices` },
                  { icon: ClipboardList, label: 'Work Orders & Logs',   count: `${workOrders.length} records` },
                  { icon: Lock,          label: 'SHA-256 Hash Stamp',   count: 'Tamper-proof'        },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} style={{
                      background: 'rgba(255,255,255,0.7)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: '12px 14px',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <Icon size={14} color="#8A7600" strokeWidth={1.5} />
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</p>
                        <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>{item.count}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Per-project defense buttons */}
              <div style={{ marginTop: 20 }}>
                <p className="forge-label" style={{ marginBottom: 10 }}>Generate by Project</p>
                {projects.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>No projects found for this client.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {projects.map(p => (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'rgba(255,255,255,0.8)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Hammer size={13} color="#8A7600" strokeWidth={1.5} />
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              <span className={`forge-badge ${STAGE_BADGE[p.stage] ?? 'forge-badge--neutral'}`}>{p.stage}</span>
                              <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                                {formatMoney(p.value)} · {p.completion_pct}% complete
                              </span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="forge-button forge-button--secondary forge-button--sm"
                            onClick={() => navigate(`/forge/projects/${p.id}`)}
                          >
                            View Project
                          </button>
                          <button
                            className="forge-button forge-button--primary forge-button--sm"
                            onClick={() => alert(`Generating defense file for ${p.name}...\n\nThis will compile all evidence into a court-ready PDF. Full implementation coming in the Vault module.`)}
                            style={{ gap: 5 }}
                          >
                            <Download size={11} /> Generate Defense File
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Full client defense */}
              <div style={{
                marginTop: 16, padding: '14px 16px',
                background: 'rgba(252,226,5,0.06)',
                border: '1px solid rgba(252,226,5,0.2)',
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>Full Client Defense Package</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 2 }}>
                    All projects, all evidence, all communications in one PDF
                  </p>
                </div>
                <button
                  className="forge-button forge-button--primary"
                  onClick={() => alert(`Generating full defense package for ${client.first_name} ${client.last_name}...\n\nThis will compile everything across all projects into one court-ready PDF.`)}
                  style={{ gap: 6 }}
                >
                  <Shield size={13} /> Generate Full Package
                </button>
              </div>
            </div>
          </div>

          {/* Previous defense files */}
          <SectionCard title="Previously Generated Files" icon={FileText}>
            <div style={{ padding: '20px 18px', textAlign: 'center' }}>
              <Lock size={24} color="var(--color-muted)" style={{ marginBottom: 10 }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
                No defense files generated yet
              </p>
              <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                Generated files are stored permanently with tamper-proof timestamps
              </p>
            </div>
          </SectionCard>

        </div>
      )}
      {/* ── NOTES TAB ── */}
      {activeTab === 'notes' && (
        <SectionCard title="Client Notes" icon={MessageSquare}>
          <div style={{ padding: '18px' }}>
            {editingNotes ? (
              <div>
                <textarea
                  style={{
                    width: '100%', minHeight: 200, padding: '12px',
                    borderRadius: 8, border: '1px solid var(--color-border)',
                    fontSize: 13, fontFamily: 'var(--font-body)',
                    color: 'var(--color-text)', resize: 'vertical',
                    background: 'var(--color-panel)',
                  }}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes about this client..."
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="forge-button forge-button--primary forge-button--sm" onClick={saveNotes}>
                    Save Notes
                  </button>
                  <button className="forge-button forge-button--secondary forge-button--sm" onClick={() => setEditingNotes(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {notes ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{notes}</p>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--color-muted)', fontStyle: 'italic' }}>No notes yet. Click Edit to add notes about this client.</p>
                )}
                <button
                  className="forge-button forge-button--secondary forge-button--sm"
                  onClick={() => setEditingNotes(true)}
                  style={{ marginTop: 14 }}
                >
                  <Edit2 size={11} /> Edit Notes
                </button>
              </div>
            )}
          </div>
        </SectionCard>
      )}

    </div>
  );
}