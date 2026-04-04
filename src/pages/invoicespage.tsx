import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Plus, Search, SlidersHorizontal, Receipt,
  ChevronRight, Calendar, DollarSign, Building2,
  CheckCircle2, Clock, AlertTriangle, X, Trash2,
} from 'lucide-react';

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  holdback_amount: number;
  total: number;
  amount_paid: number;
  due_date: string | null;
  created_at: string;
  clients?: { first_name: string; last_name: string } | null;
  projects?: { name: string } | null;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
}

interface Project {
  id: string;
  name: string;
  value: number;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

type InvoiceMode = 'simple' | 'phase';

const STATUS_CONFIG: Record<string, { badge: string; icon: React.ElementType; label: string }> = {
  draft:   { badge: 'forge-badge--neutral', icon: Clock,          label: 'Draft'   },
  sent:    { badge: 'forge-badge--info',    icon: Receipt,        label: 'Sent'    },
  partial: { badge: 'forge-badge--warning', icon: AlertTriangle,  label: 'Partial' },
  paid:    { badge: 'forge-badge--success', icon: CheckCircle2,   label: 'Paid'    },
  overdue: { badge: 'forge-badge--danger',  icon: AlertTriangle,  label: 'Overdue' },
};

const PHASE_LABELS = ['Deposit', 'Progress Draw 1', 'Progress Draw 2', 'Final Payment'];

function formatMoney(v: number) {
  return '$' + v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function newLineItem(): LineItem {
  return { id: crypto.randomUUID(), description: '', quantity: 1, unit: 'each', unit_price: 0 };
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices]   = useState<Invoice[]>([]);
  const [clients, setClients]     = useState<Client[]>([]);
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showModal, setShowModal] = useState(false);

  /* Form state */
  const [mode, setMode]                 = useState<InvoiceMode>('simple');
  const [clientId, setClientId]         = useState('');
  const [projectId, setProjectId]       = useState('');
  const [dueDate, setDueDate]           = useState('');
  const [notes, setNotes]               = useState('');
  const [taxRate, setTaxRate]           = useState(13);
  const [holdbackPct, setHoldbackPct]   = useState(0);
  const [applyHoldback, setApplyHoldback] = useState(false);
  const [lineItems, setLineItems]       = useState<LineItem[]>([newLineItem()]);
  const [phases, setPhases]             = useState([
    { label: 'Deposit',         pct: 25, due: '', paid: false },
    { label: 'Progress Draw 1', pct: 25, due: '', paid: false },
    { label: 'Progress Draw 2', pct: 25, due: '', paid: false },
    { label: 'Final Payment',   pct: 25, due: '', paid: false },
  ]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [invRes, clientRes, projRes] = await Promise.all([
      supabase.from('invoices')
        .select('*, clients(first_name, last_name), projects(name)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, first_name, last_name'),
      supabase.from('projects').select('id, name, value'),
    ]);
    if (invRes.data)    setInvoices(invRes.data as Invoice[]);
    if (clientRes.data) setClients(clientRes.data as Client[]);
    if (projRes.data)   setProjects(projRes.data as Project[]);
    setLoading(false);
  }

  /* Line item calculations */
  const subtotal     = lineItems.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
  const taxAmount    = subtotal * (taxRate / 100);
  const holdbackAmt  = applyHoldback ? subtotal * (holdbackPct / 100) : 0;
  const total        = subtotal + taxAmount - holdbackAmt;

  /* Phase calculations */
  const phaseTotal = phases.reduce((s, p) => s + p.pct, 0);

