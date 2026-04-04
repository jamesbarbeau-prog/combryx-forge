import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Plus, Search, FileText, ChevronRight,
  ClipboardList, Briefcase, TrendingUp,
  Clock, CheckCircle, Send, Eye,
} from 'lucide-react';

interface Quote {
  id: string;
  quote_number: string;
  type: string;
  status: string;
  trade: string | null;
  title: string;
  total: number;
  created_at: string;
  valid_until: string | null;
  client_id: string | null;
  clients?: { first_name: string; last_name: string } | null;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ElementType }> = {
  draft:     { color: '#6B7280', bg: 'rgba(107,114,128,0.10)', label: 'Draft',     icon: Clock        },
  sent:      { color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',   label: 'Sent',      icon: Send         },
  viewed:    { color: '#D97706', bg: 'rgba(217,119,6,0.10)',   label: 'Viewed',    icon: Eye          },
  signed:    { color: '#16A34A', bg: 'rgba(22,163,74,0.10)',   label: 'Signed',    icon: CheckCircle  },
  converted: { color: '#8A7600', bg: 'rgba(252,226,5,0.12)',   label: 'Converted', icon: TrendingUp   },
};

const TYPE_TABS = [
  { id: 'all',      label: 'All',       icon: FileText      },
  { id: 'estimate', label: 'Estimates', icon: ClipboardList },
  { id: 'proposal', label: 'Proposals', icon: FileText      },
  { id: 'bid',      label: 'Bids',      icon: Briefcase     },
];

export default function QuotesPage() {
  const navigate  = useNavigate();
  const [quotes, setQuotes]     = useState<Quote[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => { fetchQuotes(); }, []);

  async function fetchQuotes() {
    setLoading(true);
    const { data } = await supabase
      .from('quotes')
      .select('*, clients(first_name, last_name)')
      .eq('company_id', '00000000-0000-0000-0000-000000000001')
      .order('created_at', { ascending: false });
    if (data) setQuotes(data as Quote[]);
    setLoading(false);
  }

  const filtered = quotes.filter(q => {
    const matchTab    = activeTab === 'all' || q.type === activeTab;
    const matchSearch = q.title.toLowerCase().includes(search.toLowerCase()) ||
      (q.clients ? `${q.clients.first_name} ${q.clients.last_name}`.toLowerCase().includes(search.toLowerCase()) : false) ||
      q.quote_number.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const stats = {
    draft:     quotes.filter(q => q.status === 'draft').length,
    sent:      quotes.filter(q => q.status === 'sent').length,
    signed:    quotes.filter(q => q.status === 'signed').length,
    total:     quotes.filter(q => q.status !== 'draft').reduce((s, q) => s + q.total, 0),
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>CRM</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Quotes</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>{quotes.length} documents total</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate('/forge/quotes/new?type=estimate')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >
            <ClipboardList size={13} strokeWidth={1.5} /> New Estimate
          </button>
          <button
            onClick={() => navigate('/forge/quotes/new?type=proposal')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >
            <FileText size={13} strokeWidth={1.5} /> New Proposal
          </button>
          <button
            onClick={() => navigate('/forge/quotes/new?type=bid')}
            className="forge-button forge-button--primary"
            style={{ gap: 6 }}
          >
            <Plus size={13} /> New Bid
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Drafts',        value: stats.draft,  sub: 'in progress',    color: '#6B7280' },
          { label: 'Sent',          value: stats.sent,   sub: 'awaiting reply',  color: '#1E5FA4' },
          { label: 'Signed',        value: stats.signed, sub: 'this month',      color: '#16A34A' },
          { label: 'Pipeline Value', value: `$${stats.total.toLocaleString()}`, sub: 'sent + signed', color: '#8A7600', mono: true },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6 }}>{stat.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: stat.color, letterSpacing: stat.mono ? '-0.02em' : 'normal', fontFamily: stat.mono ? 'var(--font-mono)' : 'var(--font-body)' }}>{stat.value}</p>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--color-mist)', padding: 4, borderRadius: 9, border: '1px solid var(--color-border)' }}>
          {TYPE_TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: active ? 700 : 400,
                  background: active ? 'var(--color-panel)' : 'transparent',
                  border: active ? '1px solid var(--color-border)' : '1px solid transparent',
                  color: active ? 'var(--color-text)' : 'var(--color-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.12s',
                }}
              >
                <Icon size={12} strokeWidth={active ? 2 : 1.5} />
                {tab.label}
                {tab.id !== 'all' && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 100, background: active ? 'rgba(252,226,5,0.15)' : 'var(--color-mist)', color: active ? '#8A7600' : 'var(--color-muted)' }}>
                    {quotes.filter(q => q.type === tab.id).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', width: 260 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input
            style={{ width: '100%', height: 34, paddingLeft: 28, paddingRight: 12, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-mist)', fontSize: 12, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none' }}
            placeholder="Search quotes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="forge-card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Loading quotes...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 40px', textAlign: 'center' }}>
            <FileText size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
              {search ? 'No quotes match your search' : `No ${activeTab === 'all' ? '' : activeTab + 's'} yet`}
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              {!search && 'Create your first document using the buttons above'}
            </p>
          </div>
        ) : (
          <table className="forge-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
                <th>Total</th>
                <th>Valid Until</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(quote => {
                const StatusIcon = STATUS_CONFIG[quote.status]?.icon ?? Clock;
                return (
                  <tr key={quote.id} onClick={() => navigate(`/forge/quotes/${quote.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 13 }}>{quote.title}</p>
                        <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{quote.quote_number}</p>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                      {quote.clients ? `${quote.clients.first_name} ${quote.clients.last_name}` : '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-text-sub)', textTransform: 'capitalize' }}>
                        {quote.type}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: STATUS_CONFIG[quote.status]?.color ?? '#6B7280' }}>
                        <StatusIcon size={11} strokeWidth={1.5} />
                        {STATUS_CONFIG[quote.status]?.label ?? quote.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>
                      ${quote.total.toLocaleString()}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      {quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      {new Date(quote.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </td>
                    <td><ChevronRight size={13} color="var(--color-muted)" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}