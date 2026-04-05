import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import {
  TrendingUp, DollarSign, AlertTriangle, CheckCircle,
  Clock, ArrowUp, ArrowDown, Minus, Download,
  FileText, BarChart2, Layers,
} from 'lucide-react';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

/* ── Helpers ── */
function fmt(v: number) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtFull(v: number) { return `$${v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function pct(a: number, b: number) { return b === 0 ? 0 : Math.round(((a - b) / b) * 100); }

function Trend({ current, previous }: { current: number; previous: number }) {
  const diff = pct(current, previous);
  if (previous === 0) return null;
  const Icon  = diff === 0 ? Minus : diff > 0 ? ArrowUp : ArrowDown;
  const color = diff >= 0 ? '#16A34A' : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
      <Icon size={11} color={color} strokeWidth={2} />
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{Math.abs(diff)}% vs last month</span>
    </div>
  );
}

function exportXLSX(sheets: { name: string; data: any[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = XLSX.utils.json_to_sheet(s.data);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  });
  XLSX.writeFile(wb, filename);
}

type Tab = 'overview' | 'ar_aging' | 'allowance' | 'wip';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [overview, setOverview]   = useState<any>(null);
  const [arAging, setArAging]     = useState<any[]>([]);
  const [allowance, setAllowance] = useState<any[]>([]);
  const [wip, setWip]             = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const now       = new Date();
    const startMTD  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endLast   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
    const startYTD  = new Date(now.getFullYear(), 0, 1).toISOString();

    const [invRes, quoteRes, projRes, clientRes] = await Promise.all([
      supabase.from('invoices').select('*, clients(first_name, last_name), projects(name)').eq('company_id', COMPANY_ID),
      supabase.from('quotes').select('*, clients(first_name, last_name)').eq('company_id', COMPANY_ID),
      supabase.from('projects').select('*, clients(first_name, last_name)').eq('company_id', COMPANY_ID),
      supabase.from('clients').select('id, first_name, last_name, created_at').eq('company_id', COMPANY_ID),
    ]);

    const invoices = (invRes.data ?? []) as any[];
    const quotes   = (quoteRes.data ?? []) as any[];
    const projects = (projRes.data ?? []) as any[];
    const clients  = (clientRes.data ?? []) as any[];

    /* ── Overview ── */
    const paid         = invoices.filter(i => i.status === 'paid');
    const revMTD       = paid.filter(i => i.paid_at >= startMTD).reduce((s: number, i: any) => s + i.total, 0);
    const revLast      = paid.filter(i => i.paid_at >= startLast && i.paid_at <= endLast).reduce((s: number, i: any) => s + i.total, 0);
    const revYTD       = paid.filter(i => i.paid_at >= startYTD).reduce((s: number, i: any) => s + i.total, 0);
    const unpaid       = invoices.filter(i => i.status !== 'paid');
    const outstanding  = unpaid.reduce((s: number, i: any) => s + (i.total - i.amount_paid), 0);
    const overdueInvs  = unpaid.filter(i => i.due_date && new Date(i.due_date) < now);
    const overdueAmt   = overdueInvs.reduce((s: number, i: any) => s + (i.total - i.amount_paid), 0);
    const sent         = quotes.filter(q => ['sent','viewed','signed','converted'].includes(q.status));
    const signed       = quotes.filter(q => ['signed','converted'].includes(q.status));
    const closeRate    = sent.length > 0 ? Math.round((signed.length / sent.length) * 100) : 0;
    const pipelineVal  = quotes.filter(q => ['draft','sent'].includes(q.status)).reduce((s: number, q: any) => s + (q.total ?? 0), 0);

    /* Monthly trend */
    const monthly = [];
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const rev = paid.filter((inv: any) => inv.paid_at >= d.toISOString() && inv.paid_at <= end.toISOString()).reduce((s: number, inv: any) => s + inv.total, 0);
      const inv = invoices.filter((inv: any) => inv.created_at >= d.toISOString() && inv.created_at <= end.toISOString()).reduce((s: number, i: any) => s + i.total, 0);
      monthly.push({ month: d.toLocaleDateString('en-CA', { month: 'short' }), revenue: rev, invoiced: inv });
    }

    /* By stage */
    const stageMap = new Map<string, { count: number; value: number }>();
    projects.forEach((p: any) => {
      const s = p.stage ?? 'unknown';
      const ex = stageMap.get(s) ?? { count: 0, value: 0 };
      stageMap.set(s, { count: ex.count + 1, value: ex.value + (p.value ?? 0) });
    });

    /* Top clients */
    const clientRevMap = new Map<string, { name: string; revenue: number; projects: number }>();
    paid.filter((i: any) => i.client_id).forEach((inv: any) => {
      const ex = clientRevMap.get(inv.client_id) ?? { name: '—', revenue: 0, projects: 0 };
      clientRevMap.set(inv.client_id, { ...ex, revenue: ex.revenue + inv.total });
    });
    projects.filter((p: any) => p.client_id).forEach((p: any) => {
      const ex = clientRevMap.get(p.client_id);
      if (ex) clientRevMap.set(p.client_id, { ...ex, projects: ex.projects + 1 });
    });
    clients.forEach((c: any) => {
      const ex = clientRevMap.get(c.id);
      if (ex) clientRevMap.set(c.id, { ...ex, name: `${c.first_name} ${c.last_name}` });
    });
    const topClients = Array.from(clientRevMap.values()).filter(c => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    /* Overdue list */
    const overdueList = overdueInvs.map((inv: any) => {
      const days = Math.floor((now.getTime() - new Date(inv.due_date).getTime()) / 86400000);
      return { number: inv.invoice_number, client: inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : '—', amount: inv.total - inv.amount_paid, days };
    }).sort((a, b) => b.days - a.days);

    setOverview({ revMTD, revLast, revYTD, outstanding, overdueAmt, closeRate, pipelineVal, signed: signed.length, sent: sent.length, active: projects.filter(p => p.status === 'active').length, totalClients: clients.length, monthly, stageMap, topClients, overdueList });

    /* ── AR Aging ── */
    const aging = unpaid.map((inv: any) => {
      const daysOut = inv.due_date ? Math.floor((now.getTime() - new Date(inv.due_date).getTime()) / 86400000) : 0;
      const bucket  = daysOut <= 0 ? 'Current' : daysOut <= 30 ? '1-30 days' : daysOut <= 60 ? '31-60 days' : daysOut <= 90 ? '61-90 days' : '90+ days';
      return {
        invoice:     inv.invoice_number,
        client:      inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : '—',
        project:     inv.projects?.name ?? '—',
        invoiced:    inv.total,
        paid:        inv.amount_paid,
        outstanding: inv.total - inv.amount_paid,
        due_date:    inv.due_date ?? '—',
        days_out:    daysOut,
        bucket,
        status:      inv.status,
      };
    }).sort((a, b) => b.days_out - a.days_out);
    setArAging(aging);

    /* ── Allowance Reconciliation ── */
    const allowanceRows: any[] = [];
    quotes.filter((q: any) => ['signed', 'converted'].includes(q.status)).forEach((q: any) => {
      (q.line_items ?? []).filter((item: any) => item.isAllowance).forEach((item: any) => {
        allowanceRows.push({
          quote:     q.quote_number,
          client:    q.clients ? `${q.clients.first_name} ${q.clients.last_name}` : '—',
          title:     q.title,
          item:      item.description,
          estimated: item.amount ?? 0,
          actual:    0,
          delta:     -(item.amount ?? 0),
          status:    'Pending Receipt',
          action:    'Upload receipt to reconcile',
        });
      });
    });
    setAllowance(allowanceRows);

    /* ── WIP ── */
    const wipRows = projects.filter((p: any) => p.status === 'active').map((p: any) => {
      const projInvoices  = invoices.filter((i: any) => i.project_id === p.id);
      const invoiced      = projInvoices.reduce((s: number, i: any) => s + i.total, 0);
      const collected     = projInvoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + i.total, 0);
      const budget        = p.value ?? 0;
      const pctComplete   = p.completion_pct ?? 0;
      const pctInvoiced   = budget > 0 ? Math.round((invoiced / budget) * 100) : 0;
      const earnedValue   = budget * (pctComplete / 100);
      const variance      = earnedValue - invoiced;
      const risk          = pctInvoiced > pctComplete + 20 ? 'Over-billed' : pctComplete > pctInvoiced + 20 ? 'Under-billed' : 'On Track';
      return {
        project:       p.name,
        client:        p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : '—',
        stage:         p.stage ?? '—',
        budget,
        invoiced,
        collected,
        outstanding:   invoiced - collected,
        pct_complete:  pctComplete,
        pct_invoiced:  pctInvoiced,
        earned_value:  earnedValue,
        variance,
        risk,
      };
    });
    setWip(wipRows);

    setLoading(false);
  }

  const TABS = [
    { id: 'overview',  label: 'Overview',                  icon: BarChart2  },
    { id: 'ar_aging',  label: 'AR Aging',                  icon: Clock      },
    { id: 'allowance', label: 'Allowance Reconciliation',  icon: Layers     },
    { id: 'wip',       label: 'WIP Report',                icon: TrendingUp },
  ] as const;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: 13 }}>
      Building reports...
    </div>
  );

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>System</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Reports</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>
            {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--color-mist)', padding: 4, borderRadius: 10, border: '1px solid var(--color-border)', width: 'fit-content' }}>
        {TABS.map(tab => {
          const Icon   = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: active ? 700 : 400, background: active ? 'var(--color-panel)' : 'transparent', border: active ? '1px solid var(--color-border)' : '1px solid transparent', color: active ? 'var(--color-text)' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.12s' }}>
              <Icon size={12} strokeWidth={active ? 2 : 1.5} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && overview && <OverviewTab data={overview} />}

      {/* ── AR AGING TAB ── */}
      {activeTab === 'ar_aging' && (
        <ARAgingTab
          data={arAging}
          onExport={() => exportXLSX([{
            name: 'AR Aging',
            data: arAging.map(r => ({
              'Invoice':     r.invoice,
              'Client':      r.client,
              'Project':     r.project,
              'Total':       r.invoiced,
              'Paid':        r.paid,
              'Outstanding': r.outstanding,
              'Due Date':    r.due_date,
              'Days Out':    r.days_out,
              'Bucket':      r.bucket,
              'Status':      r.status,
            })),
          }], `AR_Aging_${new Date().toISOString().split('T')[0]}.xlsx`)}
        />
      )}

      {/* ── ALLOWANCE RECONCILIATION TAB ── */}
      {activeTab === 'allowance' && (
        <AllowanceTab
          data={allowance}
          onExport={() => exportXLSX([{
            name: 'Allowance Reconciliation',
            data: allowance.map(r => ({
              'Quote':      r.quote,
              'Client':     r.client,
              'Project':    r.title,
              'Item':       r.item,
              'Estimated':  r.estimated,
              'Actual':     r.actual,
              'Delta':      r.delta,
              'Status':     r.status,
              'Action':     r.action,
            })),
          }], `Allowance_Reconciliation_${new Date().toISOString().split('T')[0]}.xlsx`)}
        />
      )}

      {/* ── WIP TAB ── */}
      {activeTab === 'wip' && (
        <WIPTab
          data={wip}
          onExport={() => exportXLSX([{
            name: 'WIP Report',
            data: wip.map(r => ({
              'Project':       r.project,
              'Client':        r.client,
              'Stage':         r.stage,
              'Budget':        r.budget,
              'Invoiced':      r.invoiced,
              'Collected':     r.collected,
              'Outstanding':   r.outstanding,
              '% Complete':    r.pct_complete,
              '% Invoiced':    r.pct_invoiced,
              'Earned Value':  r.earned_value,
              'Variance':      r.variance,
              'Risk':          r.risk,
            })),
          }], `WIP_Report_${new Date().toISOString().split('T')[0]}.xlsx`)}
        />
      )}
    </div>
  );
}

/* ── OVERVIEW ── */
function OverviewTab({ data }: { data: any }) {
  const STAGE_ORDER  = ['DEFINE','PLAN','BUY','BUILD','BILL','DONE'];
  const STAGE_COLORS: Record<string, string> = { DEFINE:'#6B7280', PLAN:'#1E5FA4', BUY:'#D97706', BUILD:'#8A7600', BILL:'#16A34A', DONE:'#374151' };
  const maxMonthly   = Math.max(...data.monthly.map((m: any) => Math.max(m.revenue, m.invoiced)), 1);
  const byStage      = Array.from((data.stageMap as Map<string, any>).entries()).map(([stage, d]) => ({ stage, ...d }));
  const maxStage     = Math.max(...byStage.map((s: any) => s.value), 1);

  return (
    <div>
      {/* KPI Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Revenue MTD',   value: fmt(data.revMTD),       color: '#16A34A', icon: TrendingUp,    trend: true  },
          { label: 'Outstanding',   value: fmt(data.outstanding),  color: '#DC2626', icon: DollarSign,    trend: false },
          { label: 'Overdue',       value: fmt(data.overdueAmt),   color: '#D97706', icon: AlertTriangle, trend: false },
          { label: 'Collected YTD', value: fmt(data.revYTD),       color: '#8A7600', icon: CheckCircle,   trend: false },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} style={{ padding: '18px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{stat.label}</p>
                <Icon size={14} color={stat.color} strokeWidth={1.5} />
              </div>
              <p style={{ fontSize: 26, fontWeight: 900, color: stat.color, letterSpacing: '-0.02em', fontFamily: 'var(--font-mono)' }}>{stat.value}</p>
              {stat.trend && <Trend current={data.revMTD} previous={data.revLast} />}
            </div>
          );
        })}
      </div>

      {/* KPI Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Close Rate',      value: `${data.closeRate}%`,           color: '#1E5FA4' },
          { label: 'Pipeline Value',  value: fmt(data.pipelineVal),          color: '#8A7600' },
          { label: 'Quotes Sent',     value: String(data.sent),              color: '#6B7280' },
          { label: 'Jobs Signed',     value: String(data.signed),            color: '#16A34A' },
          { label: 'Active Projects', value: String(data.active),            color: '#D97706' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6 }}>{stat.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: stat.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Monthly chart */}
        <div style={{ background: 'var(--color-panel)', borderRadius: 12, border: '1px solid var(--color-border)', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>Revenue Trend</p>
            <div style={{ display: 'flex', gap: 14 }}>
              {[{ color: '#FCE205', label: 'Collected' }, { color: '#E4E0D8', label: 'Invoiced' }].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 140 }}>
            {data.monthly.map((m: any, i: number) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', display: 'flex', gap: 3, alignItems: 'flex-end', height: 120 }}>
                  <div style={{ flex: 1, borderRadius: '4px 4px 0 0', background: '#E4E0D8', height: `${(m.invoiced / maxMonthly) * 100}%`, minHeight: 2 }} />
                  <div style={{ flex: 1, borderRadius: '4px 4px 0 0', background: '#FCE205', height: `${(m.revenue / maxMonthly) * 100}%`, minHeight: 2 }} />
                </div>
                <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{m.month}</p>
                {m.revenue > 0 && <p style={{ fontSize: 9, color: '#8A7600', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmt(m.revenue)}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Projects by stage */}
        <div style={{ background: 'var(--color-panel)', borderRadius: 12, border: '1px solid var(--color-border)', padding: '20px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Projects by Stage</p>
          {STAGE_ORDER.map(stage => {
            const d = byStage.find(s => s.stage === stage);
            if (!d || d.count === 0) return null;
            const color = STAGE_COLORS[stage] ?? '#6B7280';
            return (
              <div key={stage} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, color, background: `${color}15` }}>{stage}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{d.count} project{d.count !== 1 ? 's' : ''}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color }}>{fmt(d.value)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(d.value / maxStage) * 100}%`, borderRadius: 100, background: color }} />
                </div>
              </div>
            );
          })}
          {byStage.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: '20px 0' }}>No projects yet</p>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Top clients */}
        <div style={{ background: 'var(--color-panel)', borderRadius: 12, border: '1px solid var(--color-border)', padding: '20px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Top Clients by Revenue</p>
          {data.topClients.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: '20px 0' }}>No paid invoices yet</p>
          ) : data.topClients.map((c: any, i: number) => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < data.topClients.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(252,226,5,0.12)', border: '1px solid rgba(252,226,5,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#8A7600', flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{c.projects} project{c.projects !== 1 ? 's' : ''}</p>
              </div>
              <p style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#16A34A' }}>{fmt(c.revenue)}</p>
            </div>
          ))}
        </div>

        {/* Overdue */}
        <div style={{ background: 'var(--color-panel)', borderRadius: 12, border: data.overdueList.length > 0 ? '1px solid rgba(220,38,38,0.2)' : '1px solid var(--color-border)', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <AlertTriangle size={14} color={data.overdueList.length > 0 ? '#DC2626' : 'var(--color-muted)'} strokeWidth={1.5} />
            <p style={{ fontSize: 13, fontWeight: 700, color: data.overdueList.length > 0 ? '#DC2626' : 'var(--color-text)' }}>
              Overdue Invoices {data.overdueList.length > 0 && `— ${fmt(data.overdueAmt)}`}
            </p>
          </div>
          {data.overdueList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle size={24} color="#16A34A" strokeWidth={1} style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>All invoices current</p>
            </div>
          ) : data.overdueList.slice(0, 5).map((inv: any, i: number) => (
            <div key={inv.number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < Math.min(data.overdueList.length, 5) - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{inv.number}</p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{inv.client}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', fontFamily: 'var(--font-mono)' }}>{fmtFull(inv.amount)}</p>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 100, background: inv.days > 60 ? 'rgba(220,38,38,0.12)' : 'rgba(217,119,6,0.10)', color: inv.days > 60 ? '#DC2626' : '#D97706' }}>{inv.days}d</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── AR AGING ── */
function ARAgingTab({ data, onExport }: { data: any[]; onExport: () => void }) {
  const buckets = ['Current', '1-30 days', '31-60 days', '61-90 days', '90+ days'];
  const bucketColors: Record<string, string> = { 'Current': '#16A34A', '1-30 days': '#8A7600', '31-60 days': '#D97706', '61-90 days': '#DC2626', '90+ days': '#7C0000' };
  const totals = buckets.map(b => ({
    bucket: b,
    amount: data.filter(r => r.bucket === b).reduce((s, r) => s + r.outstanding, 0),
    count:  data.filter(r => r.bucket === b).length,
  }));
  const grandTotal = data.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>Accounts Receivable Aging</h2>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Outstanding invoices by age — {data.length} invoices · {fmtFull(grandTotal)} total</p>
        </div>
        <button onClick={onExport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#16A34A', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <Download size={13} /> Export XLSX
        </button>
      </div>

      {/* Bucket summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
        {totals.map(t => (
          <div key={t.bucket} style={{ padding: '14px', borderRadius: 10, background: 'var(--color-panel)', border: `1px solid ${t.amount > 0 ? bucketColors[t.bucket] + '33' : 'var(--color-border)'}` }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6 }}>{t.bucket}</p>
            <p style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: t.amount > 0 ? bucketColors[t.bucket] : 'var(--color-muted)' }}>{fmt(t.amount)}</p>
            <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 3 }}>{t.count} invoice{t.count !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {data.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', background: 'var(--color-panel)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <CheckCircle size={32} color="#16A34A" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#16A34A' }}>No outstanding invoices</p>
        </div>
      ) : (
        <div className="forge-card">
          <table className="forge-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Project</th>
                <th>Total</th>
                <th>Outstanding</th>
                <th>Due Date</th>
                <th>Age</th>
                <th>Bucket</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>{row.invoice}</td>
                  <td style={{ fontSize: 12 }}>{row.client}</td>
                  <td style={{ fontSize: 12, color: 'var(--color-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.project}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtFull(row.invoiced)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#DC2626', fontSize: 12 }}>{fmtFull(row.outstanding)}</td>
                  <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>{row.due_date !== '—' ? new Date(row.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}</td>
                  <td style={{ fontSize: 11, fontWeight: 600, color: bucketColors[row.bucket] ?? 'var(--color-muted)' }}>{row.days_out > 0 ? `${row.days_out}d` : 'Current'}</td>
                  <td>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, color: bucketColors[row.bucket] ?? '#6B7280', background: (bucketColors[row.bucket] ?? '#6B7280') + '18' }}>
                      {row.bucket}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── ALLOWANCE RECONCILIATION ── */
function AllowanceTab({ data, onExport }: { data: any[]; onExport: () => void }) {
  const totalEstimated = data.reduce((s, r) => s + r.estimated, 0);
  const totalActual    = data.reduce((s, r) => s + r.actual, 0);
  const totalDelta     = totalActual - totalEstimated;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>Allowance Reconciliation</h2>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Estimated allowances vs actual receipts — {data.length} items pending</p>
        </div>
        <button onClick={onExport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#16A34A', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <Download size={13} /> Export XLSX
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Estimated',  value: fmtFull(totalEstimated), color: '#1E5FA4' },
          { label: 'Actual Receipts',  value: fmtFull(totalActual),    color: '#16A34A' },
          { label: 'Net Delta',        value: fmtFull(totalDelta),     color: totalDelta > 0 ? '#DC2626' : '#16A34A' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6 }}>{stat.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(30,95,164,0.05)', border: '1px solid rgba(30,95,164,0.15)', marginBottom: 20 }}>
        <p style={{ fontSize: 11, color: '#1E5FA4', lineHeight: 1.7 }}>
          <strong>Accounting Bridge:</strong> Items below represent allowances from signed quotes where actual vendor receipts have not yet been uploaded. Upload receipts in the project vault to calculate the exact delta and auto-generate a change order if the client has gone over allowance.
        </p>
      </div>

      {data.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', background: 'var(--color-panel)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <CheckCircle size={32} color="#16A34A" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: '#16A34A' }}>No allowances pending reconciliation</p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 6 }}>Sign quotes with allowance items to track them here</p>
        </div>
      ) : (
        <div className="forge-card">
          <table className="forge-table">
            <thead>
              <tr>
                <th>Quote</th>
                <th>Client</th>
                <th>Allowance Item</th>
                <th>Estimated</th>
                <th>Actual</th>
                <th>Delta</th>
                <th>Status</th>
                <th>Action Required</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.quote}</td>
                  <td style={{ fontSize: 12 }}>{row.client}</td>
                  <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.item}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#1E5FA4' }}>{fmtFull(row.estimated)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted)' }}>{row.actual > 0 ? fmtFull(row.actual) : '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: row.delta > 0 ? '#DC2626' : row.delta < 0 ? '#16A34A' : 'var(--color-muted)' }}>
                    {row.actual > 0 ? fmtFull(row.delta) : '—'}
                  </td>
                  <td>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(217,119,6,0.10)', color: '#D97706' }}>
                      {row.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--color-muted)', fontStyle: 'italic' }}>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── WIP REPORT ── */
function WIPTab({ data, onExport }: { data: any[]; onExport: () => void }) {
  const RISK_CONFIG: Record<string, { color: string; bg: string }> = {
    'On Track':    { color: '#16A34A', bg: 'rgba(22,163,74,0.10)'   },
    'Over-billed': { color: '#DC2626', bg: 'rgba(220,38,38,0.10)'   },
    'Under-billed':{ color: '#D97706', bg: 'rgba(217,119,6,0.10)'   },
  };

  const totalBudget    = data.reduce((s, r) => s + r.budget, 0);
  const totalInvoiced  = data.reduce((s, r) => s + r.invoiced, 0);
  const totalCollected = data.reduce((s, r) => s + r.collected, 0);
  const totalVariance  = data.reduce((s, r) => s + r.variance, 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>Work In Progress (WIP)</h2>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>% complete vs % budget billed — {data.length} active projects</p>
        </div>
        <button onClick={onExport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#16A34A', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <Download size={13} /> Export XLSX
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Budget',    value: fmtFull(totalBudget),    color: '#6B7280' },
          { label: 'Total Invoiced',  value: fmtFull(totalInvoiced),  color: '#1E5FA4' },
          { label: 'Collected',       value: fmtFull(totalCollected), color: '#16A34A' },
          { label: 'Net Variance',    value: fmtFull(totalVariance),  color: totalVariance >= 0 ? '#16A34A' : '#DC2626' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6 }}>{stat.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {data.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', background: 'var(--color-panel)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <FileText size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>No active projects</p>
        </div>
      ) : (
        <div className="forge-card">
          <table className="forge-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Stage</th>
                <th>Budget</th>
                <th>Invoiced</th>
                <th>% Complete</th>
                <th>% Billed</th>
                <th>Variance</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const rc = RISK_CONFIG[row.risk] ?? RISK_CONFIG['On Track'];
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{row.project}</td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{row.client}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)' }}>{row.stage}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtFull(row.budget)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtFull(row.invoiced)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 50, height: 6, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.pct_complete}%`, borderRadius: 100, background: '#16A34A' }} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.pct_complete}%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 50, height: 6, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.pct_invoiced}%`, borderRadius: 100, background: '#1E5FA4' }} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.pct_invoiced}%</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: row.variance >= 0 ? '#16A34A' : '#DC2626' }}>
                      {row.variance >= 0 ? '+' : ''}{fmtFull(row.variance)}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, color: rc.color, background: rc.bg }}>
                        {row.risk}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}