  function updateLineItem(id: string, field: keyof LineItem, value: string | number) {
    setLineItems(items => items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  }

  function updatePhase(index: number, field: string, value: string | number | boolean) {
    setPhases(ps => ps.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }

  async function handleSave() {
    if (!clientId) { setError('Please select a client'); return; }
    if (mode === 'simple' && lineItems.every(l => !l.description)) { setError('Add at least one line item'); return; }
    setError(''); setSaving(true);

    const invNumber = `INV-${String(Date.now()).slice(-6)}`;

    if (mode === 'simple') {
      await supabase.from('invoices').insert({
        company_id: '00000000-0000-0000-0000-000000000001',
        client_id: clientId || null,
        project_id: projectId || null,
        invoice_number: invNumber,
        status: 'draft',
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        holdback_amount: holdbackAmt,
        total,
        amount_paid: 0,
        due_date: dueDate || null,
        notes: notes || null,
      });
    } else {
      /* Phase mode — create one invoice per phase */
      for (const phase of phases) {
        const phaseSubtotal = subtotal * (phase.pct / 100);
        const phaseTax      = phaseSubtotal * (taxRate / 100);
        const phaseHoldback = applyHoldback ? phaseSubtotal * (holdbackPct / 100) : 0;
        const phaseTotal    = phaseSubtotal + phaseTax - phaseHoldback;

        await supabase.from('invoices').insert({
          company_id: '00000000-0000-0000-0000-000000000001',
          client_id: clientId || null,
          project_id: projectId || null,
          invoice_number: `${invNumber}-${phase.label.replace(/\s/g, '').toUpperCase().slice(0, 3)}`,
          status: 'draft',
          subtotal: phaseSubtotal,
          tax_rate: taxRate,
          tax_amount: phaseTax,
          holdback_amount: phaseHoldback,
          total: phaseTotal,
          amount_paid: 0,
          due_date: phase.due || null,
          notes: phase.label,
        });
      }
    }

    setSaving(false);
    setShowModal(false);
    resetForm();
    fetchAll();
  }

  function resetForm() {
    setMode('simple'); setClientId(''); setProjectId('');
    setDueDate(''); setNotes(''); setTaxRate(13);
    setHoldbackPct(0); setApplyHoldback(false);
    setLineItems([newLineItem()]);
    setPhases([
      { label: 'Deposit',         pct: 25, due: '', paid: false },
      { label: 'Progress Draw 1', pct: 25, due: '', paid: false },
      { label: 'Progress Draw 2', pct: 25, due: '', paid: false },
      { label: 'Final Payment',   pct: 25, due: '', paid: false },
    ]);
    setError('');
  }

  const filtered = invoices.filter(inv => {
    const matchStatus = filterStatus === 'All' || inv.status === filterStatus;
    const clientName  = inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : '';
    const matchSearch =
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      clientName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.projects?.name ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalOutstanding = invoices
    .filter(i => i.status !== 'paid')
    .reduce((s, i) => s + (i.total - i.amount_paid), 0);
  const totalCollected = invoices.reduce((s, i) => s + i.amount_paid, 0);
  const totalHoldback  = invoices.reduce((s, i) => s + i.holdback_amount, 0);
  const overdueCount   = invoices.filter(i => i.status === 'overdue').length;

  const inputStyle: React.CSSProperties = {
    height: 36, padding: '0 10px', borderRadius: 7,
    border: '1px solid var(--color-border)',
    background: 'var(--color-panel)',
    color: 'var(--color-text)', fontSize: 12,
    fontFamily: 'var(--font-body)', width: '100%', outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--color-muted)',
    marginBottom: 6, display: 'block',
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1300, margin: '0 auto' }}>

      {/* ── NEW INVOICE MODAL ── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '40px 24px', overflowY: 'auto',
        }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm(); } }}
        >
          <div style={{
            background: 'var(--color-panel)', borderRadius: 14,
            width: '100%', maxWidth: 680,
            boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}>

            {/* Modal header */}
            <div style={{
              padding: '18px 22px', borderBottom: '1px solid var(--color-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(252,226,5,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Receipt size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Invoice</span>
              </div>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={16} color="var(--color-muted)" />
              </button>
            </div>

            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Mode selector */}
              <div>
                <label style={labelStyle}>Invoice Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {([
                    { key: 'simple', title: 'Simple Invoice', desc: 'One job, one invoice. Perfect for service calls, small jobs.' },
                    { key: 'phase',  title: 'Phase / Draw Schedule', desc: 'Multi-draw for renovations, additions, larger projects.' },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setMode(opt.key)}
                      style={{
                        padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                        textAlign: 'left', fontFamily: 'var(--font-body)',
                        background: mode === opt.key ? 'rgba(252,226,5,0.08)' : 'var(--color-mist)',
                        border: mode === opt.key ? '2px solid #FCE205' : '2px solid transparent',
                        transition: 'all 0.12s',
                      }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>{opt.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5 }}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Client + Project */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Client *</label>
                  <select style={inputStyle} value={clientId} onChange={e => setClientId(e.target.value)}>
                    <option value="">Select client...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Project (optional)</label>
                  <select style={inputStyle} value={projectId} onChange={e => setProjectId(e.target.value)}>
                    <option value="">No project linked</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── SIMPLE MODE — Line items ── */}
              {mode === 'simple' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Line Items</label>
                    <button
                      className="forge-button forge-button--secondary forge-button--sm"
                      onClick={() => setLineItems(items => [...items, newLineItem()])}
                    >
                      <Plus size={11} /> Add Line
                    </button>
                  </div>

                  {/* Line item headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1.2fr 32px', gap: 6, marginBottom: 4 }}>
                    {['Description', 'Qty', 'Unit', 'Rate', ''].map(h => (
                      <span key={h} style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>{h}</span>
                    ))}
                  </div>

                  {lineItems.map(item => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1.2fr 32px', gap: 6, marginBottom: 6 }}>
                      <input
                        style={inputStyle}
                        placeholder="Description of work..."
                        value={item.description}
                        onChange={e => updateLineItem(item.id, 'description', e.target.value)}
                      />
                      <input
                        style={{ ...inputStyle, textAlign: 'right' }}
                        type="number" min="0" step="0.01"
                        value={item.quantity}
                        onChange={e => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                      <select style={inputStyle} value={item.unit} onChange={e => updateLineItem(item.id, 'unit', e.target.value)}>
                        {['each', 'hr', 'day', 'sqft', 'lft', 'job', 'm', 'kg'].map(u => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                      <input
                        style={{ ...inputStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                        type="number" min="0" step="0.01"
                        placeholder="0.00"
                        value={item.unit_price || ''}
                        onChange={e => updateLineItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      />
                      <button
                        onClick={() => setLineItems(items => items.filter(i => i.id !== item.id))}
                        disabled={lineItems.length === 1}
                        style={{ background: 'none', border: 'none', cursor: lineItems.length === 1 ? 'default' : 'pointer', opacity: lineItems.length === 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Trash2 size={13} color="var(--color-danger)" />
                      </button>
                    </div>
                  ))}

                  {/* Line item totals */}
                  <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8 }}>
                    {lineItems.filter(i => i.description && i.unit_price > 0).map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-sub)', marginBottom: 3 }}>
                        <span>{item.description}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(item.quantity * item.unit_price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── PHASE MODE ── */}
              {mode === 'phase' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Payment Schedule</label>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: phaseTotal === 100 ? 'var(--color-success)' : 'var(--color-danger)',
                    }}>
                      Total: {phaseTotal}% {phaseTotal !== 100 ? '(must equal 100%)' : '✓'}
                    </span>
                  </div>

                  {/* Total contract value needed for phase mode */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Total Contract Value</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <input
                        style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700 }}
                        type="number" min="0" step="100"
                        placeholder="0.00"
                        value={lineItems[0]?.unit_price || ''}
                        onChange={e => setLineItems([{ ...lineItems[0], unit_price: parseFloat(e.target.value) || 0, description: 'Contract value', quantity: 1 }])}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-sub)' }}>
                        = {formatMoney(lineItems[0]?.unit_price || 0)} contract
                      </div>
                    </div>
                  </div>

