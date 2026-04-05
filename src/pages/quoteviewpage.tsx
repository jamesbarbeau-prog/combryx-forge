import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useBrand } from '@/hooks/useBrand';
import {
  ChevronLeft, Download, Send, FileText,
  CheckCircle, Clock, Eye, AlertCircle,
  Copy, ExternalLink, FolderOpen,
} from 'lucide-react';

interface Quote {
  id: string;
  quote_number: string;
  type: string;
  status: string;
  trade: string | null;
  title: string;
  description: string | null;
  line_items: LineItem[];
  show_materials: boolean;
  show_labour: boolean;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment_schedule: PaymentRow[];
  closing_message: string | null;
  valid_until: string | null;
  signed_at: string | null;
  signed_by: string | null;
  signature_data: string | null;
  created_at: string;
  allowances: { text: string }[];
  notes: string | null;
  clients?: { first_name: string; last_name: string; email: string | null } | null;
}

interface LineItem {
  description: string;
  category: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  isAllowance: boolean;
}

interface PaymentRow {
  label: string;
  percent: number;
  trigger: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ElementType }> = {
  draft:     { color: '#6B7280', bg: 'rgba(107,114,128,0.10)', label: 'Draft',     icon: Clock       },
  sent:      { color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',   label: 'Sent',      icon: Send        },
  viewed:    { color: '#D97706', bg: 'rgba(217,119,6,0.10)',   label: 'Viewed',    icon: Eye         },
  signed:    { color: '#16A34A', bg: 'rgba(22,163,74,0.10)',   label: 'Signed',    icon: CheckCircle },
  converted: { color: '#8A7600', bg: 'rgba(252,226,5,0.12)',   label: 'Converted', icon: CheckCircle },
};

export default function QuoteViewPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { brand } = useBrand();

  const [quote, setQuote]     = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [company, setCompany] = useState<any>(null);

  useEffect(() => { if (id) fetchQuote(); }, [id]);

  async function fetchQuote() {
    setLoading(true);
    const [qRes, cRes] = await Promise.all([
      supabase.from('quotes').select('*, clients(first_name, last_name, email)').eq('id', id!).single(),
      supabase.from('company_settings').select('settings').eq('company_id', '00000000-0000-0000-0000-000000000001').single(),
    ]);
    if (qRes.data) setQuote(qRes.data as Quote);
    if (cRes.data?.settings) setCompany(cRes.data.settings);
    setLoading(false);
  }

  async function markAsSent() {
    if (!quote) return;
    setSending(true);
    await supabase.from('quotes').update({ status: 'sent' }).eq('id', quote.id);
    setQuote(prev => prev ? { ...prev, status: 'sent' } : null);
    setSending(false); setSent(true);
    setTimeout(() => setSent(false), 2000);
  }

  function copySigningLink() {
    navigator.clipboard.writeText(`${window.location.origin}/sign/${quote?.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: 13 }}>Loading quote...</div>;
  if (!quote)  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: 13 }}>Quote not found.</div>;

  const StatusIcon    = STATUS_CONFIG[quote.status]?.icon ?? Clock;
  const labourTotal   = (quote.line_items ?? []).filter(i => i.category === 'labour').reduce((s, i) => s + i.amount, 0);
  const materialTotal = (quote.line_items ?? []).filter(i => i.category !== 'labour').reduce((s, i) => s + i.amount, 0);
  const exclusions    = quote.allowances?.filter(a => a.text) ?? [];
  const narrativeSections = (() => { try { return JSON.parse(quote.notes ?? '{}')?.narrativeSections ?? []; } catch { return []; } })();
  const isProposal    = quote.type === 'proposal' || quote.type === 'bid';

  const docProps = { quote, company, brand, exclusions, narrativeSections, isProposal, labourTotal, materialTotal };

  return (
    <>
      <div className="no-print" style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ width: 260, borderRight: '1px solid var(--color-border)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flexShrink: 0 }}>

          <button onClick={() => navigate('/forge/quotes')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, fontFamily: 'var(--font-body)', padding: '0 0 8px 0', borderBottom: '1px solid var(--color-border)' }}>
            <ChevronLeft size={14} /> Back to Quotes
          </button>

          <div style={{ padding: '12px', borderRadius: 9, background: STATUS_CONFIG[quote.status]?.bg ?? 'var(--color-mist)', border: `1px solid ${STATUS_CONFIG[quote.status]?.color ?? 'var(--color-border)'}22` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <StatusIcon size={13} color={STATUS_CONFIG[quote.status]?.color ?? '#6B7280'} strokeWidth={1.5} />
              <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_CONFIG[quote.status]?.color ?? '#6B7280' }}>{STATUS_CONFIG[quote.status]?.label ?? quote.status}</span>
            </div>
            <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{quote.quote_number}</p>
            {quote.valid_until && <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>Valid until {new Date(quote.valid_until).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
          </div>

          {quote.clients && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4 }}>Client</p>
              <p style={{ fontSize: 12, fontWeight: 600 }}>{quote.clients.first_name} {quote.clients.last_name}</p>
              {quote.clients.email && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{quote.clients.email}</p>}
            </div>
          )}

          <div style={{ padding: '12px', borderRadius: 9, background: 'rgba(252,226,5,0.06)', border: '1px solid rgba(252,226,5,0.2)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8A7600', marginBottom: 4 }}>Total</p>
            <p style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#8A7600', letterSpacing: '-0.02em' }}>${quote.total.toFixed(2)}</p>
            <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>Incl. {quote.tax_rate}% HST</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#FCE205', border: 'none', color: '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <Download size={13} strokeWidth={2} /> Download PDF
            </button>

            {quote.status === 'draft' && (
              <button onClick={markAsSent} disabled={sending} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: sent ? '#16A34A' : 'var(--color-mist)', border: '1px solid var(--color-border)', color: sent ? '#FFFFFF' : 'var(--color-text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <Send size={13} strokeWidth={1.5} /> {sent ? 'Marked as Sent!' : sending ? 'Updating...' : 'Mark as Sent'}
              </button>
            )}

            <button onClick={copySigningLink} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: copied ? 'rgba(22,163,74,0.10)' : 'var(--color-mist)', border: `1px solid ${copied ? 'rgba(22,163,74,0.3)' : 'var(--color-border)'}`, color: copied ? '#16A34A' : 'var(--color-text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <Copy size={13} strokeWidth={1.5} /> {copied ? 'Link Copied!' : 'Copy Signing Link'}
            </button>

            <button onClick={() => window.open(`/sign/${quote.id}`, '_blank')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(30,95,164,0.08)', border: '1px solid rgba(30,95,164,0.2)', color: '#1E5FA4', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <ExternalLink size={13} strokeWidth={1.5} /> Open Signing Page
            </button>

            {quote.status === 'signed' && (
              <button onClick={() => navigate(`/forge/projects?fromQuote=${quote.id}&title=${encodeURIComponent(quote.title)}&value=${quote.total}`)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <FolderOpen size={13} strokeWidth={1.5} /> Convert to Project
              </button>
            )}
          </div>

          {quote.status === 'signed' && quote.signed_at && (
            <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <CheckCircle size={13} color="#16A34A" strokeWidth={1.5} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A' }}>Signed</span>
              </div>
              <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>By: {quote.signed_by ?? 'Client'}</p>
              <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{new Date(quote.signed_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              {quote.signature_data && <img src={quote.signature_data} alt="Signature" style={{ width: '100%', marginTop: 8, borderRadius: 4, border: '1px solid var(--color-border)', background: '#FFFFFF' }} />}
            </div>
          )}
        </div>

        {/* Document preview */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#ECEAE5', padding: '24px' }}>
          <DocumentBody {...docProps} />
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          nav, header, aside { display: none !important; }
          body { margin: 0; background: white; }
          .print-doc { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: 28px 32px !important; max-width: 100% !important; }
        }
        @media screen { .print-only { display: none !important; } }
      `}</style>

      <div className="print-only" style={{ padding: '28px 32px', background: '#FFFFFF', minHeight: '100vh' }}>
        <DocumentBody {...docProps} print />
      </div>
    </>
  );
}

