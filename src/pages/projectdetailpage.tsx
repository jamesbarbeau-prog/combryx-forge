import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Hammer, MapPin, Calendar, DollarSign,
  FileText, Camera, Mail, Receipt, ClipboardList,
  Shield, Download, Lock, Plus, ChevronRight,
  CheckCircle2, AlertTriangle, Clock, Edit2,
  User, Package, Zap, MoreHorizontal, Image,
} from 'lucide-react';

/* ─── Types ─── */
interface Project {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  province: string;
  value: number;
  stage: string;
  status: string;
  type: string;
  completion_pct: number;
  holdback_pct: number;
  holdback_released: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  clients?: { first_name: string; last_name: string; phone: string | null; email: string | null } | null;
}

interface ScopeItem {
  id: string;
  section: string;
  description: string;
  item_type: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  is_optional: boolean;
  approved: boolean;
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

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  amount_paid: number;
  holdback_amount: number;
  due_date: string | null;
  created_at: string;
}

interface FieldLog {
  id: string;
  log_type: string;
  content: string | null;
  photo_url: string | null;
  created_at: string;
}

interface Permit {
  id: string;
  permit_type: string;
  status: string;
  permit_number: string | null;
  applied_date: string | null;
  approved_date: string | null;
  inspection_date: string | null;
  inspection_result: string | null;
}

/* ─── Config ─── */
const STAGES = ['Sell', 'Define', 'Plan', 'Build', 'Buy', 'Bill', 'Closed'];

const STAGE_COLORS: Record<string, string> = {
  Sell:   '#60A5FA',
  Define: '#8C8680',
  Plan:   '#8C8680',
  Build:  '#FCE205',
  Buy:    '#FCE205',
  Bill:   '#2D7A50',
  Closed: '#C8C2B4',
};

const STATUS_BADGE: Record<string, string> = {
  active:    'forge-badge--success',
  blocked:   'forge-badge--danger',
  'on-hold': 'forge-badge--warning',
  complete:  'forge-badge--neutral',
};

const PERMIT_BADGE: Record<string, string> = {
  not_applied: 'forge-badge--neutral',
  applied:     'forge-badge--info',
  approved:    'forge-badge--success',
  failed:      'forge-badge--danger',
  expired:     'forge-badge--danger',
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
          <button className="forge-button forge-button--secondary forge-button--sm" onClick={action.onClick}>
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
    <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 12 }}>
      {message}
    </div>
  );
}

