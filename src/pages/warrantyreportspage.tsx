import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, RefreshCw, TrendingUp, TrendingDown,
  DollarSign, AlertTriangle, Clock, CheckCircle2, FileText,
  ChevronDown, ChevronUp, Calendar,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, subMonths } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  fiscal_year_start_month: number;
  fiscal_year_start_day: number;
  timezone: string;
}

interface FinancialSummary {
  fiscal_year_start: string;
  prev_fiscal_year_start: string;
  ytd_total: number;
  prev_ytd_total: number;
  by_category: Record<string, number>;
  by_community: { community: string; total: number; case_count: number }[];
  pending_po_value: number;
  pending_po_count: number;
  conciliation_liability: number;
  monthly_spend: { month: string; month_date: string; total: number; labor: number; material: number; subcontract: number; gas: number }[];
}

interface TradeRow {
  vendor_name: string;
  total_spend: number;
  po_count: number;
  approved_count: number;
  pending_count: number;
  avg_amount: number;
  last_po_at: string | null;
}

interface ERPExportRow {
  transaction_date: string;
  po_number: string;
  lot_number: string;
  civic_address: string;
  community: string;
  vendor_name: string;
  description: string;
  expense_type: string;
  cost_code: string;
  gl_account: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  approved_by: string;
  case_number: string;
}

interface ConciliationLiability {
  id: string;
  case_number: string;
  lot_address: string;
  community: string;
  stage: string;
  warranted_count: number;
  estimated_exposure: number;
  actual_billed: number | null;
  directory_hit: boolean;
  inspection_date: string | null;
}

// ─── Constants ────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  labor:       { label: 'Labor',       color: '#3F6A8F', bg: 'rgba(30,95,164,0.10)'   },
  material:    { label: 'Material',    color: '#6B5B95', bg: 'rgba(124,58,237,0.10)'  },
  subcontract: { label: 'Subcontract', color: '#9A6A16', bg: 'rgba(217,119,6,0.10)'   },
  gas:         { label: 'Gas/Travel',  color: '#3F7A8C', bg: 'rgba(8,145,178,0.10)'   },
  overhead:    { label: 'Overhead',    color: '#6C7280', bg: 'rgba(107,114,128,0.10)' },
  other:       { label: 'Other',       color: '#8C919C', bg: 'rgba(156,163,175,0.10)' },
};

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  rfc:        { label: 'RFC Filed',   color: '#9A6A16' },
  inspection: { label: 'Inspection',  color: '#A5402F' },
  warranted:  { label: 'Warranted',   color: '#6B5B95' },
  claim:      { label: 'Claim',       color: '#A5402F' },
};

const FISCAL_MONTHS = [
  { value: 1,  label: 'January'   },
  { value: 2,  label: 'February'  },
  { value: 3,  label: 'March'     },
  { value: 4,  label: 'April'     },
  { value: 5,  label: 'May'       },
  { value: 6,  label: 'June'      },
  { value: 7,  label: 'July'      },
  { value: 8,  label: 'August'    },
  { value: 9,  label: 'September' },
  { value: 10, label: 'October'   },
  { value: 11, label: 'November'  },
  { value: 12, label: 'December'  },
];

// ─── Helpers ──────────────────────────────────────────────────

