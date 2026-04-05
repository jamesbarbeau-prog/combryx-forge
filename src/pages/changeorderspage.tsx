import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import {
  Plus, Search, Download, X, Check, ChevronRight,
  FileText, AlertTriangle, Clock, CheckCircle,
  Send, Edit3, Trash2, GripVertical, DollarSign,
  ArrowUp, Copy, ExternalLink,
} from 'lucide-react';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const CO_STATUSES = [
  { id: 'draft',    label: 'Draft',    color: '#6B7280', bg: 'rgba(107,114,128,0.10)', icon: Clock         },
  { id: 'pending',  label: 'Pending',  color: '#D97706', bg: 'rgba(217,119,6,0.10)',   icon: Send          },
  { id: 'approved', label: 'Approved', color: '#16A34A', bg: 'rgba(22,163,74,0.10)',   icon: CheckCircle   },
  { id: 'rejected', label: 'Rejected', color: '#DC2626', bg: 'rgba(220,38,38,0.10)',   icon: AlertTriangle },
  { id: 'signed',   label: 'Signed',   color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',   icon: CheckCircle   },
];

const CO_REASONS = [
  'Client Request',
  'Design Change',
  'Site Condition',
  'Allowance Overage',
  'Unforeseen Work',
  'Material Substitution',
  'Code Requirement',
  'Scope Clarification',
  'Other',
];

const inp: React.CSSProperties = {
  height: 38, padding: '0 10px', borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-panel-raised)',
  color: 'var(--color-text)', fontSize: 12,
  fontFamily: 'var(--font-body)', outline: 'none',
  width: '100%', transition: 'all 0.15s',
};
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-muted)',
  marginBottom: 5, display: 'block',
};
function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = '#FCE205';
  e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(252,226,5,0.12)';
}
function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--color-border)';
  e.currentTarget.style.boxShadow   = 'none';
}
function uid() { return Math.random().toString(36).slice(2); }