/* ── Document Body ── */
function DocumentBody({ quote, company, brand, exclusions, narrativeSections, isProposal, labourTotal, materialTotal, print = false }: {
  quote: Quote;
  company: any;
  brand: { primary: string; dark: string; accent: string; logo_url: string; name: string; email: string; hst: string };
  exclusions: { text: string }[];
  narrativeSections: { title: string; content: string }[];
  isProposal: boolean;
  labourTotal: number;
  materialTotal: number;
  print?: boolean;
}) {
  const p = brand?.primary  ?? '#FCE205';
  const d = brand?.dark     ?? '#111010';
  const a = brand?.accent   ?? '#1E5FA4';
  const companyName = brand?.name  || company?.name  || 'Your Company';
  const companyEmail = brand?.email || company?.email || '';
  const companyHST   = brand?.hst   || company?.hst   || '—';
  const logoUrl      = brand?.logo_url || company?.logo_url || '';

  return (
    <div className={print ? 'print-doc' : ''} style={{ background: '#FFFFFF', borderRadius: print ? 0 : 12, boxShadow: print ? 'none' : '0 4px 24px rgba(0,0,0,0.10)', padding: print ? '28px 32px' : '32px 28px', maxWidth: 720, margin: '0 auto', fontFamily: 'DM Sans, sans-serif' }}>

      {/* Letterhead */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, paddingBottom: 20, borderBottom: `3px solid ${p}` }}>
        <div>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" style={{ height: 48, marginBottom: 10, objectFit: 'contain', borderRadius: 4 }} onError={e => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 10, background: p, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: d }}>{companyName.charAt(0)}</span>
            </div>
          )}
          <p style={{ fontSize: 14, fontWeight: 800, color: d }}>{companyName}</p>
          <p style={{ fontSize: 11, color: '#8C8680' }}>{companyEmail}</p>
          <p style={{ fontSize: 11, color: '#8C8680' }}>HST# {companyHST}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 20, fontWeight: 900, color: d, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{quote.type}</p>
          <p style={{ fontSize: 11, color: '#8C8680', fontFamily: 'monospace' }}>{quote.quote_number}</p>
          <p style={{ fontSize: 11, color: '#8C8680', marginTop: 6 }}>{new Date(quote.created_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          {quote.valid_until && <p style={{ fontSize: 11, color: '#8C8680' }}>Valid until: {new Date(quote.valid_until).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
        </div>
      </div>

      {/* Client */}
      {quote.clients && (
        <div style={{ marginBottom: 22 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 4 }}>Prepared for</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: d }}>{quote.clients.first_name} {quote.clients.last_name}</p>
          {quote.clients.email && <p style={{ fontSize: 12, color: '#6B7280' }}>{quote.clients.email}</p>}
        </div>
      )}

      {/* Title */}
      <p style={{ fontSize: 18, fontWeight: 900, color: d, letterSpacing: '-0.01em', marginBottom: 6 }}>{quote.title}</p>
      {quote.description && <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, marginBottom: 20 }}>{quote.description}</p>}

      {/* Proposal narrative */}
      {isProposal && narrativeSections.map((s: any, i: number) => s.content ? (
        <div key={i} style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 5, borderBottom: '1px solid #F0EDE8', paddingBottom: 4 }}>{s.title}</p>
          <p style={{ fontSize: 12, color: '#4A4640', lineHeight: 1.8 }}>{s.content}</p>
        </div>
      ) : null)}

      {/* Line items */}
      {(quote.line_items ?? []).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 10, borderBottom: '1px solid #F0EDE8', paddingBottom: 4 }}>Scope & Pricing</p>
          {(quote.line_items ?? []).map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F8F7F4' }}>
              <div style={{ flex: 1, marginRight: 16 }}>
                <p style={{ fontSize: 12, color: d, fontWeight: 500 }}>{item.description}</p>
                {item.amount > 0 && item.quantity !== 1 && <p style={{ fontSize: 10, color: '#8C8680' }}>{item.quantity} {item.unit} × ${item.rate?.toLocaleString()}</p>}
                {item.isAllowance && <p style={{ fontSize: 9, fontWeight: 700, color: a, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Allowance</p>}
              </div>
              <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>{item.amount > 0 ? `$${item.amount.toLocaleString()}` : 'TBD'}</p>
            </div>
          ))}
        </div>
      )}

      {/* Totals */}
      <div style={{ padding: '14px 16px', borderRadius: 10, background: '#F8F7F4', marginBottom: 20 }}>
        {quote.show_materials && materialTotal > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: '#6B7280' }}>Materials & Allowances</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6B7280' }}>${materialTotal.toLocaleString()}</span>
          </div>
        )}
        {quote.show_labour && labourTotal > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: '#6B7280' }}>Labour</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6B7280' }}>${labourTotal.toLocaleString()}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #E4E0D8', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>Subtotal</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace' }}>${quote.subtotal.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>HST ({quote.tax_rate}%)</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace' }}>${quote.tax_amount.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: `2px solid ${p}` }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: d }}>Total</span>
          <span style={{ fontSize: 15, fontWeight: 900, fontFamily: 'monospace', color: d }}>${quote.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Exclusions */}
      {exclusions.length > 0 && (
        <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 8, background: '#FFF8F8', border: '1px solid #FECACA' }}>
          <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#DC2626', marginBottom: 8 }}>Exclusions</p>
          {exclusions.map((exc, i) => (
            <p key={i} style={{ fontSize: 11, color: '#4A4640', marginBottom: 4, paddingLeft: 12, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#DC2626', fontWeight: 700 }}>·</span>
              <strong>{exc.text}</strong>
            </p>
          ))}
        </div>
      )}

      {/* Payment schedule */}
      {(quote.payment_schedule ?? []).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 10, borderBottom: '1px solid #F0EDE8', paddingBottom: 4 }}>Payment Schedule</p>
          {(quote.payment_schedule ?? []).map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid #F8F7F4' }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: d }}>{row.label}</p>
                <p style={{ fontSize: 10, color: '#8C8680' }}>{row.trigger}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: d }}>${((quote.total * row.percent) / 100).toFixed(2)}</p>
                <p style={{ fontSize: 10, color: '#8C8680' }}>{row.percent}%</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Allowance disclaimer */}
      <div style={{ padding: '12px 14px', borderRadius: 8, background: `${a}08`, border: `1px solid ${a}20`, marginBottom: 20 }}>
        <p style={{ fontSize: 10, color: a, lineHeight: 1.7, fontStyle: 'italic' }}>
          <strong>Allowance Disclaimer:</strong> Values marked as "Allowances" are estimates for material selection only. Final pricing will be adjusted based on actual vendor receipts plus company markup. Labour is fixed based on standard site conditions.
        </p>
      </div>

      {/* Closing message */}
      {quote.closing_message && (
        <div style={{ padding: '14px', borderRadius: 8, background: `${p}08`, border: `1px solid ${p}30`, marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: '#4A4640', lineHeight: 1.7, fontStyle: 'italic' }}>{quote.closing_message}</p>
        </div>
      )}

      {/* Signature block */}
      {quote.status === 'signed' && quote.signature_data ? (
        <div style={{ borderTop: '1px solid #E4E0D8', paddingTop: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 14 }}>Signed & Accepted</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <img src={quote.signature_data} alt="Client Signature" style={{ width: '100%', height: 60, objectFit: 'contain', borderBottom: `1px solid ${d}`, marginBottom: 5 }} />
              <p style={{ fontSize: 10, color: '#8C8680' }}>Client Signature — {quote.signed_by}</p>
            </div>
            <div>
              <div style={{ height: 60, borderBottom: `1px solid ${d}`, display: 'flex', alignItems: 'flex-end', paddingBottom: 5, marginBottom: 5 }}>
                <p style={{ fontSize: 11, color: d }}>{new Date(quote.signed_at!).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <p style={{ fontSize: 10, color: '#8C8680' }}>Date</p>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid #E4E0D8', paddingTop: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 14 }}>Acceptance & Authorization</p>
          <p style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6, marginBottom: 18 }}>By signing below, you agree to the scope, pricing, exclusions, and payment schedule outlined in this document.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ height: 56, borderBottom: `1px solid ${d}`, marginBottom: 5 }} />
              <p style={{ fontSize: 10, color: '#8C8680' }}>Client Signature</p>
            </div>
            <div>
              <div style={{ height: 56, borderBottom: `1px solid ${d}`, marginBottom: 5 }} />
              <p style={{ fontSize: 10, color: '#8C8680' }}>Date</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}