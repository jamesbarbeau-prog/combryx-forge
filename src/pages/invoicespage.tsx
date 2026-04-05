import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Plus, Search, ChevronRight, Receipt,
  DollarSign, Clock, CheckCircle, Send,
  AlertTriangle, X, Check, Trash2,
  User, Calendar, FileText, GripVertical,
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
  created_at: string;
  draw_number: number | null;
  clients?: { first_name: string; last_name: string } | null;
  projects?: { name: string } | null;
}

interface Client { id: string; first_name: string; last_name: string; }
interface Project { id: string; name: string; client_id: string | null; }
interface Quote { id: string; title: string; total: number; line_items: any[]; }
interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: React.ElementType }> = {
  draft:   { color: '#6B7280', bg: 'rgba(107,114,128,0.10)', label: 'Draft',   icon: Clock         },
  sent:    { color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',   label: 'Sent',    icon: Send          },
  partial: { color: '#D97706', bg: 'rgba(217,119,6,0.10)',   label: 'Partial', icon: AlertTriangle  },
  paid:    { color: '#16A34A', bg: 'rgba(22,163,74,0.10)',   label: 'Paid',    icon: CheckCircle   },
  overdue: { color: '#DC2626', bg: 'rgba(220,38,38,0.10)',   label: 'Overdue', icon: AlertTriangle  },
};

const PAYMENT_TERMS = [
  { id: 'due_on_receipt', label: 'Due on Receipt'  },
  { id: 'net_7',          label: 'Net 7 days'       },
  { id: 'net_14',         label: 'Net 14 days'      },
  { id: 'net_30',         label: 'Net 30 days'      },
  { id: 'net_45',         label: 'Net 45 days'      },
  { id: 'net_60',         label: 'Net 60 days'      },
];

function uid() { return Math.random().toString(36).slice(2); }

function dueDateFromTerms(terms: string): string {
  const days: Record<string, number> = {
    due_on_receipt: 0, net_7: 7, net_14: 14, net_30: 30, net_45: 45, net_60: 60,
  };
  const d = new Date();
  d.setDate(d.getDate() + (days[terms] ?? 30));
  return d.toISOString().split('T')[0];
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [clients, setClients]       = useState<Client[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [quotes, setQuotes]         = useState<Quote[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal]   = useState(false);

  /* Form state */
  const [clientId, setClientId]         = useState('');
  const [projectId, setProjectId]       = useState('');
  const [quoteId, setQuoteId]           = useState('');
  const [invoiceType, setInvoiceType]   = useState('standard');
  const [drawNumber, setDrawNumber]     = useState('');
  const [paymentTerms, setPaymentTerms] = useState('net_30');
  const [taxRate, setTaxRate]           = useState(13);
  const [holdbackPct, setHoldbackPct]   = useState(0);
  const [lineItems, setLineItems]       = useState<LineItem[]>([
    { id: uid(), description: '', quantity: 1, unit: 'ls', rate: 0, amount: 0 },
  ]);
  const [notes, setNotes]               = useState('');
  const [closingMessage, setClosingMessage] = useState('Thank you for your business. Payment is appreciated within the agreed terms.');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [invRes, clientRes, projRes, quoteRes] = await Promise.all([
      supabase.from('invoices').select('*, clients(first_name, last_name), projects(name)').eq('company_id', COMPANY_ID).order('created_at', { ascending: false }),
      supabase.from('clients').select('id, first_name, last_name').eq('company_id', COMPANY_ID),
      supabase.from('projects').select('id, name, client_id').eq('company_id', COMPANY_ID),
      supabase.from('quotes').select('id, title, total, line_items').eq('company_id', COMPANY_ID).eq('status', 'signed'),
    ]);
    if (invRes.data)    setInvoices(invRes.data as Invoice[]);
    if (clientRes.data) setClients(clientRes.data as Client[]);
    if (projRes.data)   setProjects(projRes.data as Project[]);
    if (quoteRes.data)  setQuotes(quoteRes.data as Quote[]);
    setLoading(false);
  }

  /* When quote selected — import line items */
  function applyQuote(qId: string) {
    setQuoteId(qId);
    const q = quotes.find(q => q.id === qId);
    if (!q) return;
    const items: LineItem[] = (q.line_items ?? []).map((item: any) => ({
      id: uid(),
      description: item.description ?? '',
      quantity: item.quantity ?? 1,
      unit: item.unit ?? 'ls',
      rate: item.rate ?? 0,
      amount: item.amount ?? 0,
    }));
    if (items.length > 0) setLineItems(items);
  }

  /* When client selected — filter projects */
  const clientProjects = projects.filter(p => !clientId || p.client_id === clientId);

  /* Line item math */
  function updateItem(id: string, field: keyof LineItem, val: string | number) {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: val };
      updated.amount = Number(updated.quantity) * Number(updated.rate);
      return updated;
    }));
  }
  function addItem() {
    setLineItems(prev => [...prev, { id: uid(), description: '', quantity: 1, unit: 'ls', rate: 0, amount: 0 }]);
  }
  function removeItem(id: string) { setLineItems(prev => prev.filter(i => i.id !== id)); }

  const subtotal       = lineItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount      = subtotal * (taxRate / 100);
  const holdbackAmount = subtotal * (holdbackPct / 100);
  const total          = subtotal + taxAmount - holdbackAmount;

  function resetForm() {
    setClientId(''); setProjectId(''); setQuoteId('');
    setInvoiceType('standard'); setDrawNumber('');
    setPaymentTerms('net_30'); setTaxRate(13); setHoldbackPct(0);
    setLineItems([{ id: uid(), description: '', quantity: 1, unit: 'ls', rate: 0, amount: 0 }]);
    setNotes(''); setClosingMessage('Thank you for your business. Payment is appreciated within the agreed terms.');
    setError('');
  }

  async function handleSave(send = false) {
    if (lineItems.every(i => !i.description.trim())) { setError('Add at least one line item'); return; }
    setError(''); setSaving(true);

    const invNum = `INV-${String(Date.now()).slice(-5)}`;
    const dueDate = dueDateFromTerms(paymentTerms);

    const { error: err } = await supabase.from('invoices').insert({
      company_id:      COMPANY_ID,
      client_id:       clientId || null,
      project_id:      projectId || null,
      quote_id:        quoteId || null,
      invoice_number:  invNum,
      invoice_type:    invoiceType,
      draw_number:     drawNumber ? Number(drawNumber) : null,
      status:          send ? 'sent' : 'draft',
      sent_at:         send ? new Date().toISOString() : null,
      line_items:      lineItems,
      subtotal,
      tax_rate:        taxRate,
      tax_amount:      taxAmount,
      holdback_amount: holdbackAmount,
      total,
      amount_paid:     0,
      due_date:        dueDate,
      payment_terms:   paymentTerms,
      notes:           notes || null,
      closing_message: closingMessage,
    });

    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowModal(false);
    resetForm();
    fetchAll();
  }

  /* Stats */
  const totalOutstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.total - i.amount_paid), 0);
  const totalOverdue     = invoices.filter(i => i.status === 'overdue').length;
  const totalPaidMTD     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);

  const filtered = invoices.filter(inv => {
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchSearch = !search ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      (inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}`.toLowerCase().includes(search.toLowerCase()) : false) ||
      (inv.projects?.name ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const inp: React.CSSProperties = {
    height: 36, padding: '0 10px', borderRadius: 7,
    border: '1px solid var(--color-border)',
    background: 'var(--color-panel-raised)',
    color: 'var(--color-text)', fontSize: 12,
    fontFamily: 'var(--font-body)', outline: 'none',
    transition: 'all 0.15s', width: '100%',
  };
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
    textTransform: 'uppercase', color: 'var(--color-muted)',
    marginBottom: 5, display: 'block',
  };
  function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = '#FCE205';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.12)';
  }
  function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = 'var(--color-border)';
    e.currentTarget.style.boxShadow = 'none';
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── New Invoice Modal ── */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 24px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm(); } }}
        >
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 680, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(252,226,5,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Receipt size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Invoice</span>
              </div>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={16} color="var(--color-muted)" />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '75vh', overflowY: 'auto' }}>

              {/* Invoice type */}
              <div>
                <label style={lbl}>Invoice Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { id: 'standard', label: 'Standard',   sub: 'One-time invoice'    },
                    { id: 'draw',     label: 'Draw',        sub: 'Progress billing'    },
                    { id: 'deposit',  label: 'Deposit',     sub: 'Upfront payment'     },
                  ].map(t => (
                    <button key={t.id} onClick={() => setInvoiceType(t.id)} style={{ padding: '10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'center', background: invoiceType === t.id ? 'rgba(252,226,5,0.10)' : 'var(--color-mist)', border: invoiceType === t.id ? '2px solid #FCE205' : '2px solid transparent', transition: 'all 0.1s' }}>
                      <p style={{ fontSize: 12, fontWeight: invoiceType === t.id ? 700 : 500, color: invoiceType === t.id ? '#8A7600' : 'var(--color-text)', marginBottom: 2 }}>{t.label}</p>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Client + Project */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Client</label>
                  <div style={{ position: 'relative' }}>
                    <User size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <select style={{ ...inp, paddingLeft: 28 }} value={clientId} onChange={e => { setClientId(e.target.value); setProjectId(''); }} onFocus={focus} onBlur={blur}>
                      <option value="">Select client...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={lbl}>Project (optional)</label>
                  <select style={inp} value={projectId} onChange={e => setProjectId(e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select project...</option>
                    {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Import from signed quote */}
              {quotes.length > 0 && (
                <div>
                  <label style={lbl}>Import from Signed Quote (optional)</label>
                  <div style={{ position: 'relative' }}>
                    <FileText size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <select style={{ ...inp, paddingLeft: 28 }} value={quoteId} onChange={e => applyQuote(e.target.value)} onFocus={focus} onBlur={blur}>
                      <option value="">None — start from scratch</option>
                      {quotes.map(q => <option key={q.id} value={q.id}>{q.title} — ${q.total.toFixed(2)}</option>)}
                    </select>
                  </div>
                  {quoteId && <p style={{ fontSize: 10, color: '#16A34A', marginTop: 4, fontWeight: 600 }}>✓ Line items imported from signed quote</p>}
                </div>
              )}

              {/* Draw number if draw type */}
              {invoiceType === 'draw' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
                  <div>
                    <label style={lbl}>Draw Number</label>
                    <input style={inp} type="number" min="1" placeholder="1" value={drawNumber} onChange={e => setDrawNumber(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 1 }}>
                    <p style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5 }}>Draw invoices are numbered sequentially per project. Draw #1 is typically the deposit, then progress draws.</p>
                  </div>
                </div>
              )}

              {/* Payment terms + tax */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Payment Terms</label>
                  <select style={inp} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} onFocus={focus} onBlur={blur}>
                    {PAYMENT_TERMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Tax Rate (%)</label>
                  <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" min="0" max="20" step="0.5" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              {/* Holdback */}
              <div>
                <label style={lbl}>Holdback (%)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[0, 5, 10, 15].map(pct => (
                    <button key={pct} onClick={() => setHoldbackPct(pct)} style={{ flex: 1, padding: '7px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: holdbackPct === pct ? 700 : 400, background: holdbackPct === pct ? 'rgba(252,226,5,0.12)' : 'var(--color-mist)', border: holdbackPct === pct ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: holdbackPct === pct ? '#8A7600' : 'var(--color-muted)', transition: 'all 0.1s' }}>
                      {pct === 0 ? 'None' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line items */}
              <div>
                <label style={lbl}>Line Items</label>
                <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 56px 60px 84px 84px 24px', gap: 5, padding: '0 2px', marginBottom: 6 }}>
                  {['', 'Description', 'Qty', 'Unit', 'Rate', 'Amount', ''].map((h, i) => (
                    <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)' }}>{h}</span>
                  ))}
                </div>
                {lineItems.map(item => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 56px 60px 84px 84px 24px', gap: 5, marginBottom: 6, alignItems: 'center' }}>
                    <GripVertical size={11} color="var(--color-muted)" style={{ cursor: 'grab' }} />
                    <input style={inp} placeholder="Description of work..." value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} onFocus={focus} onBlur={blur} />
                    <input style={{ ...inp, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))} onFocus={focus} onBlur={blur} />
                    <select style={inp} value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} onFocus={focus} onBlur={blur}>
                      {['ls', 'hr', 'sqft', 'lf', 'ea', 'day'].map(u => <option key={u}>{u}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-muted)' }}>$</span>
                      <input style={{ ...inp, paddingLeft: 18, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01" value={item.rate} onChange={e => updateItem(item.id, 'rate', Number(e.target.value))} onFocus={focus} onBlur={blur} />
                    </div>
                    <div style={{ height: 36, borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
                      ${item.amount.toLocaleString()}
                    </div>
                    <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <Trash2 size={11} color="var(--color-muted)" />
                    </button>
                  </div>
                ))}
                <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px dashed var(--color-border)', color: 'var(--color-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.12s', marginTop: 4 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.color = '#8A7600'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-muted)'; }}>
                  <Plus size={11} /> Add line item
                </button>
              </div>

              {/* Totals preview */}
              <div style={{ padding: '12px 14px', borderRadius: 9, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                {[
                  { label: 'Subtotal',  value: `$${subtotal.toFixed(2)}`      },
                  { label: `HST (${taxRate}%)`, value: `$${taxAmount.toFixed(2)}` },
                  ...(holdbackPct > 0 ? [{ label: `Holdback (${holdbackPct}%)`, value: `-$${holdbackAmount.toFixed(2)}` }] : []),
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{row.label}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #FCE205', marginTop: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>Total Due</span>
                  <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#8A7600' }}>${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Notes + closing */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Internal Notes</label>
                  <textarea style={{ ...inp, height: 72, padding: '8px 10px', resize: 'none', lineHeight: 1.6 }} placeholder="Internal notes (not shown on invoice)..." value={notes} onChange={e => setNotes(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Closing Message</label>
                  <textarea style={{ ...inp, height: 72, padding: '8px 10px', resize: 'none', lineHeight: 1.6 }} value={closingMessage} onChange={e => setClosingMessage(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger-bg)', border: '1px solid #DDB0B0' }}>
                  <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button className="forge-button forge-button--secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
              <button className="forge-button forge-button--secondary" onClick={() => handleSave(false)} disabled={saving} style={{ gap: 6 }}>
                <FileText size={13} /> {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button className="forge-button forge-button--primary" onClick={() => handleSave(true)} disabled={saving} style={{ gap: 6 }}>
                <Send size={13} /> {saving ? 'Saving...' : 'Create & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Financial</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Invoices</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>{invoices.length} invoices total</p>
        </div>
        <button className="forge-button forge-button--primary" onClick={() => setShowModal(true)} style={{ gap: 6 }}>
          <Plus size={13} /> New Invoice
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Outstanding',   value: `$${totalOutstanding.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#DC2626', mono: true },
          { label: 'Overdue',       value: String(totalOverdue),   color: '#D97706', mono: false },
          { label: 'Collected MTD', value: `$${totalPaidMTD.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,   color: '#16A34A', mono: true },
          { label: 'Total Invoices', value: String(invoices.length), color: '#8A7600', mono: false },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6 }}>{stat.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: stat.color, fontFamily: stat.mono ? 'var(--font-mono)' : 'var(--font-body)', letterSpacing: '-0.02em' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter + search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input className="forge-input" placeholder="Search invoices..." style={{ paddingLeft: 30 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'draft', 'sent', 'partial', 'paid', 'overdue'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: statusFilter === s ? 700 : 400, borderRadius: 6, cursor: 'pointer', background: statusFilter === s ? 'rgba(252,226,5,0.12)' : 'transparent', border: statusFilter === s ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: statusFilter === s ? '#8A7600' : 'var(--color-muted)', transition: 'all 0.12s', textTransform: 'capitalize' }}>
              {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="forge-card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Loading invoices...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 40px', textAlign: 'center' }}>
            <Receipt size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
              {search || statusFilter !== 'all' ? 'No invoices match your filter' : 'No invoices yet'}
            </p>
            {!search && statusFilter === 'all' && <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Create your first invoice using the button above</p>}
          </div>
        ) : (
          <table className="forge-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Project</th>
                <th>Type</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Outstanding</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const sc          = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG['draft'];
                const StatusIcon  = sc.icon;
                const outstanding = inv.total - inv.amount_paid;
                const isOverdue   = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid';
                return (
                  <tr key={inv.id} onClick={() => navigate(`/forge/invoices/${inv.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-mono)' }}>{inv.invoice_number}</p>
                        {inv.draw_number && <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Draw #{inv.draw_number}</p>}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                      {inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inv.projects?.name ?? '—'}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', textTransform: 'capitalize' }}>
                        {inv.invoice_type ?? 'standard'}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: sc.color }}>
                        <StatusIcon size={11} strokeWidth={1.5} />
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>
                      ${inv.total.toFixed(2)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: inv.amount_paid > 0 ? '#16A34A' : 'var(--color-muted)' }}>
                      ${inv.amount_paid.toFixed(2)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: outstanding > 0 ? 700 : 400, color: outstanding > 0 ? '#DC2626' : 'var(--color-muted)' }}>
                      ${outstanding.toFixed(2)}
                    </td>
                    <td style={{ fontSize: 11, color: isOverdue ? '#DC2626' : 'var(--color-muted)', fontWeight: isOverdue ? 700 : 400 }}>
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}
                      {isOverdue && ' ⚠'}
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