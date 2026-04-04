import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2,
  ChevronRight, Clock, DollarSign, FileText, Hammer,
  Layers, Lock, Package, TrendingUp,
} from 'lucide-react';

const PRIORITY_ALERTS = [
  { id: 1, type: 'danger',  icon: Lock,         label: 'Holdback release blocked',   detail: 'Bayview Reno — 3 deficiencies open',  action: 'Review'    },
  { id: 2, type: 'warning', icon: AlertTriangle, label: 'Invoice awaiting approval',  detail: 'Thornhill Addition — $24,800',         action: 'Approve'   },
  { id: 3, type: 'warning', icon: Clock,         label: 'Quote expiring in 2 days',   detail: 'Markham Office Build — $142,000',      action: 'View'      },
  { id: 4, type: 'info',    icon: Package,       label: 'PO not acknowledged',        detail: 'Maple Exterior — Fenco Supply',        action: 'Follow up' },
];

const PIPELINE_STAGES = [
  { label: 'Leads',    count: 8, value: '$680K', color: 'var(--color-text-sub)' },
  { label: 'Quoted',   count: 5, value: '$412K', color: 'var(--color-info)'     },
  { label: 'Proposed', count: 3, value: '$295K', color: 'var(--color-gold)'     },
  { label: 'Won',      count: 2, value: '$180K', color: 'var(--color-success)'  },
];

const ACTIVE_PROJECTS = [
  { id: 'P-041', name: 'Bayview Reno',       client: 'R. Fontaine', stage: 'Build',  status: 'blocked',  pm: 'KT', pct: 72 },
  { id: 'P-038', name: 'Thornhill Addition', client: 'H. Lam',      stage: 'Bill',   status: 'active',   pm: 'MR', pct: 91 },
  { id: 'P-035', name: 'Maple Exterior',     client: 'C. Osei',     stage: 'Buy',    status: 'active',   pm: 'KT', pct: 55 },
  { id: 'P-033', name: 'Markham Office',     client: 'P. Dubois',   stage: 'Plan',   status: 'active',   pm: 'AS', pct: 28 },
  { id: 'P-030', name: 'Etobicoke Basement', client: 'M. Nguyen',   stage: 'Define', status: 'on-hold',  pm: 'MR', pct: 14 },
];

const FINANCIALS = [
  { label: 'Outstanding Invoices', value: '$148,400', sub: '6 invoices',          type: 'warning' },
  { label: 'Holdback Held',        value: '$62,200',  sub: '4 projects',          type: 'danger'  },
  { label: 'Collected MTD',        value: '$284,000', sub: '+18% vs last month',  type: 'success' },
  { label: 'Open POs',             value: '$91,000',  sub: '12 orders',           type: 'neutral' },
];

const ACTIVITY = [
  { time: '2h ago', user: 'K. Tran',  action: 'Uploaded 12 site photos',        project: 'Bayview Reno'       },
  { time: '4h ago', user: 'M. Rocha', action: 'Marked deficiency #4 resolved',  project: 'Thornhill Addition' },
  { time: 'Today',  user: 'System',   action: 'Invoice INV-088 sent to client', project: 'Thornhill Addition' },
  { time: 'Today',  user: 'A. Singh', action: 'Approved work order WO-22',      project: 'Markham Office'     },
  { time: 'Yest.',  user: 'K. Tran',  action: 'Added 3 line items to scope',    project: 'Maple Exterior'     },
];

const STAGE_BADGE: Record<string, string> = {
  Sell: 'forge-badge--info', Define: 'forge-badge--neutral', Plan: 'forge-badge--neutral',
  Build: 'forge-badge--gold', Buy: 'forge-badge--gold', Bill: 'forge-badge--success',
};
const STATUS_BADGE: Record<string, string> = {
  active: 'forge-badge--success', blocked: 'forge-badge--danger', 'on-hold': 'forge-badge--warning',
};
const ALERT_BADGE: Record<string, string> = {
  danger: 'forge-badge--danger', warning: 'forge-badge--warning', info: 'forge-badge--info',
};
const FIN_COLOR: Record<string, string> = {
  warning: 'var(--color-warning)', danger: 'var(--color-danger)',
  success: 'var(--color-success)', neutral: 'var(--color-text)',
};