function fmt(amount: number): string {
  return '$' + amount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtK(amount: number): string {
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000)    return '$' + (amount / 1000).toFixed(1) + 'K';
  return '$' + amount.toFixed(0);
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function downloadCSV(rows: ERPExportRow[], filename: string) {
  const headers = [
    'Transaction Date', 'PO Number', 'Case Number', 'Lot Number',
    'Civic Address', 'Community', 'Vendor', 'Description',
    'Expense Type', 'Cost Code', 'GL Account',
    'Amount', 'Tax', 'Total', 'Approved By',
  ];
  const csvRows = [
    headers.join(','),
    ...rows.map(r => [
      r.transaction_date,
      r.po_number ?? '',
      r.case_number ?? '',
      r.lot_number ?? '',
      `"${r.civic_address ?? ''}"`,
      `"${r.community ?? ''}"`,
      `"${r.vendor_name ?? ''}"`,
      `"${r.description ?? ''}"`,
      r.expense_type ?? '',
      r.cost_code ?? '',
      r.gl_account ?? '',
      r.amount?.toFixed(2) ?? '0.00',
      r.tax_amount?.toFixed(2) ?? '0.00',
      r.total_amount?.toFixed(2) ?? '0.00',
      `"${r.approved_by ?? ''}"`,
    ].join(',')),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Mini bar chart ───────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 4, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 100, transition: 'width 0.4s ease' }} />
    </div>
  );
}

// ─── Stat tile ────────────────────────────────────────────────

