import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useBrand } from '@/hooks/useBrand';
import {
  ChevronLeft, Download, Send, CheckCircle,
  Clock, AlertTriangle, DollarSign, Receipt,
  X, Check,
} from 'lucide-react';

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  holdback_amount: number;
  total: number;
  amount_paid: number;
  due_date: string | null;
  paid_at: string | null;
  payment_terms: string | null;
  draw_number: number | null;
  line_items: any[];
  notes: string | null;
  closing_message: string | null;
  created_at: string;
  clients?: { first_name: string; last_name: string; email: string | null } | null;
  projects?: { name: string } | null;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ElementType }> = {
  draft:   { color: '#6B7280', bg: 'rgba(107,114,128,0.10)', label: 'Draft',   icon: Clock         },
  sent:    { color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',   label: 'Sent',    icon: Send          },
  partial: { color: '#D97706', bg: 'rgba(217,119,6,0.10)',   label: 'Partial', icon: AlertTriangle  },
  paid:    { color: '#16A34A', bg: 'rgba(22,163,74,0.10)',   label: 'Paid',    icon: CheckCircle   },
  overdue: { color: '#DC2626', bg: 'rgba(220,38,38,0.10)',   label: 'Overdue', icon: AlertTriangle  },
};

export default function InvoiceViewPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { brand } = useBrand();

  const [invoice, setInvoice]         = useState<Invoice | null>(null);
  const [loading, setLoading]         = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount]     = useState('');
  const [payDate, setPayDate]         = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving]           = useState(false);
  const [company, setCompany]         = useState<any>(null);

  useEffect(() => { if (id) fetchInvoice(); }, [id]);

  async function fetchInvoice() {
    setLoading(true);
    const [invRes, compRes] = await Promise.all([
      supabase.from('invoices').select('*, clients(first_name, last_name, email), projects(name)').eq('id', id!).single(),
      supabase.from('company_settings').select('settings').eq('company_id', '00000000-0000-0000-0000-000000000001').single(),
    ]);
    if (invRes.data) {
      setInvoice(invRes.data as Invoice);
      setPayAmount(String((invRes.data.total - invRes.data.amount_paid).toFixed(2)));
    }
    if (compRes.data?.settings) setCompany(compRes.data.settings);
    setLoading(false);
  }

  async function markAsSent() {
    if (!invoice) return;
    setSaving(true);
    await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoice.id);
    setInvoice(prev => prev ? { ...prev, status: 'sent' } : null);
    setSaving(false);
  }

  async function recordPayment() {
    if (!invoice || !payAmount) return;
    setSaving(true);
    const paid      = invoice.amount_paid + Number(payAmount);
    const newStatus = paid >= invoice.total ? 'paid' : 'partial';
    await supabase.from('invoices').update({
      amount_paid: paid,
      status:      newStatus,
      paid_at:     newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', invoice.id);
    setInvoice(prev => prev ? { ...prev, amount_paid: paid, status: newStatus } : null);
    setShowPayment(false);
    setSaving(false);
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: 13 }}>Loading invoice...</div>;
  if (!invoice) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-muted)', fontSize: 13 }}>Invoice not found.</div>;

  const sc          = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG['draft'];
  const StatusIcon  = sc.icon;
  const outstanding = invoice.total - invoice.amount_paid;
  const isOverdue   = invoice.due_date && new Date(invoice.due_date) < new Date() && invoice.status !== 'paid';

  return (
    <>
      <div className="no-print" style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ width: 260, borderRight: '1px solid var(--color-border)', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flexShrink: 0 }}>

          <button onClick={() => navigate('/forge/invoices')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, fontFamily: 'var(--font-body)', padding: '0 0 8px 0', borderBottom: '1px solid var(--color-border)' }}>
            <ChevronLeft size={14} /> Back to Invoices
          </button>

          <div style={{ padding: '12px', borderRadius: 9, background: sc.bg, border: `1px solid ${sc.color}22` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <StatusIcon size={13} color={sc.color} strokeWidth={1.5} />
              <span style={{ fontSize: 12, fontWeight: 700, color: sc.color }}>{sc.label}</span>
              {isOverdue && <span style={{ fontSize: 9, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.10)', padding: '1px 6px', borderRadius: 100 }}>OVERDUE</span>}
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{invoice.invoice_number}</p>
            {invoice.draw_number && <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>Draw #{invoice.draw_number}</p>}
          </div>

          {invoice.clients && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4 }}>Client</p>
              <p style={{ fontSize: 12, fontWeight: 600 }}>{invoice.clients.first_name} {invoice.clients.last_name}</p>
              {invoice.clients.email && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{invoice.clients.email}</p>}
            </div>
          )}

          {invoice.projects && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4 }}>Project</p>
              <p style={{ fontSize: 12, fontWeight: 600 }}>{invoice.projects.name}</p>
            </div>
          )}

          <div style={{ padding: '12px', borderRadius: 9, background: 'rgba(252,226,5,0.06)', border: '1px solid rgba(252,226,5,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Total</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${invoice.total.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Paid</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#16A34A', fontWeight: 600 }}>${invoice.amount_paid.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid rgba(252,226,5,0.2)' }}>
              <span style={{ fontSize: 11, fontWeight: 700 }}>Outstanding</span>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 800, color: outstanding > 0 ? '#DC2626' : '#16A34A' }}>${outstanding.toFixed(2)}</span>
            </div>
          </div>

          {invoice.due_date && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: isOverdue ? 'rgba(220,38,38,0.06)' : 'var(--color-mist)', border: `1px solid ${isOverdue ? 'rgba(220,38,38,0.2)' : 'var(--color-border)'}` }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 3 }}>Due Date</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: isOverdue ? '#DC2626' : 'var(--color-text)' }}>
                {new Date(invoice.due_date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#FCE205', border: 'none', color: '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <Download size={13} strokeWidth={2} /> Download PDF
            </button>

            {invoice.status === 'draft' && (
              <button onClick={markAsSent} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <Send size={13} strokeWidth={1.5} /> Mark as Sent
              </button>
            )}

            {invoice.status !== 'paid' && invoice.status !== 'draft' && (
              <button onClick={() => setShowPayment(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <DollarSign size={13} strokeWidth={1.5} /> Record Payment
              </button>
            )}
          </div>

          {showPayment && (
            <div style={{ padding: '14px', borderRadius: 9, background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#16A34A' }}>Record Payment</p>
                <button onClick={() => setShowPayment(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={13} color="var(--color-muted)" /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)', marginBottom: 5 }}>Amount</p>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)', fontWeight: 700 }}>$</span>
                    <input style={{ width: '100%', height: 36, paddingLeft: 22, borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-panel-raised)', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text)', outline: 'none' }} type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)', marginBottom: 5 }}>Date Received</p>
                  <input style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-panel-raised)', fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--color-text)', outline: 'none' }} type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
                <button onClick={recordPayment} disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#16A34A', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  <Check size={13} /> {saving ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          )}

          {invoice.status === 'paid' && (
            <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <CheckCircle size={13} color="#16A34A" strokeWidth={1.5} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A' }}>Paid in Full</span>
              </div>
              {invoice.paid_at && <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{new Date(invoice.paid_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
            </div>
          )}
        </div>

        {/* Document */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#ECEAE5', padding: '24px' }}>
          <InvoiceDocument invoice={invoice} company={company} brand={brand} />
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          nav, header, aside { display: none !important; }
          body { margin: 0; background: white; }
        }
        @media screen { .print-only { display: none !important; } }
      `}</style>

      <div className="print-only" style={{ padding: '28px 32px', background: '#FFFFFF', minHeight: '100vh' }}>
        <InvoiceDocument invoice={invoice} company={company} brand={brand} print />
      </div>
    </>
  );
}

function InvoiceDocument({ invoice, company, brand, print = false }: {
  invoice: Invoice;
  company: any;
  brand: any;
  print?: boolean;
}) {
  const p = brand?.primary  ?? '#FCE205';
  const d = brand?.dark     ?? '#111010';
  const a = brand?.accent   ?? '#1E5FA4';
  const companyName  = brand?.name     || company?.name  || 'Your Company';
  const companyEmail = brand?.email    || company?.email || '';
  const companyHST   = brand?.hst      || company?.hst   || '—';
  const logoUrl      = brand?.logo_url || company?.logo_url || '';

  const outstanding = invoice.total - invoice.amount_paid;

  return (
    <div style={{ background: '#FFFFFF', borderRadius: print ? 0 : 12, boxShadow: print ? 'none' : '0 4px 24px rgba(0,0,0,0.10)', padding: print ? '28px 32px' : '32px 28px', maxWidth: 720, margin: '0 auto', fontFamily: 'DM Sans, sans-serif' }}>

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
          <p style={{ fontSize: 20, fontWeight: 900, color: d, letterSpacing: '0.04em' }}>INVOICE</p>
          <p style={{ fontSize: 11, color: '#8C8680', fontFamily: 'monospace' }}>{invoice.invoice_number}</p>
          {invoice.draw_number && <p style={{ fontSize: 11, color: '#8C8680' }}>Draw #{invoice.draw_number}</p>}
          <p style={{ fontSize: 11, color: '#8C8680', marginTop: 6 }}>{new Date(invoice.created_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          {invoice.due_date && <p style={{ fontSize: 11, color: d, fontWeight: 700, marginTop: 4 }}>Due: {new Date(invoice.due_date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
        </div>
      </div>

      {/* Bill to */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 4 }}>Bill To</p>
        {invoice.clients ? (
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: d }}>{invoice.clients.first_name} {invoice.clients.last_name}</p>
            {invoice.clients.email && <p style={{ fontSize: 12, color: '#6B7280' }}>{invoice.clients.email}</p>}
          </div>
        ) : <p style={{ fontSize: 14, color: '#6B7280' }}>—</p>}
        {invoice.projects && <p style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>Re: {invoice.projects.name}</p>}
      </div>

      {/* Line items */}
      {(invoice.line_items ?? []).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px 90px', gap: 8, padding: '6px 8px', background: '#F8F7F4', borderRadius: 6, marginBottom: 4 }}>
            {['Description', 'Qty', 'Unit', 'Rate', 'Amount'].map(h => (
              <p key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8C8680' }}>{h}</p>
            ))}
          </div>
          {(invoice.line_items ?? []).map((item: any, i: number) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px 90px', gap: 8, padding: '8px', borderBottom: '1px solid #F0EDE8', alignItems: 'center' }}>
              <p style={{ fontSize: 12, color: d }}>{item.description}</p>
              <p style={{ fontSize: 12, color: '#6B7280', textAlign: 'right', fontFamily: 'monospace' }}>{item.quantity}</p>
              <p style={{ fontSize: 12, color: '#6B7280' }}>{item.unit}</p>
              <p style={{ fontSize: 12, color: '#6B7280', textAlign: 'right', fontFamily: 'monospace' }}>${item.rate?.toLocaleString()}</p>
              <p style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', fontFamily: 'monospace' }}>${item.amount?.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Totals */}
      <div style={{ padding: '14px 16px', borderRadius: 10, background: '#F8F7F4', marginBottom: 20 }}>
        {[
          { label: 'Subtotal',              value: `$${invoice.subtotal.toFixed(2)}` },
          { label: `HST (${invoice.tax_rate}%)`, value: `$${invoice.tax_amount.toFixed(2)}` },
          ...(invoice.holdback_amount > 0 ? [{ label: 'Holdback', value: `-$${invoice.holdback_amount.toFixed(2)}` }] : []),
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: '#6B7280' }}>{row.label}</span>
            <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{row.value}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: `2px solid ${p}`, marginTop: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: d }}>Total Due</span>
          <span style={{ fontSize: 15, fontWeight: 900, fontFamily: 'monospace', color: d }}>${invoice.total.toFixed(2)}</span>
        </div>
        {invoice.amount_paid > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>Amount Paid</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#16A34A', fontWeight: 600 }}>-${invoice.amount_paid.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: outstanding > 0 ? '#DC2626' : '#16A34A' }}>Balance Due</span>
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: outstanding > 0 ? '#DC2626' : '#16A34A' }}>${outstanding.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>

      {/* Payment terms */}
      {invoice.payment_terms && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: `${a}08`, border: `1px solid ${a}20`, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: a }}>
            <strong>Payment Terms:</strong> {invoice.payment_terms.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </p>
        </div>
      )}

      {/* Closing */}
      {invoice.closing_message && (
        <div style={{ padding: '14px', borderRadius: 8, background: `${p}08`, border: `1px solid ${p}30`, marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: '#4A4640', lineHeight: 1.7, fontStyle: 'italic' }}>{invoice.closing_message}</p>
        </div>
      )}

      {/* Paid stamp */}
      {invoice.status === 'paid' && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <div style={{ padding: '10px 28px', border: '3px solid #16A34A', borderRadius: 8, transform: 'rotate(-5deg)' }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#16A34A', letterSpacing: '0.12em' }}>PAID</p>
          </div>
        </div>
      )}
    </div>
  );
}