function SectionHeader({ title, action, icon: Icon }: { title: string; action?: string; icon: React.ElementType }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon size={14} color="var(--color-gold)" />
        <span className="forge-title" style={{ fontSize: 13 }}>{title}</span>
      </div>
      {action && (
        <button className="forge-button forge-button--ghost forge-button--sm" style={{ gap: 4 }}>
          {action} <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ background: 'var(--color-mist)', borderRadius: 100, height: 4, width: 80, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`, borderRadius: 100,
        background: pct > 80 ? 'var(--color-success)' : 'linear-gradient(90deg, #C89B3C, #D8B15A)',
      }} />
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: 'var(--color-gold-tint)', border: '1px solid var(--color-gold-soft)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontWeight: 700, color: '#7A5E1A',
    }}>{initials}</div>
  );
}

export default function DashboardPage() {
  const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1320, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <p className="forge-label" style={{ marginBottom: 4 }}>{today}</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>Command Center</h1>
        <p className="forge-subtitle" style={{ marginTop: 2 }}>4 items require your attention today</p>
      </div>

      {/* Priority strip */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader title="Priority Alerts" action="View all" icon={AlertTriangle} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {PRIORITY_ALERTS.map(alert => {
            const Icon = alert.icon;
            const bgColor = alert.type === 'danger' ? 'var(--color-danger-bg)' : alert.type === 'warning' ? 'var(--color-warning-bg)' : 'var(--color-info-bg)';
            const iconColor = alert.type === 'danger' ? 'var(--color-danger)' : alert.type === 'warning' ? 'var(--color-warning)' : 'var(--color-info)';
            return (
              <div key={alert.id} className="forge-card" style={{ padding: '13px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={14} color={iconColor} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{alert.label}</p>
                  <p className="forge-subtitle" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.detail}</p>
                </div>
                <span className={`forge-badge ${ALERT_BADGE[alert.type]}`} style={{ cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>{alert.action}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* CRM Pipeline */}
          <div className="forge-card">
            <div className="forge-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <TrendingUp size={14} color="var(--color-gold)" />
                <span className="forge-title" style={{ fontSize: 13 }}>CRM Pipeline</span>
              </div>
              <button className="forge-button forge-button--primary forge-button--sm">+ New Opportunity</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--color-border)' }}>
              {PIPELINE_STAGES.map((stage, i) => (
                <div key={stage.label} style={{ padding: '16px 18px', borderRight: i < 3 ? '1px solid var(--color-border)' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-gold-tint)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <p className="forge-label" style={{ marginBottom: 8 }}>{stage.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: stage.color, letterSpacing: '-0.03em', lineHeight: 1 }}>{stage.count}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-sub)', marginTop: 4 }}>{stage.value}</p>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 4 }}>
              {PIPELINE_STAGES.map((s, i) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 100, opacity: 0.3 + (i * 0.2),
                    background: i === 0 ? '#CBD4DD' : i === 1 ? 'var(--color-info)' : i === 2 ? 'var(--color-gold)' : 'var(--color-success)' }} />
                  {i < 3 && <ArrowRight size={10} color="var(--color-muted)" />}
                </div>
              ))}
            </div>
          </div>

          {/* Active Projects */}
          <div className="forge-card">
            <div className="forge-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Hammer size={14} color="var(--color-gold)" />
                <span className="forge-title" style={{ fontSize: 13 }}>Active Projects</span>
                <span className="forge-badge forge-badge--neutral" style={{ marginLeft: 4 }}>{ACTIVE_PROJECTS.length}</span>
              </div>
              <button className="forge-button forge-button--secondary forge-button--sm">All Projects <ChevronRight size={12} /></button>
            </div>
            <table className="forge-table">
              <thead>
                <tr><th>Project</th><th>Stage</th><th>Status</th><th>Progress</th><th>PM</th></tr>
              </thead>
              <tbody>
                {ACTIVE_PROJECTS.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{p.id} · {p.client}</div>
                    </td>
                    <td><span className={`forge-badge ${STAGE_BADGE[p.stage]}`}>{p.stage}</span></td>
                    <td><span className={`forge-badge ${STATUS_BADGE[p.status]}`}>{p.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ProgressBar pct={p.pct} />
                        <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{p.pct}%</span>
                      </div>
                    </td>
                    <td><Avatar initials={p.pm} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Financials */}
          <div className="forge-card">
            <div className="forge-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <DollarSign size={14} color="var(--color-gold)" />
                <span className="forge-title" style={{ fontSize: 13 }}>Financials</span>
              </div>
            </div>
            {FINANCIALS.map((f, i) => (
              <div key={f.label} style={{ padding: '13px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < 3 ? '1px solid var(--color-border)' : 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-mist)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <div>
                  <p className="forge-label">{f.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{f.sub}</p>
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: FIN_COLOR[f.type], letterSpacing: '-0.02em' }}>{f.value}</p>
              </div>
            ))}
          </div>

          {/* Job File Health */}
          <div className="forge-card">
            <div className="forge-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <FileText size={14} color="var(--color-gold)" />
                <span className="forge-title" style={{ fontSize: 13 }}>Job File Health</span>
              </div>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Contracts signed',  ok: true,  count: '5/5' },
                { label: 'Scopes defined',    ok: true,  count: '5/5' },
                { label: 'Photos logged',     ok: false, count: '3/5' },
                { label: 'Issues documented', ok: false, count: '2/5' },
                { label: 'Closeout complete', ok: false, count: '1/5' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {row.ok ? <CheckCircle2 size={13} color="var(--color-success)" /> : <AlertTriangle size={13} color="var(--color-warning)" />}
                    <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: row.ok ? 'var(--color-success)' : 'var(--color-warning)' }}>{row.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Audit Trail */}
          <div className="forge-card">
            <div className="forge-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Layers size={14} color="var(--color-gold)" />
                <span className="forge-title" style={{ fontSize: 13 }}>Audit Trail</span>
              </div>
            </div>
            {ACTIVITY.map((entry, i) => (
              <div key={i} style={{ padding: '11px 18px', borderBottom: i < ACTIVITY.length - 1 ? '1px solid var(--color-border)' : 'none', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Avatar initials={entry.user.split(' ').map((w: string) => w[0]).join('').slice(0, 2)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.4 }}>
                    <strong style={{ fontWeight: 600 }}>{entry.user}</strong> {entry.action}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>{entry.time} · {entry.project}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}