function StatTile({
  label, value, sub, color, trend, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  trend?: number;
  icon?: LucideIcon;
}) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)' }}>{label}</p>
        {Icon && <Icon size={14} color="var(--color-muted)" strokeWidth={1.5} />}
      </div>
      <p style={{ fontSize: 26, fontWeight: 900, color: color ?? 'var(--color-text)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 6 }}>{value}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trend !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, background: trend >= 0 ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)' }}>
            {trend >= 0 ? <TrendingUp size={10} color="#A5402F" /> : <TrendingDown size={10} color="#4A7A55" />}
            <span style={{ fontSize: 10, fontWeight: 700, color: trend >= 0 ? '#A5402F' : '#4A7A55' }}>
              {Math.abs(trend)}% vs last FY
            </span>
          </div>
        )}
        {sub && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{sub}</span>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function WarrantyReportsPage() {
  const navigate = useNavigate();

  const [company, setCompany]               = useState<Company | null>(null);
  const [summary, setSummary]               = useState<FinancialSummary | null>(null);
  const [trades, setTrades]                 = useState<TradeRow[]>([]);
  const [concilLiability, setConcilLiability] = useState<ConciliationLiability[]>([]);
  const [exportRows, setExportRows]         = useState<ERPExportRow[]>([]);

  const [activeTab, setActiveTab]           = useState<'dashboard' | 'breakdown' | 'trades' | 'export' | 'liability' | 'settings'>('dashboard');
  const [loading, setLoading]               = useState(true);
  const [exporting, setExporting]           = useState(false);
  const [expandedCommunity, setExpandedCommunity] = useState<string | null>(null);

  // Export date range
  const [exportFrom, setExportFrom]         = useState(format(subMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [exportTo, setExportTo]             = useState(format(new Date(), 'yyyy-MM-dd'));

  // Fiscal settings
  const [fiscalMonth, setFiscalMonth]       = useState(1);
  const [savingFiscal, setSavingFiscal]     = useState(false);

  // ── Fetch company ────────────────────────────────────────────

  const fetchCompany = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('users').select('company_id').eq('id', user.id).single();
    if (!profile) return;
    const { data } = await supabase.from('companies').select('id, name, fiscal_year_start_month, fiscal_year_start_day, timezone').eq('id', profile.company_id).single();
    if (data) {
      setCompany(data as Company);
      setFiscalMonth((data as Company).fiscal_year_start_month ?? 1);
    }
  }, []);

  // ── Fetch financial summary ──────────────────────────────────

  const fetchSummary = useCallback(async () => {
    if (!company) return;
    const { data } = await supabase.rpc('get_financial_summary', { p_company_id: company.id });
    if (data) setSummary(data as FinancialSummary);
  }, [company]);

  // ── Fetch trade ledger ───────────────────────────────────────

  const fetchTrades = useCallback(async () => {
    if (!company) return;
    const { data } = await supabase
      .from('purchase_orders')
      .select('vendor_name, total_amount, status, created_at, approved_at')
      .eq('company_id', company.id)
      .not('status', 'eq', 'cancelled');
    if (!data) return;

    const tradeMap: Record<string, TradeRow> = {};
    for (const po of data as { vendor_name: string; total_amount: number; status: string; created_at: string; approved_at: string | null }[]) {
      if (!tradeMap[po.vendor_name]) {
        tradeMap[po.vendor_name] = {
          vendor_name:    po.vendor_name,
          total_spend:    0,
          po_count:       0,
          approved_count: 0,
          pending_count:  0,
          avg_amount:     0,
          last_po_at:     null,
        };
      }
      const t = tradeMap[po.vendor_name];
      t.po_count++;
      if (po.status === 'approved' || po.status === 'paid') {
        t.total_spend    += po.total_amount;
        t.approved_count++;
      }
      if (po.status === 'pending_approval') t.pending_count++;
      if (!t.last_po_at || po.created_at > t.last_po_at) t.last_po_at = po.created_at;
    }
    const list = Object.values(tradeMap).map(t => ({
      ...t,
      avg_amount: t.approved_count > 0 ? t.total_spend / t.approved_count : 0,
    })).sort((a, b) => b.total_spend - a.total_spend);
    setTrades(list);
  }, [company]);

  // ── Fetch conciliation liability ─────────────────────────────

  const fetchConcilLiability = useCallback(async () => {
    if (!company) return;
    const { data: subcases } = await supabase
      .from('conciliation_subcases')
      .select(`
        id, stage, inspection_date, builder_directory_hit,
        tarion_claim_amount, total_billed_to_builder,
        cases:case_id ( case_number, company_id,
          warranty_lots:lot_id ( address,
            warranty_communities:community_id ( name )
          )
        )
      `)
      .is('outcome', null)
      .not('stage', 'eq', 'cancelled');

    if (!subcases) return;

    // Filter by company
    const filtered = (subcases as Record<string, unknown>[]).filter(s => {
      const c = s.cases as Record<string, unknown> | null;
      return c?.company_id === company.id;
    });

    // Get warranted item counts
    const subcaseIds = filtered.map(s => s.id as string);
    const { data: items } = subcaseIds.length > 0 ? await supabase
      .from('conciliation_items')
      .select('subcase_id, tarion_determination')
      .in('subcase_id', subcaseIds)
      .eq('tarion_determination', 'warranted') : { data: [] };

    const warrantedCounts: Record<string, number> = {};
    for (const item of (items ?? []) as { subcase_id: string }[]) {
      warrantedCounts[item.subcase_id] = (warrantedCounts[item.subcase_id] ?? 0) + 1;
    }

    const mapped: ConciliationLiability[] = filtered.map(s => {
      const c    = s.cases as Record<string, unknown> | null;
      const lot  = c?.warranty_lots as Record<string, unknown> | null;
      const comm = lot?.warranty_communities as Record<string, unknown> | null;
      const wc   = warrantedCounts[s.id as string] ?? 0;
      return {
        id:                  s.id as string,
        case_number:         c?.case_number as string ?? '—',
        lot_address:         lot?.address as string ?? '—',
        community:           comm?.name as string ?? '—',
        stage:               s.stage as string,
        warranted_count:     wc,
        estimated_exposure:  s.stage === 'claim' ? (s.total_billed_to_builder as number ?? 0) : wc * 2500,
        actual_billed:       s.total_billed_to_builder as number | null,
        directory_hit:       s.builder_directory_hit as boolean,
        inspection_date:     s.inspection_date as string | null,
      };
    });

    setConcilLiability(mapped.sort((a, b) => b.estimated_exposure - a.estimated_exposure));
  }, [company]);

  // ── Fetch ERP export data ────────────────────────────────────

  const fetchExportData = useCallback(async () => {
    if (!company) return;
    setExporting(true);
    const { data } = await supabase.rpc('get_erp_export', {
      p_company_id: company.id,
      p_from:       exportFrom,
      p_to:         exportTo,
    });
    if (data) setExportRows(data as ERPExportRow[]);
    setExporting(false);
  }, [company, exportFrom, exportTo]);

  // ── Save fiscal settings ─────────────────────────────────────

  async function handleSaveFiscal() {
    if (!company) return;
    setSavingFiscal(true);
    await supabase.from('companies').update({
      fiscal_year_start_month: fiscalMonth,
      fiscal_year_start_day:   1,
    }).eq('id', company.id);
    await fetchCompany();
    await fetchSummary();
    setSavingFiscal(false);
  }

  useEffect(() => { fetchCompany(); }, [fetchCompany]);
  useEffect(() => {
    if (company) {
      setLoading(true);
      Promise.all([fetchSummary(), fetchTrades(), fetchConcilLiability()])
        .finally(() => setLoading(false));
    }
  }, [company, fetchSummary, fetchTrades, fetchConcilLiability]);

  useEffect(() => {
    if (activeTab === 'export' && company) fetchExportData();
  }, [activeTab, company, fetchExportData]);

  const ytdChange  = summary ? pctChange(summary.ytd_total, summary.prev_ytd_total) : 0;
  const totalLiab  = concilLiability.reduce((s, c) => s + c.estimated_exposure, 0);
  const maxComm    = summary?.by_community ? Math.max(...summary.by_community.map(c => c.total)) : 1;
  const maxTrade   = trades.length > 0 ? trades[0].total_spend : 1;
  const maxMonth   = summary?.monthly_spend ? Math.max(...summary.monthly_spend.map(m => m.total)) : 1;

  const TABS = [
    { key: 'dashboard',  label: 'Dashboard'      },
    { key: 'breakdown',  label: 'Cost Breakdown'  },
    { key: 'trades',     label: 'Trade Ledger'    },
    { key: 'liability',  label: 'Conciliation Liability' },
    { key: 'export',     label: 'ERP Export'      },
    { key: 'settings',   label: 'Fiscal Settings' },
  ] as const;

  if (!company) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-muted)', fontSize: 13 }}>
      Loading…
    </div>
  );

  const inputStyle = {
    padding: '8px 12px', borderRadius: 7, border: '1px solid var(--color-border)',
    background: 'var(--color-mist)', fontSize: 12, color: 'var(--color-text)',
    fontFamily: 'var(--font-body)', outline: 'none',
  };

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1300, margin: '0 auto', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, padding: 0, fontFamily: 'var(--font-body)' }}>
            <ArrowLeft size={13} /> Back
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text)', marginBottom: 2 }}>
              Financial Reports
            </h1>
            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              {company.name} · Fiscal year starts {FISCAL_MONTHS.find(m => m.value === company.fiscal_year_start_month)?.label} 1
              {summary && ` · FY ${format(new Date(summary.fiscal_year_start), 'MMM d, yyyy')} → present`}
            </p>
          </div>
        </div>
        <button onClick={() => { fetchSummary(); fetchTrades(); fetchConcilLiability(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 7, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 11, fontFamily: 'var(--font-body)' }}>
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 12,
              fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? 'var(--color-text)' : 'var(--color-muted)',
              borderBottom: activeTab === tab.key ? '2px solid #3F6A8F' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && activeTab !== 'export' && activeTab !== 'settings' ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
          Loading financial data…
        </div>
      ) : (
        <>

          {/* ── DASHBOARD ──────────────────────────────────────── */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Stat row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                <StatTile
                  label="Warranty Spend YTD"
                  value={fmtK(summary?.ytd_total ?? 0)}
                  trend={ytdChange}
                  color={ytdChange > 20 ? '#A5402F' : 'var(--color-text)'}
                  icon={DollarSign}
                />
                <StatTile
                  label="Pending PO Value"
                  value={fmtK(summary?.pending_po_value ?? 0)}
                  sub={`${summary?.pending_po_count ?? 0} POs awaiting approval`}
                  color={summary?.pending_po_count ?? 0 > 0 ? '#9A6A16' : 'var(--color-text)'}
                  icon={Clock}
                />
                <StatTile
                  label="Conciliation Exposure"
                  value={fmtK(totalLiab)}
                  sub={`${concilLiability.length} active conciliations`}
                  color={totalLiab > 50000 ? '#A5402F' : totalLiab > 10000 ? '#9A6A16' : '#4A7A55'}
                  icon={AlertTriangle}
                />
                <StatTile
                  label="Prev FY Same Period"
                  value={fmtK(summary?.prev_ytd_total ?? 0)}
                  sub="comparison baseline"
                  icon={TrendingUp}
                />
              </div>

              {/* Monthly spend chart */}
              {summary?.monthly_spend && summary.monthly_spend.length > 0 && (
                <div style={{ padding: '20px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 16 }}>Monthly Warranty Spend — Current Fiscal Year</p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                    {summary.monthly_spend.map(m => {
                      const h = maxMonth > 0 ? Math.max(4, (m.total / maxMonth) * 110) : 4;
                      return (
                        <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{fmtK(m.total)}</span>
                          <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: 'linear-gradient(180deg, #3F6A8F 0%, rgba(30,95,164,0.6) 100%)', height: h, minHeight: 4, position: 'relative' }}>
                            {/* Stacked breakdown inside bar */}
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${m.labor / m.total * 100}%`, background: '#3F6A8F', borderRadius: '2px 2px 0 0' }} />
                          </div>
                          <span style={{ fontSize: 8, color: 'var(--color-muted)', textAlign: 'center' }}>{m.month.split(' ')[0]}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                    {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: cfg.color }} />
                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{cfg.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Community breakdown */}
              {summary?.by_community && summary.by_community.length > 0 && (
                <div style={{ padding: '20px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 16 }}>Spend by Community — YTD</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {summary.by_community.map(c => (
                      <div key={c.community}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', width: 140, flexShrink: 0 }}>{c.community}</span>
                          <MiniBar value={c.total} max={maxComm} color="#3F6A8F" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', width: 80, textAlign: 'right', flexShrink: 0 }}>{fmtK(c.total)}</span>
                          <span style={{ fontSize: 10, color: 'var(--color-muted)', width: 60, flexShrink: 0 }}>{c.case_count} cases</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Category breakdown */}
              {summary?.by_category && Object.keys(summary.by_category).length > 0 && (
                <div style={{ padding: '20px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 16 }}>Spend by Category — YTD</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {Object.entries(summary.by_category).map(([cat, total]) => {
                      const cfg = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.other;
                      const pct = summary.ytd_total > 0 ? Math.round((total / summary.ytd_total) * 100) : 0;
                      return (
                        <div key={cat} style={{ padding: '12px 14px', borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.color}25` }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{cfg.label}</p>
                          <p style={{ fontSize: 18, fontWeight: 900, color: cfg.color, fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{fmtK(total)}</p>
                          <p style={{ fontSize: 10, color: cfg.color, opacity: 0.8 }}>{pct}% of total</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!summary && (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <DollarSign size={36} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>No financial data yet</p>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Approve work order expenses to see costs here.</p>
                </div>
              )}
            </div>
          )}

          {/* ── COST BREAKDOWN ─────────────────────────────────── */}
          {activeTab === 'breakdown' && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16 }}>
                Drill down from community → case → individual expense. Every dollar traceable to a specific defect on a specific lot.
              </p>
              {summary?.by_community && summary.by_community.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {summary.by_community.map(comm => (
                    <div key={comm.community} style={{ borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                      <div
                        onClick={() => setExpandedCommunity(expandedCommunity === comm.community ? null : comm.community)}
                        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', flex: 1 }}>{comm.community}</span>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{comm.case_count} cases</span>
                        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', width: 100, textAlign: 'right' }}>{fmt(comm.total)}</span>
                        <MiniBar value={comm.total} max={maxComm} color="#3F6A8F" />
                        {expandedCommunity === comm.community
                          ? <ChevronUp size={13} color="var(--color-muted)" />
                          : <ChevronDown size={13} color="var(--color-muted)" />
                        }
                      </div>
                      {expandedCommunity === comm.community && (
                        <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--color-border)' }}>
                          <p style={{ fontSize: 11, color: 'var(--color-muted)', padding: '12px 0 8px' }}>
                            Case-level breakdown coming as work orders are logged against cases.
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <FileText size={36} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>No expense data yet</p>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Log and approve work order expenses to see the breakdown.</p>
                </div>
              )}
            </div>
          )}

          {/* ── TRADE LEDGER ───────────────────────────────────── */}
          {activeTab === 'trades' && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16 }}>
                Total spend per vendor across all communities. Approved POs only.
              </p>
              {trades.length === 0 ? (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <DollarSign size={36} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>No trade data yet</p>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Create and approve POs to see trade spend here.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 12, padding: '8px 16px' }}>
                    {['Vendor', 'Total Spend', 'Approved POs', 'Pending', 'Avg PO', 'Last Activity'].map(h => (
                      <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
                    ))}
                  </div>
                  {trades.map((trade, i) => (
                    <div key={trade.vendor_name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 12, padding: '14px 16px', borderRadius: 8, background: 'var(--color-panel)', border: '1px solid var(--color-border)', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>{trade.vendor_name}</p>
                        <MiniBar value={trade.total_spend} max={maxTrade} color="#3F6A8F" />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{fmtK(trade.total_spend)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <CheckCircle2 size={11} color="#4A7A55" />
                        <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{trade.approved_count}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {trade.pending_count > 0 && (
                          <>
                            <Clock size={11} color="#9A6A16" />
                            <span style={{ fontSize: 12, color: '#9A6A16', fontWeight: 600 }}>{trade.pending_count}</span>
                          </>
                        )}
                        {trade.pending_count === 0 && <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>—</span>}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{fmtK(trade.avg_amount)}</span>
                      <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                        {trade.last_po_at ? format(new Date(trade.last_po_at), 'MMM d, yyyy') : '—'}
                      </span>
                    </div>
                  ))}
                  {/* Total row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 12, padding: '14px 16px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>Total — All Vendors</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#3F6A8F', fontFamily: 'var(--font-mono)' }}>
                      {fmtK(trades.reduce((s, t) => s + t.total_spend, 0))}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>
                      {trades.reduce((s, t) => s + t.approved_count, 0)}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#9A6A16' }}>
                      {trades.reduce((s, t) => s + t.pending_count, 0)}
                    </span>
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── CONCILIATION LIABILITY ─────────────────────────── */}
          {activeTab === 'liability' && (
            <div>
              {/* Liability summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatTile
                  label="Total Estimated Exposure"
                  value={fmtK(totalLiab)}
                  sub="worst case if all go to claim"
                  color={totalLiab > 50000 ? '#A5402F' : '#9A6A16'}
                  icon={AlertTriangle}
                />
                <StatTile
                  label="Active Conciliations"
                  value={String(concilLiability.length)}
                  sub={`${concilLiability.filter(c => c.stage === 'claim').length} at claim stage`}
                  color={concilLiability.filter(c => c.stage === 'claim').length > 0 ? '#A5402F' : 'var(--color-text)'}
                  icon={FileText}
                />
                <StatTile
                  label="Directory Hits"
                  value={String(concilLiability.filter(c => c.directory_hit).length)}
                  sub="public Tarion builder directory"
                  color={concilLiability.filter(c => c.directory_hit).length > 0 ? '#A5402F' : '#4A7A55'}
                  icon={AlertTriangle}
                />
              </div>

              {concilLiability.length === 0 ? (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <CheckCircle2 size={36} color="#4A7A55" strokeWidth={1} style={{ marginBottom: 12 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#4A7A55', marginBottom: 6 }}>No active conciliation liability</p>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>All conciliations resolved or no active RFC filed.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px 120px 100px', gap: 12, padding: '8px 16px' }}>
                    {['Case / Address', 'Community', 'Stage', 'Warranted', 'Est. Exposure', 'Risk'].map(h => (
                      <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
                    ))}
                  </div>
                  {concilLiability.map(c => {
                    const stageCfg  = STAGE_CONFIG[c.stage] ?? STAGE_CONFIG.rfc;
                    const isClaim   = c.stage === 'claim';
                    return (
                      <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px 120px 100px', gap: 12, padding: '14px 16px', borderRadius: 8, background: 'var(--color-panel)', border: `1px solid ${isClaim ? 'rgba(220,38,38,0.2)' : 'var(--color-border)'}`, alignItems: 'center' }}>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 2 }}>#{c.case_number}</p>
                          <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{c.lot_address}</p>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--color-text)' }}>{c.community}</span>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 100, background: `${stageCfg.color}12`, border: `1px solid ${stageCfg.color}25`, width: 'fit-content' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: stageCfg.color }}>{stageCfg.label}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.warranted_count > 0 ? '#A5402F' : 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                          {c.warranted_count > 0 ? `${c.warranted_count} items` : '—'}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: isClaim ? '#A5402F' : '#9A6A16', fontFamily: 'var(--font-mono)' }}>
                          {fmt(c.estimated_exposure)}
                        </span>
                        <div>
                          {c.directory_hit && (
                            <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(220,38,38,0.12)', color: '#A5402F', border: '1px solid rgba(220,38,38,0.25)' }}>
                              DIR HIT
                            </span>
                          )}
                          {!c.directory_hit && isClaim && (
                            <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(220,38,38,0.08)', color: '#A5402F' }}>HIGH</span>
                          )}
                          {!c.directory_hit && !isClaim && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(217,119,6,0.08)', color: '#9A6A16' }}>MED</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Total */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px 120px 100px', gap: 12, padding: '14px 16px', borderRadius: 8, background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>Total Exposure</span>
                    <span /><span /><span />
                    <span style={{ fontSize: 15, fontWeight: 900, color: '#A5402F', fontFamily: 'var(--font-mono)' }}>{fmt(totalLiab)}</span>
                    <span />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ERP EXPORT ─────────────────────────────────────── */}
          {activeTab === 'export' && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16 }}>
                Download approved warranty costs formatted for import into any ERP or accounting system. Every row includes GL account, cost code, lot number, and job reference.
              </p>

              {/* Date range + download */}
              <div style={{ padding: '20px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)', marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 14 }}>Export Parameters</p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 5, display: 'block' }}>From</label>
                    <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 5, display: 'block' }}>To</label>
                    <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)} style={inputStyle} />
                  </div>
                  <button onClick={fetchExportData} style={{ padding: '9px 18px', borderRadius: 7, background: '#3F6A8F', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    Load Data
                  </button>
                  {exportRows.length > 0 && (
                    <button
                      onClick={() => downloadCSV(exportRows, `warranty-export-${exportFrom}-to-${exportTo}.csv`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, background: '#4A7A55', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                    >
                      <Download size={13} /> Download CSV ({exportRows.length} rows)
                    </button>
                  )}
                </div>
              </div>

              {exporting ? (
                <p style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: '40px 0' }}>Loading export data…</p>
              ) : exportRows.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <Download size={36} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>No approved expenses in this period</p>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Adjust the date range or approve work order expenses first.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-mist)' }}>
                        {['Date', 'PO #', 'Case #', 'Lot', 'Address', 'Community', 'Vendor', 'Description', 'Type', 'Cost Code', 'GL Account', 'Amount', 'Tax', 'Total', 'Approved By'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {exportRows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--color-border)', background: i % 2 === 0 ? 'var(--color-panel)' : 'var(--color-mist)' }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, whiteSpace: 'nowrap' }}>{row.transaction_date}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{row.po_number ?? '—'}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{row.case_number ?? '—'}</td>
                          <td style={{ padding: '8px 10px' }}>{row.lot_number ?? '—'}</td>
                          <td style={{ padding: '8px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.civic_address ?? '—'}</td>
                          <td style={{ padding: '8px 10px' }}>{row.community ?? '—'}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.vendor_name ?? '—'}</td>
                          <td style={{ padding: '8px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description ?? '—'}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: (CATEGORY_CONFIG[row.expense_type] ?? CATEGORY_CONFIG.other).bg, color: (CATEGORY_CONFIG[row.expense_type] ?? CATEGORY_CONFIG.other).color }}>
                              {(CATEGORY_CONFIG[row.expense_type] ?? CATEGORY_CONFIG.other).label}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{row.cost_code ?? '—'}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{row.gl_account ?? '—'}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmt(row.amount)}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--color-muted)' }}>{fmt(row.tax_amount)}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }}>{fmt(row.total_amount)}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{row.approved_by ?? '—'}</td>
                        </tr>
                      ))}
                      {/* Total row */}
                      <tr style={{ background: 'var(--color-mist)', fontWeight: 700 }}>
                        <td colSpan={11} style={{ padding: '10px', textAlign: 'right', fontSize: 11, color: 'var(--color-muted)' }}>Total ({exportRows.length} transactions)</td>
                        <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 900, color: 'var(--color-text)' }}>{fmt(exportRows.reduce((s, r) => s + r.amount, 0))}</td>
                        <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--color-muted)' }}>{fmt(exportRows.reduce((s, r) => s + r.tax_amount, 0))}</td>
                        <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontWeight: 900, textAlign: 'right', color: '#3F6A8F' }}>{fmt(exportRows.reduce((s, r) => s + r.total_amount, 0))}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── FISCAL SETTINGS ────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: 480 }}>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 20 }}>
                Set your company's fiscal year start. All financial reports, YTD comparisons, and monthly charts calculate from this date automatically.
              </p>
              <div style={{ padding: '24px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 16 }}>Fiscal Year Settings</p>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6, display: 'block' }}>
                    Fiscal Year Starts
                  </label>
                  <select value={fiscalMonth} onChange={e => setFiscalMonth(parseInt(e.target.value))}
                    style={{ ...inputStyle, width: '100%' }}>
                    {FISCAL_MONTHS.map(m => (
                      <option key={m.value} value={m.value}>{m.label} 1</option>
                    ))}
                  </select>
                  <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 6 }}>
                    Common: Jan 1 (calendar year), Apr 1 (Ontario gov), Jul 1, Oct 1 (Q4 start)
                  </p>
                </div>

                {summary && (
                  <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', marginBottom: 16 }}>
                    <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      Current FY: <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                        {format(new Date(summary.fiscal_year_start), 'MMM d, yyyy')} → {format(new Date(new Date(summary.fiscal_year_start).setFullYear(new Date(summary.fiscal_year_start).getFullYear() + 1) - 1), 'MMM d, yyyy')}
                      </span>
                    </p>
                  </div>
                )}

                <button onClick={handleSaveFiscal} disabled={savingFiscal}
                  style={{ padding: '10px 24px', borderRadius: 7, background: '#3F6A8F', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {savingFiscal ? 'Saving…' : 'Save Fiscal Settings'}
                </button>
              </div>

              <div style={{ padding: '20px 24px', borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)', marginTop: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 12 }}>ERP Connection Status</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9A6A16' }} />
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>No ERP connected</p>
                    <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Use the CSV export above to import into your accounting system. Native connectors coming soon.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}