export default function ChangeOrdersPage() {
  const navigate                        = useNavigate();
  const [searchParams]                  = useSearchParams();
  const [cos, setCos]                   = useState<any[]>([]);
  const [projects, setProjects]         = useState<any[]>([]);
  const [clients, setClients]           = useState<any[]>([]);
  const [quotes, setQuotes]             = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving]             = useState(false);
  const [copied, setCopied]             = useState<string | null>(null);

  const [form, setForm] = useState<any>({
    project_id:     '',
    client_id:      '',
    quote_id:       '',
    title:          '',
    description:    '',
    reason:         'Client Request',
    requested_by:   '',
    original_value: '',
    tax_rate:       13,
    valid_until:    '',
    notes:          '',
    line_items: [{ id: uid(), description: '', quantity: 1, unit: 'ls', rate: 0, amount: 0 }],
  });

  useEffect(() => { fetchAll(); }, []);

  /* Pre-fill from quote if coming from allowance reconciliation */
  useEffect(() => {
    const fromQuote  = searchParams.get('fromQuote');
    const title      = searchParams.get('title');
    const amount     = searchParams.get('amount');
    const projectId  = searchParams.get('projectId');
    if (fromQuote) {
      setForm((prev: any) => ({
        ...prev,
        quote_id:    fromQuote,
        title:       title ? decodeURIComponent(title) : 'Change Order',
        project_id:  projectId ?? '',
        line_items:  amount ? [{ id: uid(), description: decodeURIComponent(title ?? 'Scope change'), quantity: 1, unit: 'ls', rate: Number(amount), amount: Number(amount) }] : prev.line_items,
        reason:      'Allowance Overage',
      }));
      setShowModal(true);
    }
  }, [searchParams]);

  async function fetchAll() {
    setLoading(true);
    const [coRes, projRes, clientRes, quoteRes] = await Promise.all([
      supabase.from('change_orders').select('*, projects(name, value), clients(first_name, last_name)').eq('company_id', COMPANY_ID).order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, value, client_id').eq('company_id', COMPANY_ID),
      supabase.from('clients').select('id, first_name, last_name').eq('company_id', COMPANY_ID),
      supabase.from('quotes').select('id, quote_number, title, total').eq('company_id', COMPANY_ID).in('status', ['signed', 'converted']),
    ]);
    if (coRes.data)     setCos(coRes.data);
    if (projRes.data)   setProjects(projRes.data);
    if (clientRes.data) setClients(clientRes.data);
    if (quoteRes.data)  setQuotes(quoteRes.data);
    setLoading(false);
  }

  function setF(k: string, v: any) { setForm((p: any) => ({ ...p, [k]: v })); }

  function updateItem(id: string, field: string, val: any) {
    setForm((prev: any) => ({
      ...prev,
      line_items: prev.line_items.map((item: any) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        updated.amount = Number(updated.quantity) * Number(updated.rate);
        return updated;
      }),
    }));
  }

  const subtotal  = form.line_items.reduce((s: number, i: any) => s + (i.amount ?? 0), 0);
  const taxAmount = subtotal * (form.tax_rate / 100);
  const total     = subtotal + taxAmount;

  /* When project selected → auto-fill client + original value */
  function onProjectChange(projectId: string) {
    setF('project_id', projectId);
    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      setF('original_value', proj.value ?? '');
      setF('client_id', proj.client_id ?? '');
    }
  }

  function resetForm() {
    setForm({
      project_id: '', client_id: '', quote_id: '',
      title: '', description: '', reason: 'Client Request',
      requested_by: '', original_value: '', tax_rate: 13,
      valid_until: '', notes: '',
      line_items: [{ id: uid(), description: '', quantity: 1, unit: 'ls', rate: 0, amount: 0 }],
    });
  }

  async function save() {
    if (!form.title || !form.project_id) return;
    setSaving(true);
    const coNum        = `CO-${Date.now().toString().slice(-5)}`;
    const originalVal  = Number(form.original_value) || 0;
    const revisedVal   = originalVal + total;
    await supabase.from('change_orders').insert({
      company_id:     COMPANY_ID,
      project_id:     form.project_id,
      client_id:      form.client_id || null,
      quote_id:       form.quote_id  || null,
      co_number:      coNum,
      title:          form.title,
      description:    form.description || null,
      reason:         form.reason,
      requested_by:   form.requested_by || null,
      status:         'draft',
      line_items:     form.line_items,
      subtotal,
      tax_rate:       form.tax_rate,
      tax_amount:     taxAmount,
      total,
      original_value: originalVal,
      revised_value:  revisedVal,
      valid_until:    form.valid_until || null,
      notes:          form.notes || null,
    });
    setSaving(false);
    setShowModal(false);
    resetForm();
    fetchAll();
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('change_orders').update({ status }).eq('id', id);
    setCos(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  }

  function copySigningLink(id: string) {
    const link = `${window.location.origin}/co-sign/${id}`;
    navigator.clipboard.writeText(link);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function exportXLSX() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filtered.map(co => ({
      'CO #':           co.co_number,
      'Title':          co.title,
      'Project':        co.projects?.name ?? '—',
      'Client':         co.clients ? `${co.clients.first_name} ${co.clients.last_name}` : '—',
      'Reason':         co.reason,
      'Status':         co.status,
      'Original Value': co.original_value?.toFixed(2),
      'CO Amount':      co.total?.toFixed(2),
      'Revised Value':  co.revised_value?.toFixed(2),
      'Signed By':      co.signed_by ?? '—',
      'Signed At':      co.signed_at ? new Date(co.signed_at).toLocaleDateString('en-CA') : '—',
      'Created':        new Date(co.created_at).toLocaleDateString('en-CA'),
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Change Orders');
    XLSX.writeFile(wb, `Change_Orders_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  /* Stats */
  const totalValue    = cos.reduce((s, c) => s + (c.total ?? 0), 0);
  const signedValue   = cos.filter(c => c.status === 'signed').reduce((s, c) => s + (c.total ?? 0), 0);
  const pendingCount  = cos.filter(c => c.status === 'pending').length;
  const avgDelta      = cos.length > 0 ? totalValue / cos.length : 0;

  const filtered = cos.filter(co => {
    const matchStatus = statusFilter === 'all' || co.status === statusFilter;
    const matchSearch = !search ||
      co.co_number?.toLowerCase().includes(search.toLowerCase()) ||
      co.title?.toLowerCase().includes(search.toLowerCase()) ||
      co.projects?.name?.toLowerCase().includes(search.toLowerCase()) ||
      co.reason?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── New CO Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm(); } }}>
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 680, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: 24 }}>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(252,226,5,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Change Order</span>
              </div>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="var(--color-muted)" /></button>
            </div>

            <div style={{ padding: '20px', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Project + Client */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Project *</label>
                  <select style={inp} value={form.project_id} onChange={e => onProjectChange(e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Client</label>
                  <select style={inp} value={form.client_id} onChange={e => setF('client_id', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
              </div>

              {/* Title + Reason */}
              <div>
                <label style={lbl}>Change Order Title *</label>
                <input style={inp} placeholder="e.g. Upgraded Flooring — Master Bedroom" value={form.title} onChange={e => setF('title', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Reason for Change</label>
                  <select style={inp} value={form.reason} onChange={e => setF('reason', e.target.value)} onFocus={focus} onBlur={blur}>
                    {CO_REASONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Requested By</label>
                  <input style={inp} placeholder="Client name or PM" value={form.requested_by} onChange={e => setF('requested_by', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={lbl}>Description</label>
                <textarea style={{ ...inp, height: 72, padding: '8px 10px', resize: 'none' }} value={form.description} onChange={e => setF('description', e.target.value)} onFocus={focus} onBlur={blur} placeholder="Detailed description of the scope change..." />
              </div>

              {/* Original contract + signed quote link */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Original Contract Value</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)' }}>$</span>
                    <input style={{ ...inp, paddingLeft: 20, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={form.original_value} onChange={e => setF('original_value', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                  <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 3 }}>Auto-filled from project</p>
                </div>
                <div>
                  <label style={lbl}>Link to Signed Quote</label>
                  <select style={inp} value={form.quote_id} onChange={e => setF('quote_id', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">None</option>
                    {quotes.map(q => <option key={q.id} value={q.id}>{q.quote_number} — ${q.total?.toFixed(0)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Valid Until</label>
                  <input style={inp} type="date" value={form.valid_until} onChange={e => setF('valid_until', e.target.value)} onFocus={focus} onBlur={blur} />
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
                {form.line_items.map((item: any) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 56px 60px 84px 84px 24px', gap: 5, marginBottom: 6, alignItems: 'center' }}>
                    <GripVertical size={11} color="var(--color-muted)" />
                    <input style={inp} placeholder="Description of change..." value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} onFocus={focus} onBlur={blur} />
                    <input style={{ ...inp, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))} onFocus={focus} onBlur={blur} />
                    <select style={inp} value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} onFocus={focus} onBlur={blur}>
                      {['ls','hr','sqft','lf','ea','day'].map(u => <option key={u}>{u}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-muted)' }}>$</span>
                      <input style={{ ...inp, paddingLeft: 18, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01" value={item.rate} onChange={e => updateItem(item.id, 'rate', Number(e.target.value))} onFocus={focus} onBlur={blur} />
                    </div>
                    <div style={{ height: 38, borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
                      ${item.amount.toLocaleString()}
                    </div>
                    <button onClick={() => setForm((p: any) => ({ ...p, line_items: p.line_items.filter((i: any) => i.id !== item.id) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <Trash2 size={11} color="var(--color-muted)" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setForm((p: any) => ({ ...p, line_items: [...p.line_items, { id: uid(), description: '', quantity: 1, unit: 'ls', rate: 0, amount: 0 }] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px dashed var(--color-border)', color: 'var(--color-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', marginTop: 4 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.color = '#8A7600'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-muted)'; }}
                >
                  <Plus size={11} /> Add line item
                </button>
              </div>

              {/* Totals + impact */}
              <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>CO Subtotal</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>${subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>HST ({form.tax_rate}%)</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>${taxAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #FCE205', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>CO Total</span>
                  <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#8A7600' }}>${total.toFixed(2)}</span>
                </div>
                {form.original_value && (
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: total > 0 ? 'rgba(220,38,38,0.06)' : 'rgba(22,163,74,0.06)', border: `1px solid ${total > 0 ? 'rgba(220,38,38,0.2)' : 'rgba(22,163,74,0.2)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: total > 0 ? '#DC2626' : '#16A34A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Contract Impact</p>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Original: ${Number(form.original_value).toLocaleString()} → Revised: ${(Number(form.original_value) + total).toLocaleString()}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ArrowUp size={14} color={total > 0 ? '#DC2626' : '#16A34A'} strokeWidth={2} style={{ transform: total < 0 ? 'rotate(180deg)' : 'none' }} />
                      <span style={{ fontSize: 16, fontWeight: 900, fontFamily: 'var(--font-mono)', color: total > 0 ? '#DC2626' : '#16A34A' }}>
                        {total > 0 ? '+' : ''}{((total / Number(form.original_value)) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label style={lbl}>Internal Notes</label>
                <textarea style={{ ...inp, height: 60, padding: '8px 10px', resize: 'none' }} value={form.notes} onChange={e => setF('notes', e.target.value)} onFocus={focus} onBlur={blur} placeholder="Internal notes — not shown on client document" />
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="forge-button forge-button--secondary">Cancel</button>
              <button onClick={save} disabled={saving || !form.title || !form.project_id} className="forge-button forge-button--primary" style={{ gap: 6 }}>
                <FileText size={13} /> {saving ? 'Saving...' : 'Create Change Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Projects</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Change Orders</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>{cos.length} change orders total</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={exportXLSX} className="forge-button forge-button--secondary" style={{ gap: 6 }}>
            <Download size={13} /> Export XLSX
          </button>
          <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary" style={{ gap: 6 }}>
            <Plus size={13} /> New Change Order
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total CO Value',  value: `$${totalValue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,  color: '#DC2626' },
          { label: 'Signed Value',    value: `$${signedValue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, color: '#16A34A' },
          { label: 'Pending Client',  value: String(pendingCount),                                                       color: '#D97706' },
          { label: 'Avg CO Value',    value: `$${avgDelta.toLocaleString('en-CA', { minimumFractionDigits: 0 })}`,     color: '#6B7280' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6 }}>{stat.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: stat.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input className="forge-input" placeholder="Search change orders..." style={{ paddingLeft: 30 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...CO_STATUSES.map(s => s.id)].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding: '6px 12px', fontSize: 11, fontWeight: statusFilter === s ? 700 : 400, borderRadius: 6, cursor: 'pointer', background: statusFilter === s ? 'rgba(252,226,5,0.12)' : 'transparent', border: statusFilter === s ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: statusFilter === s ? '#8A7600' : 'var(--color-muted)', transition: 'all 0.12s', textTransform: 'capitalize' }}>
              {s === 'all' ? 'All' : CO_STATUSES.find(x => x.id === s)?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading change orders...</div>
      ) : filtered.length === 0 ? (
        <div className="forge-card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <FileText size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
            {search || statusFilter !== 'all' ? 'No change orders match your filter' : 'No change orders yet'}
          </p>
          {!search && statusFilter === 'all' && <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Create your first change order to track scope changes</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(co => {
            const sc      = CO_STATUSES.find(s => s.id === co.status) ?? CO_STATUSES[0];
            const Icon    = sc.icon;
            const pctChange = co.original_value > 0 ? ((co.total / co.original_value) * 100).toFixed(1) : null;

            return (
              <div key={co.id} style={{ padding: '16px 20px', borderRadius: 12, background: 'var(--color-panel)', border: `1px solid ${co.status === 'pending' ? 'rgba(217,119,6,0.25)' : 'var(--color-border)'}`, transition: 'all 0.12s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>

                  {/* Status icon */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: sc.bg, border: `1px solid ${sc.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} color={sc.color} strokeWidth={1.5} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{co.title}</p>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 100, color: sc.color, background: sc.bg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{sc.label}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>{co.reason}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, marginBottom: 6 }}>
                      <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{co.co_number}</p>
                      {co.projects?.name && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{co.projects.name}</p>}
                      {co.clients && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{co.clients.first_name} {co.clients.last_name}</p>}
                      <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{new Date(co.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    {co.description && <p style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.6, maxWidth: 500 }}>{co.description}</p>}

                    {/* Contract impact bar */}
                    {co.original_value > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden', maxWidth: 300 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, (co.total / co.original_value) * 100)}%`, borderRadius: 100, background: co.total > co.original_value * 0.1 ? '#DC2626' : '#FCE205' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>+{pctChange}% scope change</span>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                          ${co.original_value?.toLocaleString()} → ${co.revised_value?.toLocaleString()}
                        </span>
                      </div>
                    )}

                    {/* Signed info */}
                    {co.status === 'signed' && co.signed_at && (
                      <p style={{ fontSize: 10, color: '#1E5FA4', fontWeight: 600, marginTop: 6 }}>
                        Signed by {co.signed_by} on {new Date(co.signed_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Right — value + actions */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ marginBottom: 10 }}>
                      <p style={{ fontSize: 20, fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#DC2626' }}>+${co.total?.toFixed(2)}</p>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>incl. HST</p>
                    </div>

                    {/* Status actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      {co.status === 'draft' && (
                        <button onClick={() => updateStatus(co.id, 'pending')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 700, background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.25)', color: '#D97706', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                          <Send size={10} /> Send to Client
                        </button>
                      )}
                      {co.status === 'pending' && (
                        <>
                          <button onClick={() => updateStatus(co.id, 'approved')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 700, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.25)', color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                            <Check size={10} /> Mark Approved
                          </button>
                          <button onClick={() => updateStatus(co.id, 'rejected')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 700, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#DC2626', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                            <X size={10} /> Reject
                          </button>
                        </>
                      )}
                      {co.status === 'approved' && (
                        <button
                          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/co-sign/${co.id}`); setCopied(co.id); setTimeout(() => setCopied(null), 2000); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, fontSize: 10, fontWeight: 700, background: copied === co.id ? 'rgba(22,163,74,0.10)' : 'rgba(30,95,164,0.10)', border: `1px solid ${copied === co.id ? 'rgba(22,163,74,0.25)' : 'rgba(30,95,164,0.25)'}`, color: copied === co.id ? '#16A34A' : '#1E5FA4', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
                        >
                          <Copy size={10} /> {copied === co.id ? 'Copied!' : 'Copy Signing Link'}
                        </button>
                      )}

                      {/* Status dropdown for manual override */}
                      <select
                        value={co.status}
                        onChange={e => updateStatus(co.id, e.target.value)}
                        style={{ height: 26, padding: '0 6px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-mist)', fontSize: 10, fontFamily: 'var(--font-body)', color: 'var(--color-muted)', outline: 'none', cursor: 'pointer' }}
                      >
                        {CO_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}