                  {phases.map((phase, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1.5fr 80px 1fr auto',
                      gap: 10, marginBottom: 8, alignItems: 'center',
                      padding: '10px 12px', borderRadius: 8,
                      background: 'var(--color-mist)',
                      border: '1px solid var(--color-border)',
                    }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600 }}>{phase.label}</p>
                        <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                          {formatMoney((lineItems[0]?.unit_price || 0) * (phase.pct / 100))}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          style={{ ...inputStyle, width: 52, textAlign: 'center', padding: '0 6px' }}
                          type="number" min="0" max="100"
                          value={phase.pct}
                          onChange={e => updatePhase(i, 'pct', parseInt(e.target.value) || 0)}
                        />
                        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>%</span>
                      </div>
                      <input
                        type="date"
                        style={inputStyle}
                        value={phase.due}
                        onChange={e => updatePhase(i, 'due', e.target.value)}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={phase.paid}
                          onChange={e => updatePhase(i, 'paid', e.target.checked)}
                          style={{ accentColor: '#FCE205' }}
                        />
                        Paid
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {/* Tax + Holdback */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Tax Rate</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { label: 'HST 13% (ON)', rate: 13 },
                      { label: 'GST 5% (AB)',  rate: 5  },
                      { label: 'Custom',        rate: -1 },
                    ].map(opt => (
                      <button
                        key={opt.label}
                        onClick={() => opt.rate !== -1 && setTaxRate(opt.rate)}
                        style={{
                          flex: 1, padding: '6px 4px', borderRadius: 6, fontSize: 10,
                          fontWeight: taxRate === opt.rate ? 700 : 400,
                          background: taxRate === opt.rate ? 'rgba(252,226,5,0.12)' : 'var(--color-mist)',
                          border: taxRate === opt.rate ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)',
                          color: taxRate === opt.rate ? '#8A7600' : 'var(--color-muted)',
                          cursor: 'pointer', fontFamily: 'var(--font-body)',
                          transition: 'all 0.1s',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <input
                    style={{ ...inputStyle, marginTop: 8 }}
                    type="number" min="0" max="30" step="0.1"
                    value={taxRate}
                    onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Ontario Holdback</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={applyHoldback}
                      onChange={e => { setApplyHoldback(e.target.checked); if (e.target.checked) setHoldbackPct(10); }}
                      style={{ accentColor: '#FCE205' }}
                    />
                    Apply statutory holdback (Construction Act)
                  </label>
                  {applyHoldback && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        style={{ ...inputStyle, width: 70 }}
                        type="number" min="0" max="20" step="0.5"
                        value={holdbackPct}
                        onChange={e => setHoldbackPct(parseFloat(e.target.value) || 0)}
                      />
                      <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>% withheld per invoice</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Due date + Notes */}
              {mode === 'simple' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Due Date</label>
                    <input type="date" style={inputStyle} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Notes</label>
                    <input style={inputStyle} placeholder="Payment terms, etc..." value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Totals preview */}
              <div style={{
                background: 'var(--color-mist)', borderRadius: 10,
                border: '1px solid var(--color-border)', overflow: 'hidden',
              }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', background: 'rgba(252,226,5,0.04)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
                    Invoice Summary
                  </p>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Subtotal',          value: formatMoney(subtotal),    color: 'var(--color-text)'    },
                    { label: `HST ${taxRate}%`,   value: formatMoney(taxAmount),   color: 'var(--color-text-sub)'},
                    ...(applyHoldback ? [{ label: `Holdback ${holdbackPct}%`, value: `(${formatMoney(holdbackAmt)})`, color: 'var(--color-warning)' }] : []),
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Total Due</span>
                    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#8A7600' }}>{formatMoney(total)}</span>
                  </div>
                  {applyHoldback && (
                    <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 4 }}>
                      * {formatMoney(holdbackAmt)} holdback retained per Ontario Construction Act. Released upon project completion and deficiency clearance.
                    </p>
                  )}
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger-bg)', border: '1px solid #DDB0B0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={13} color="var(--color-danger)" strokeWidth={1.5} />
                  <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button className="forge-button forge-button--secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
              <button className="forge-button forge-button--primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : mode === 'phase' ? `Create ${phases.length} Invoices` : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAGE HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p className="forge-label" style={{ marginBottom: 4 }}>Financial</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Invoices</h1>
          <p className="forge-subtitle" style={{ marginTop: 2 }}>
            {invoices.length} invoices · {overdueCount} overdue · {formatMoney(totalOutstanding)} outstanding
          </p>
        </div>
        <button className="forge-button forge-button--primary" onClick={() => setShowModal(true)}>
          <Plus size={13} /> New Invoice
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Outstanding',  value: formatMoney(totalOutstanding), sub: `${invoices.filter(i => i.status !== 'paid').length} unpaid`,   color: totalOutstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)' },
          { label: 'Collected',    value: formatMoney(totalCollected),   sub: 'total received',                                               color: 'var(--color-success)' },
          { label: 'Holdback',     value: formatMoney(totalHoldback),    sub: 'retained — unreleased',                                        color: 'var(--color-warning)' },
          { label: 'Overdue',      value: String(overdueCount),          sub: 'need attention',                                               color: overdueCount > 0 ? 'var(--color-danger)' : 'var(--color-success)' },
        ].map(kpi => (
          <div key={kpi.label} className="forge-card" style={{ padding: '16px 18px' }}>
            <p className="forge-label" style={{ marginBottom: 8 }}>{kpi.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: kpi.color, letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{kpi.value}</p>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input className="forge-input" placeholder="Search invoices, clients..." style={{ paddingLeft: 30 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['All', 'draft', 'sent', 'partial', 'paid', 'overdue'].map(s => (
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
            {s === 'All' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
          </button>
        ))}
        <span className="forge-subtitle" style={{ marginLeft: 'auto' }}>{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="forge-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>Loading invoices...</div>
        ) : (
          <table className="forge-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Project</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Holdback</th>
                <th>Outstanding</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-muted)' }}>
                    {search || filterStatus !== 'All' ? 'No invoices match your filter' : 'No invoices yet — create your first invoice'}
                  </td>
                </tr>
              ) : (
                filtered.map(inv => {
                  const outstanding = inv.total - inv.amount_paid;
                  const StatusIcon  = STATUS_CONFIG[inv.status]?.icon ?? Clock;
                  return (
                    <tr key={inv.id} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                            background: 'rgba(252,226,5,0.10)', border: '1px solid rgba(252,226,5,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Receipt size={12} color="#8A7600" strokeWidth={1.5} />
                          </div>
                          <p style={{ fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-mono)' }}>{inv.invoice_number}</p>
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                        {inv.clients ? `${inv.clients.first_name} ${inv.clients.last_name}` : '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                        {inv.projects?.name ?? '—'}
                      </td>
                      <td>
                        <span className={`forge-badge ${STATUS_CONFIG[inv.status]?.badge ?? 'forge-badge--neutral'}`}>
                          {STATUS_CONFIG[inv.status]?.label ?? inv.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>{formatMoney(inv.total)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-success)', fontSize: 12 }}>{formatMoney(inv.amount_paid)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-warning)', fontSize: 12 }}>
                        {inv.holdback_amount > 0 ? formatMoney(inv.holdback_amount) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: outstanding > 0 ? 'var(--color-danger)' : 'var(--color-success)', fontSize: 13 }}>
                        {formatMoney(outstanding)}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={10} color="var(--color-muted)" />
                          {formatDate(inv.due_date)}
                        </div>
                      </td>
                      <td><ChevronRight size={13} color="var(--color-muted)" /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}