/* ─── Stage Gate Bar ─── */
function StageGateBar({ currentStage, onAdvance }: { currentStage: string; onAdvance: (stage: string) => void }) {
  const currentIdx = STAGES.indexOf(currentStage);
  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
      <p className="forge-label" style={{ marginBottom: 10 }}>Project Stage</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STAGES.map((stage, i) => {
          const isPast    = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isFuture  = i > currentIdx;
          const color     = STAGE_COLORS[stage];
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <button
                onClick={() => onAdvance(stage)}
                title={`Move to ${stage}`}
                style={{
                  flex: 1, padding: '8px 4px', textAlign: 'center',
                  fontSize: 10, fontWeight: isCurrent ? 700 : 500,
                  borderRadius: i === 0 ? '6px 0 0 6px' : i === STAGES.length - 1 ? '0 6px 6px 0' : '0',
                  border: 'none',
                  background: isPast ? 'rgba(45,122,80,0.15)' : isCurrent ? `${color}25` : 'var(--color-mist)',
                  color: isPast ? '#2D7A50' : isCurrent ? color : 'var(--color-muted)',
                  borderTop: isCurrent ? `2px solid ${color}` : '2px solid transparent',
                  cursor: isFuture ? 'pointer' : 'default',
                  transition: 'all 0.12s',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {isPast ? '✓ ' : ''}{stage}
              </button>
              {i < STAGES.length - 1 && (
                <div style={{ width: 1, height: 32, background: 'var(--color-border)', flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Page ─── */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject]       = useState<Project | null>(null);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [fieldLogs, setFieldLogs]   = useState<FieldLog[]>([]);
  const [permits, setPermits]       = useState<Permit[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<'overview' | 'scope' | 'field' | 'invoices' | 'permits' | 'vault'>('overview');
  const [generatingDefense, setGeneratingDefense] = useState(false);

  useEffect(() => { if (id) fetchAll(id); }, [id]);

  async function fetchAll(projectId: string) {
    setLoading(true);
    const [projRes, scopeRes, woRes, invRes, logRes, permitRes] = await Promise.all([
      supabase.from('projects').select('*, clients(first_name, last_name, phone, email)').eq('id', projectId).single(),
      supabase.from('scope_items').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('work_orders').select('id, call_type, issue, status, priority, scheduled_time, created_at').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('invoices').select('id, invoice_number, status, total, amount_paid, holdback_amount, due_date, created_at').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('field_logs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('permits').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]);

    if (projRes.data)   setProject(projRes.data as Project);
    if (scopeRes.data)  setScopeItems(scopeRes.data as ScopeItem[]);
    if (woRes.data)     setWorkOrders(woRes.data as WorkOrder[]);
    if (invRes.data)    setInvoices(invRes.data as Invoice[]);
    if (logRes.data)    setFieldLogs(logRes.data as FieldLog[]);
    if (permitRes.data) setPermits(permitRes.data as Permit[]);
    setLoading(false);
  }

  async function advanceStage(stage: string) {
    if (!id || !project) return;
    const currentIdx = STAGES.indexOf(project.stage);
    const newIdx = STAGES.indexOf(stage);
    if (newIdx <= currentIdx) return;
    await supabase.from('projects').update({ stage }).eq('id', id);
    setProject(p => p ? { ...p, stage } : p);
  }

  async function generateDefenseFile() {
    if (!project) return;
    setGeneratingDefense(true);

    const items = [
      ...scopeItems.map(s => ({ entity_type: 'scope_item', entity_id: s.id, label: s.description })),
      ...invoices.map(i => ({ entity_type: 'invoice', entity_id: i.id, label: i.invoice_number })),
      ...workOrders.map(w => ({ entity_type: 'work_order', entity_id: w.id, label: w.issue })),
      ...fieldLogs.map(f => ({ entity_type: 'field_log', entity_id: f.id, label: f.content ?? 'Field log' })),
      ...permits.map(p => ({ entity_type: 'permit', entity_id: p.id, label: p.permit_type })),
    ];

    const { data: defenseFile } = await supabase
      .from('defense_files')
      .insert({
        project_id: id,
        company_id: '00000000-0000-0000-0000-000000000001',
        title: `Defense File — ${project.name}`,
        description: `Generated ${new Date().toLocaleDateString('en-CA')}`,
        status: 'compiled',
        compiled_at: new Date().toISOString(),
        item_count: items.length,
        includes_emails: true,
        includes_photos: true,
        includes_invoices: true,
        includes_permits: true,
        includes_communications: true,
      })
      .select()
      .single();

    if (defenseFile && items.length > 0) {
      await supabase.from('defense_file_items').insert(
        items.map((item, i) => ({
          defense_file_id: defenseFile.id,
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          label: item.label,
          sort_order: i,
        }))
      );
    }

    setGeneratingDefense(false);
    setActiveTab('vault');
    alert(`✅ Defense file generated successfully!\n\n${items.length} items compiled:\n• ${scopeItems.length} scope items\n• ${invoices.length} invoices\n• ${workOrders.length} work orders\n• ${fieldLogs.length} field logs\n• ${permits.length} permits\n\nView in the Vault tab.`);
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-muted)' }}>Loading project...</div>
  );
  if (!project) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-muted)' }}>Project not found</div>
  );

  const scopeTotal    = scopeItems.reduce((s, i) => s + i.total, 0);
  const invoiceTotal  = invoices.reduce((s, i) => s + i.total, 0);
  const paidTotal     = invoices.reduce((s, i) => s + i.amount_paid, 0);
  const holdbackTotal = invoices.reduce((s, i) => s + i.holdback_amount, 0);
  const outstanding   = invoiceTotal - paidTotal;

  const TABS = [
    { key: 'overview', label: 'Overview'                         },
    { key: 'scope',    label: `Scope (${scopeItems.length})`     },
    { key: 'field',    label: `Field Logs (${fieldLogs.length})` },
    { key: 'invoices', label: `Invoices (${invoices.length})`    },
    { key: 'permits',  label: `Permits (${permits.length})`      },
    { key: 'vault',    label: '🛡 Vault'                         },
  ];

  const jobFileHealth = [
    { label: 'Scope defined',     ok: scopeItems.length > 0,                                      },
    { label: 'Invoices issued',   ok: invoices.length > 0,                                        },
    { label: 'Field logs present',ok: fieldLogs.length > 0,                                       },
    { label: 'Permits tracked',   ok: permits.length > 0,                                         },
    { label: 'Work orders logged',ok: workOrders.length > 0,                                      },
    { label: 'Holdback tracked',  ok: holdbackTotal > 0,                                          },
  ];

  const healthScore = Math.round((jobFileHealth.filter(h => h.ok).length / jobFileHealth.length) * 100);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Back */}
      <button
        className="forge-button forge-button--ghost forge-button--sm"
        onClick={() => navigate('/forge/projects')}
        style={{ marginBottom: 20, gap: 6 }}
      >
        <ArrowLeft size={13} /> Back to Projects
      </button>

      {/* Project header card */}
      <div className="forge-card" style={{ marginBottom: 20, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(252,226,5,0.08) 0%, rgba(252,226,5,0.02) 100%)',
          padding: '22px 24px 18px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: 'rgba(252,226,5,0.15)',
                  border: '1px solid rgba(252,226,5,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Hammer size={16} color="#8A7600" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{project.name}</h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <span className="forge-badge forge-badge--neutral">{project.type}</span>
                    <span className={`forge-badge ${STATUS_BADGE[project.status] ?? 'forge-badge--neutral'}`}>{project.status}</span>
                    {project.clients && (
                      <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <User size={10} /> {project.clients.first_name} {project.clients.last_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginLeft: 48 }}>
                {project.address && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={10} /> {project.address}, {project.city}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={10} /> {formatDate(project.start_date)} → {formatDate(project.end_date)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <DollarSign size={10} /> {formatMoney(project.value)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="forge-button forge-button--secondary forge-button--sm">
                <Edit2 size={11} /> Edit
              </button>
              <button
                className="forge-button forge-button--primary forge-button--sm"
                onClick={generateDefenseFile}
                disabled={generatingDefense}
                style={{ gap: 5 }}
              >
                <Shield size={11} />
                {generatingDefense ? 'Generating...' : 'Generate Defense File'}
              </button>
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginTop: 18 }}>
            {[
              { label: 'Contract Value', value: formatMoney(project.value),    color: 'var(--color-text)'    },
              { label: 'Invoiced',       value: formatMoney(invoiceTotal),     color: 'var(--color-info)'    },
              { label: 'Collected',      value: formatMoney(paidTotal),        color: 'var(--color-success)' },
              { label: 'Outstanding',    value: formatMoney(outstanding),      color: outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)' },
              { label: 'Holdback',       value: formatMoney(holdbackTotal),    color: 'var(--color-warning)' },
            ].map(kpi => (
              <div key={kpi.label} style={{
                background: 'rgba(255,255,255,0.6)',
                border: '1px solid var(--color-border)',
                borderRadius: 8, padding: '10px 12px',
              }}>
                <p className="forge-label" style={{ marginBottom: 5 }}>{kpi.label}</p>
                <p style={{ fontSize: 15, fontWeight: 800, color: kpi.color, letterSpacing: '-0.02em', fontFamily: 'var(--font-mono)' }}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Stage gate */}
        <StageGateBar currentStage={project.stage} onAdvance={advanceStage} />

        {/* Progress bar */}
        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="forge-label">Completion</span>
          <div style={{ flex: 1, background: 'var(--color-mist)', borderRadius: 100, height: 6, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 100,
              width: `${project.completion_pct}%`,
              background: project.completion_pct >= 90 ? 'var(--color-success)' : project.completion_pct >= 50 ? '#FCE205' : '#8C8680',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text)', width: 36 }}>
            {project.completion_pct}%
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderTop: '1px solid var(--color-border)' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div>

            {/* Job file health */}
            <SectionCard title="Job File Health" icon={Shield}>
              <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: healthScore >= 80 ? 'rgba(45,122,80,0.12)' : healthScore >= 50 ? 'rgba(252,226,5,0.12)' : 'rgba(181,61,61,0.12)',
                    border: `2px solid ${healthScore >= 80 ? 'var(--color-success)' : healthScore >= 50 ? '#FCE205' : 'var(--color-danger)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800,
                    color: healthScore >= 80 ? 'var(--color-success)' : healthScore >= 50 ? '#8A7600' : 'var(--color-danger)',
                    flexShrink: 0,
                  }}>
                    {healthScore}%
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>
                      {healthScore >= 80 ? 'Strong job file' : healthScore >= 50 ? 'Needs attention' : 'Weak — at risk'}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                      {healthScore >= 80 ? 'This project is well-documented and defensible' : 'Add missing evidence to strengthen your legal position'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {jobFileHealth.map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {item.ok
                          ? <CheckCircle2 size={13} color="var(--color-success)" strokeWidth={1.5} />
                          : <AlertTriangle size={13} color="var(--color-warning)" strokeWidth={1.5} />}
                        <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{item.label}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: item.ok ? 'var(--color-success)' : 'var(--color-warning)' }}>
                        {item.ok ? 'Done' : 'Missing'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* Recent work orders */}
            <SectionCard title="Work Orders" icon={ClipboardList} action={{ label: 'New', onClick: () => navigate('/forge/dispatch') }}>
              {workOrders.length === 0 ? (
                <EmptyState message="No work orders for this project" />
              ) : (
                workOrders.slice(0, 4).map((wo, i) => (
                  <div key={wo.id} style={{
                    padding: '11px 18px',
                    borderBottom: i < Math.min(workOrders.length, 4) - 1 ? '1px solid var(--color-border)' : 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600 }}>{wo.issue}</p>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>
                        {wo.call_type} · {formatDate(wo.scheduled_time ?? wo.created_at)}
                      </p>
                    </div>
                    <span className={`forge-badge ${STATUS_BADGE[wo.status] ?? 'forge-badge--neutral'}`}>{wo.status}</span>
                  </div>
                ))
              )}
            </SectionCard>

          </div>

          {/* Right column */}
          <div>

            {/* Project info */}
            <SectionCard title="Project Info" icon={Hammer}>
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                {[
                  { label: 'Client',       value: project.clients ? `${project.clients.first_name} ${project.clients.last_name}` : '—' },
                  { label: 'Phone',        value: project.clients?.phone ?? '—'  },
                  { label: 'Email',        value: project.clients?.email ?? '—'  },
                  { label: 'Address',      value: project.address ? `${project.address}, ${project.city}` : '—' },
                  { label: 'Type',         value: project.type                    },
                  { label: 'Start Date',   value: formatDate(project.start_date)  },
                  { label: 'End Date',     value: formatDate(project.end_date)    },
                  { label: 'Holdback %',   value: `${project.holdback_pct}%`      },
                  { label: 'Holdback Released', value: project.holdback_released ? 'Yes' : 'No' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span className="forge-label" style={{ flexShrink: 0 }}>{row.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text)', fontWeight: 500, textAlign: 'right' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Quick financials */}
            <SectionCard title="Financials" icon={DollarSign}>
              <div style={{ padding: '4px 0' }}>
                {[
                  { label: 'Contract Value',  value: formatMoney(project.value),   color: 'var(--color-text)'    },
                  { label: 'Invoiced',        value: formatMoney(invoiceTotal),    color: 'var(--color-info)'    },
                  { label: 'Collected',       value: formatMoney(paidTotal),       color: 'var(--color-success)' },
                  { label: 'Outstanding',     value: formatMoney(outstanding),     color: outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)' },
                  { label: 'Holdback Held',   value: formatMoney(holdbackTotal),   color: 'var(--color-warning)' },
                ].map((row, i) => (
                  <div key={row.label} style={{
                    padding: '11px 18px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: i < 4 ? '1px solid var(--color-border)' : 'none',
                  }}>
                    <p className="forge-label">{row.label}</p>
                    <p style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: row.color }}>
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>

          </div>
        </div>
      )}

      {/* ── SCOPE TAB ── */}
      {activeTab === 'scope' && (
        <SectionCard title="Scope of Work" icon={FileText} action={{ label: 'Add Item', onClick: () => {} }}>
          {scopeItems.length === 0 ? (
            <EmptyState message="No scope items yet — add line items to define the project scope" />
          ) : (
            <>
              <table className="forge-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {scopeItems.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>{item.section}</td>
                      <td style={{ fontWeight: 500, fontSize: 12 }}>
                        {item.description}
                        {item.is_optional && <span className="forge-badge forge-badge--neutral" style={{ marginLeft: 6 }}>Optional</span>}
                      </td>
                      <td><span className="forge-badge forge-badge--neutral">{item.item_type}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{item.quantity}</td>
                      <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>{item.unit}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatMoney(item.unit_price)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>{formatMoney(item.total)}</td>
                      <td>
                        {item.approved
                          ? <CheckCircle2 size={14} color="var(--color-success)" strokeWidth={1.5} />
                          : <Clock size={14} color="var(--color-muted)" strokeWidth={1.5} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{
                padding: '12px 18px',
                borderTop: '1px solid var(--color-border)',
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
              }}>
                <span className="forge-label">Scope Total</span>
                <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                  {formatMoney(scopeTotal)}
                </span>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ── FIELD LOGS TAB ── */}
      {activeTab === 'field' && (
        <SectionCard title="Field Logs & Photos" icon={Camera} action={{ label: 'Add Log', onClick: () => {} }}>
          {fieldLogs.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <Camera size={32} color="var(--color-muted)" strokeWidth={1.5} style={{ marginBottom: 12 }} />
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>No field logs yet</p>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16 }}>
                Field logs and photos submitted from the mobile app will appear here
              </p>
              <button className="forge-button forge-button--secondary forge-button--sm">
                <Plus size={11} /> Add Manual Log
              </button>
            </div>
          ) : (
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {fieldLogs.map(log => (
                <div key={log.id} style={{
                  padding: '12px 14px',
                  background: 'var(--color-panel-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="forge-badge forge-badge--neutral">{log.log_type}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{formatDate(log.created_at)}</span>
                  </div>
                  {log.content && <p style={{ fontSize: 12, color: 'var(--color-text-sub)', lineHeight: 1.6 }}>{log.content}</p>}
                  {log.photo_url && (
                    <img
                      src={log.photo_url}
                      alt="Site photo"
                      style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 6, marginTop: 8 }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── INVOICES TAB ── */}
      {activeTab === 'invoices' && (
        <SectionCard title="Invoices" icon={Receipt} action={{ label: 'New Invoice', onClick: () => {} }}>
          {invoices.length === 0 ? (
            <EmptyState message="No invoices for this project yet" />
          ) : (
            <table className="forge-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Holdback</th>
                  <th>Outstanding</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{inv.invoice_number}</td>
                    <td>
                      <span className={`forge-badge ${
                        inv.status === 'paid' ? 'forge-badge--success' :
                        inv.status === 'overdue' ? 'forge-badge--danger' :
                        inv.status === 'sent' ? 'forge-badge--info' : 'forge-badge--neutral'
                      }`}>{inv.status}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatMoney(inv.total)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>{formatMoney(inv.amount_paid)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-warning)' }}>{formatMoney(inv.holdback_amount)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: inv.total - inv.amount_paid > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {formatMoney(inv.total - inv.amount_paid)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>{formatDate(inv.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      {/* ── PERMITS TAB ── */}
      {activeTab === 'permits' && (
        <SectionCard title="Permits & Inspections" icon={ClipboardList} action={{ label: 'Add Permit', onClick: () => {} }}>
          {permits.length === 0 ? (
            <EmptyState message="No permits tracked for this project yet" />
          ) : (
            <table className="forge-table">
              <thead>
                <tr>
                  <th>Permit Type</th>
                  <th>Status</th>
                  <th>Number</th>
                  <th>Applied</th>
                  <th>Approved</th>
                  <th>Inspection</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {permits.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{p.permit_type}</td>
                    <td><span className={`forge-badge ${PERMIT_BADGE[p.status] ?? 'forge-badge--neutral'}`}>{p.status}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.permit_number ?? '—'}</td>
                    <td style={{ fontSize: 11 }}>{formatDate(p.applied_date)}</td>
                    <td style={{ fontSize: 11 }}>{formatDate(p.approved_date)}</td>
                    <td style={{ fontSize: 11 }}>{formatDate(p.inspection_date)}</td>
                    <td>
                      {p.inspection_result ? (
                        <span className={`forge-badge ${p.inspection_result === 'passed' ? 'forge-badge--success' : 'forge-badge--danger'}`}>
                          {p.inspection_result}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      )}

      {/* ── VAULT TAB ── */}
      {activeTab === 'vault' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Defense file generator */}
          <div className="forge-card" style={{ overflow: 'hidden' }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(252,226,5,0.10) 0%, rgba(252,226,5,0.03) 100%)',
              padding: '24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: 'rgba(252,226,5,0.15)',
                    border: '1px solid rgba(252,226,5,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Shield size={24} color="#8A7600" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Defense File Generator</h3>
                    <p style={{ fontSize: 12, color: 'var(--color-text-sub)', maxWidth: 480 }}>
                      Compile all project evidence into a single court-ready, tamper-proof PDF.
                      SHA-256 hashed and permanently timestamped.
                    </p>
                  </div>
                </div>
                <button
                  className="forge-button forge-button--primary"
                  onClick={generateDefenseFile}
                  disabled={generatingDefense}
                  style={{ gap: 6, flexShrink: 0 }}
                >
                  <Shield size={13} />
                  {generatingDefense ? 'Compiling...' : 'Generate Defense File'}
                </button>
              </div>

              {/* Evidence summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { icon: FileText,      label: 'Scope Items',     count: scopeItems.length,  color: '#60A5FA' },
                  { icon: Receipt,       label: 'Invoices',        count: invoices.length,    color: '#2D7A50' },
                  { icon: ClipboardList, label: 'Work Orders',     count: workOrders.length,  color: '#FCE205' },
                  { icon: Camera,        label: 'Field Logs',      count: fieldLogs.length,   color: '#8A7600' },
                  { icon: ClipboardList, label: 'Permits',         count: permits.length,     color: '#1E5FA4' },
                  { icon: Lock,          label: 'Hash Protected',  count: null,               color: '#2D7A50' },
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} style={{
                      background: 'rgba(255,255,255,0.7)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: '12px 14px',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <Icon size={14} color={item.color} strokeWidth={1.5} />
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</p>
                        <p style={{ fontSize: 13, fontWeight: 800, color: item.color, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                          {item.count !== null ? item.count : '✓'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Health warning */}
              {healthScore < 80 && (
                <div style={{
                  marginTop: 16, padding: '12px 16px',
                  background: 'rgba(184,106,0,0.08)',
                  border: '1px solid rgba(184,106,0,0.2)',
                  borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <AlertTriangle size={14} color="var(--color-warning)" strokeWidth={1.5} />
                  <p style={{ fontSize: 12, color: 'var(--color-warning)' }}>
                    Job file is {healthScore}% complete. Add missing evidence before generating to strengthen your legal position.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Audit trail */}
          <SectionCard title="Audit Trail" icon={Clock}>
            <div style={{ padding: '14px 18px' }}>
              {[
                ...workOrders.map(w => ({ date: w.created_at, label: `Work order created: ${w.issue}`, type: 'work_order' })),
                ...invoices.map(i => ({ date: i.created_at, label: `Invoice ${i.invoice_number} — ${formatMoney(i.total)}`, type: 'invoice' })),
                ...fieldLogs.map(f => ({ date: f.created_at, label: `Field log: ${f.content?.slice(0, 60) ?? f.log_type}`, type: 'field_log' })),
                { date: project.created_at, label: 'Project created', type: 'project' },
              ]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 10)
                .map((entry, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    paddingBottom: 12, marginBottom: 12,
                    borderBottom: i < 9 ? '1px solid var(--color-border)' : 'none',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                      background: entry.type === 'invoice' ? 'var(--color-success)' :
                                  entry.type === 'work_order' ? '#FCE205' :
                                  entry.type === 'field_log' ? 'var(--color-info)' : 'var(--color-muted)',
                    }} />
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>{entry.label}</p>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>{formatDate(entry.date)}</p>
                    </div>
                  </div>
                ))
              }
              {workOrders.length === 0 && invoices.length === 0 && fieldLogs.length === 0 && (
                <EmptyState message="No activity recorded yet" />
              )}
            </div>
          </SectionCard>

        </div>
      )}

    </div>
  );
}