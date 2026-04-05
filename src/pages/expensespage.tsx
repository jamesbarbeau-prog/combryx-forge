import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import {
  Plus, Search, Download, Receipt, Car, Fuel,
  Hammer, ShoppingCart, Utensils, Phone, Package,
  X, Check, ChevronRight, AlertTriangle, Upload,
  DollarSign, Filter, CheckCircle, Clock,
} from 'lucide-react';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const EXPENSE_TYPES = [
  { id: 'fuel',          label: 'Fuel',           icon: Fuel,        color: '#D97706' },
  { id: 'vehicle',       label: 'Vehicle',        icon: Car,         color: '#1E5FA4' },
  { id: 'materials',     label: 'Materials',      icon: Hammer,      color: '#8A7600' },
  { id: 'subcontractor', label: 'Subcontractor',  icon: Package,     color: '#6B7280' },
  { id: 'supplies',      label: 'Supplies',       icon: ShoppingCart, color: '#16A34A' },
  { id: 'meals',         label: 'Meals',          icon: Utensils,    color: '#DC2626' },
  { id: 'phone',         label: 'Phone/Internet', icon: Phone,       color: '#7C3AED' },
  { id: 'general',       label: 'General',        icon: Receipt,     color: '#6B7280' },
];

const PAYMENT_METHODS = [
  { id: 'company_card', label: 'Company Card'  },
  { id: 'personal',     label: 'Personal (Reimbursable)' },
  { id: 'cash',         label: 'Cash'          },
  { id: 'cheque',       label: 'Cheque'        },
  { id: 'e_transfer',   label: 'E-Transfer'    },
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

/* ── Receipt Upload ── */
function ReceiptUpload({ expenseId, currentUrl, onUploaded }: { expenseId: string; currentUrl?: string; onUploaded: (url: string) => void }) {
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string | null>(currentUrl ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    const ext      = file.name.split('.').pop();
    const filename = `receipts/${COMPANY_ID}/${expenseId}.${ext}`;
    const { error } = await supabase.storage.from('project-files').upload(filename, file, { upsert: true });
    if (error) { setUploading(false); return; }
    const { data } = await supabase.storage.from('project-files').createSignedUrl(filename, 60 * 60 * 24 * 365);
    const url = data?.signedUrl ?? '';
    setPreview(url);
    onUploaded(url);
    setUploading(false);
  }, [expenseId]);

  return (
    <div>
      <label style={lbl}>Receipt / Invoice</label>
      {preview ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href={preview} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', color: '#16A34A', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
            <CheckCircle size={12} strokeWidth={1.5} /> Receipt Uploaded — View
          </a>
          <button onClick={() => { setPreview(null); onUploaded(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 11, fontFamily: 'var(--font-body)' }}>Remove</button>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
          onClick={() => inputRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? '#FCE205' : 'var(--color-border)'}`, borderRadius: 9, padding: '18px', background: dragging ? 'rgba(252,226,5,0.05)' : 'var(--color-mist)', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
        >
          {uploading ? (
            <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Uploading...</p>
          ) : (
            <div>
              <Upload size={18} color={dragging ? '#8A7600' : 'var(--color-muted)'} strokeWidth={1.5} style={{ marginBottom: 6 }} />
              <p style={{ fontSize: 11, color: dragging ? '#8A7600' : 'var(--color-muted)' }}>Drop receipt or click to upload</p>
              <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>PNG, JPG, PDF</p>
            </div>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
    </div>
  );
}

export default function ExpensesPage() {
  const [expenses, setExpenses]   = useState<any[]>([]);
  const [clients, setClients]     = useState<any[]>([]);
  const [projects, setProjects]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving]       = useState(false);
  const [newId]                   = useState(() => crypto.randomUUID());

  const [form, setForm] = useState<any>({
    expense_date:   new Date().toISOString().split('T')[0],
    expense_type:   'general',
    description:    '',
    vendor:         '',
    amount:         '',
    hst_amount:     '',
    net_amount:     '',
    payment_method: 'company_card',
    client_id:      '',
    project_id:     '',
    billable:       false,
    receipt_url:    '',
    vehicle_id:     '',
    odometer_start: '',
    odometer_end:   '',
    notes:          '',
    approved:       false,
  });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [expRes, clientRes, projRes] = await Promise.all([
      supabase.from('expenses').select('*, projects(name), clients(first_name, last_name)').eq('company_id', COMPANY_ID).order('expense_date', { ascending: false }),
      supabase.from('clients').select('id, first_name, last_name').eq('company_id', COMPANY_ID),
      supabase.from('projects').select('id, name, client_id').eq('company_id', COMPANY_ID),
    ]);
    if (expRes.data)    setExpenses(expRes.data);
    if (clientRes.data) setClients(clientRes.data);
    if (projRes.data)   setProjects(projRes.data);
    setLoading(false);
  }

  function setF(key: string, val: any) { setForm((prev: any) => ({ ...prev, [key]: val })); }

  /* Auto-calc HST and net when amount changes */
  function setAmount(val: string) {
    const amt    = Number(val);
    const hst    = Number((amt - amt / 1.13).toFixed(2));
    const net    = Number((amt / 1.13).toFixed(2));
    setForm((prev: any) => ({ ...prev, amount: val, hst_amount: hst > 0 ? String(hst) : '', net_amount: net > 0 ? String(net) : '' }));
  }

  /* Auto-calc km when odometers change */
  const kmTotal = form.odometer_end && form.odometer_start
    ? Math.max(0, Number(form.odometer_end) - Number(form.odometer_start))
    : 0;

  const clientProjects = projects.filter(p => !form.client_id || p.client_id === form.client_id);

  function resetForm() {
    setForm({ expense_date: new Date().toISOString().split('T')[0], expense_type: 'general', description: '', vendor: '', amount: '', hst_amount: '', net_amount: '', payment_method: 'company_card', client_id: '', project_id: '', billable: false, receipt_url: '', vehicle_id: '', odometer_start: '', odometer_end: '', notes: '', approved: false });
  }

  async function save() {
    if (!form.description || !form.amount) return;
    setSaving(true);
    await supabase.from('expenses').insert({
      id:             newId,
      company_id:     COMPANY_ID,
      expense_date:   form.expense_date,
      expense_type:   form.expense_type,
      description:    form.description,
      vendor:         form.vendor || null,
      amount:         Number(form.amount),
      hst_amount:     Number(form.hst_amount) || 0,
      net_amount:     Number(form.net_amount) || 0,
      payment_method: form.payment_method,
      client_id:      form.client_id || null,
      project_id:     form.project_id || null,
      billable:       form.billable,
      receipt_url:    form.receipt_url || null,
      vehicle_id:     form.vehicle_id || null,
      odometer_start: form.odometer_start ? Number(form.odometer_start) : null,
      odometer_end:   form.odometer_end ? Number(form.odometer_end) : null,
      km_total:       kmTotal || null,
      notes:          form.notes || null,
      approved:       false,
    });
    setSaving(false);
    setShowModal(false);
    resetForm();
    fetchAll();
  }

  async function approve(id: string, val: boolean) {
    await supabase.from('expenses').update({ approved: val }).eq('id', id);
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, approved: val } : e));
  }

  function exportXLSX() {
    const rows = filtered.map(e => ({
      'Date':           e.expense_date,
      'Type':           e.expense_type,
      'Description':    e.description,
      'Vendor':         e.vendor ?? '—',
      'Amount (incl)':  e.amount?.toFixed(2),
      'HST':            e.hst_amount?.toFixed(2) ?? '0.00',
      'Net (excl HST)': e.net_amount?.toFixed(2) ?? '0.00',
      'Payment Method': e.payment_method,
      'Client':         e.clients ? `${e.clients.first_name} ${e.clients.last_name}` : '—',
      'Project':        e.projects?.name ?? '—',
      'Billable':       e.billable ? 'Yes' : 'No',
      'Approved':       e.approved ? 'Yes' : 'No',
      'KM':             e.km_total ?? '—',
      'Vehicle':        e.vehicle_id ?? '—',
      'Notes':          e.notes ?? '—',
      'COA Account':    getCOA(e.expense_type),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

    /* Journal entries sheet */
    const journalRows: any[] = [];
    filtered.filter(e => e.approved).forEach(e => {
      const ref = `EXP-${e.id.slice(0, 6).toUpperCase()}`;
      journalRows.push({ 'Date': e.expense_date, 'Ref': ref, 'Account': getCOA(e.expense_type), 'Debit': e.net_amount?.toFixed(2) ?? e.amount?.toFixed(2), 'Credit': '', 'Memo': e.description, 'Customer:Job': e.projects?.name ?? '—' });
      if (e.hst_amount > 0) journalRows.push({ 'Date': e.expense_date, 'Ref': ref, 'Account': '1200 - HST Receivable (ITC)', 'Debit': e.hst_amount?.toFixed(2), 'Credit': '', 'Memo': `ITC — ${e.description}`, 'Customer:Job': e.projects?.name ?? '—' });
      journalRows.push({ 'Date': e.expense_date, 'Ref': ref, 'Account': e.payment_method === 'personal' ? '2100 - Employee Reimbursable' : '1000 - Bank / Company Card', 'Debit': '', 'Credit': e.amount?.toFixed(2), 'Memo': e.description, 'Customer:Job': e.projects?.name ?? '—' });
    });
    const wsJ = XLSX.utils.json_to_sheet(journalRows);
    XLSX.utils.book_append_sheet(wb, wsJ, 'Journal Entries');

    XLSX.writeFile(wb, `Expenses_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  function getCOA(type: string): string {
    const map: Record<string, string> = {
      fuel:          '6100 - Fuel & Vehicle',
      vehicle:       '6100 - Fuel & Vehicle',
      materials:     '5200 - Materials & Supplies',
      subcontractor: '5300 - Subcontractor Costs',
      supplies:      '5200 - Materials & Supplies',
      meals:         '6200 - Meals & Entertainment',
      phone:         '6300 - Phone & Internet',
      general:       '6000 - General Overhead',
    };
    return map[type] ?? '6000 - General Overhead';
  }

  /* Stats */
  const totalAmt       = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalHST       = expenses.reduce((s, e) => s + (e.hst_amount ?? 0), 0);
  const totalBillable  = expenses.filter(e => e.billable).reduce((s, e) => s + (e.amount ?? 0), 0);
  const pendingApproval = expenses.filter(e => !e.approved).length;

  const filtered = expenses.filter(e => {
    const matchType   = typeFilter === 'all' || e.expense_type === typeFilter;
    const matchStatus = statusFilter === 'all' || (statusFilter === 'approved' ? e.approved : !e.approved);
    const matchSearch = !search || e.description?.toLowerCase().includes(search.toLowerCase()) || e.vendor?.toLowerCase().includes(search.toLowerCase()) || e.projects?.name?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchStatus && matchSearch;
  });

  const isFuel = form.expense_type === 'fuel' || form.expense_type === 'vehicle';

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── New Expense Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm(); } }}>
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 620, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: 24 }}>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(252,226,5,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Receipt size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Expense</span>
              </div>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="var(--color-muted)" /></button>
            </div>

            <div style={{ padding: '20px', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Type selector */}
              <div>
                <label style={lbl}>Expense Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
                  {EXPENSE_TYPES.map(t => {
                    const Icon   = t.icon;
                    const active = form.expense_type === t.id;
                    return (
                      <button key={t.id} onClick={() => setF('expense_type', t.id)} style={{ padding: '10px 6px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'center', background: active ? `${t.color}12` : 'var(--color-mist)', border: active ? `2px solid ${t.color}` : '2px solid transparent', transition: 'all 0.12s' }}>
                        <Icon size={16} color={active ? t.color : 'var(--color-muted)'} strokeWidth={1.5} style={{ marginBottom: 4 }} />
                        <p style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? t.color : 'var(--color-muted)' }}>{t.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date + Vendor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Date</label>
                  <input style={inp} type="date" value={form.expense_date} onChange={e => setF('expense_date', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Vendor / Supplier</label>
                  <input style={inp} placeholder="Petro-Canada, Home Depot..." value={form.vendor} onChange={e => setF('vendor', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={lbl}>Description *</label>
                <input style={inp} placeholder="What was this expense for?" value={form.description} onChange={e => setF('description', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>

              {/* Amount + HST */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Total Amount (incl HST) *</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)' }}>$</span>
                    <input style={{ ...inp, paddingLeft: 20, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setAmount(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>HST Amount</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)' }}>$</span>
                    <input style={{ ...inp, paddingLeft: 20, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="0.01" value={form.hst_amount} onChange={e => setF('hst_amount', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                  <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 3 }}>Auto-calculated at 13%</p>
                </div>
                <div>
                  <label style={lbl}>Net (excl HST)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)' }}>$</span>
                    <input style={{ ...inp, paddingLeft: 20, fontFamily: 'var(--font-mono)', background: 'var(--color-mist)' }} type="number" min="0" step="0.01" value={form.net_amount} readOnly />
                  </div>
                </div>
              </div>

              {/* Payment method */}
              <div>
                <label style={lbl}>Payment Method</label>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.id} onClick={() => setF('payment_method', m.id)} style={{ padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: form.payment_method === m.id ? 700 : 400, background: form.payment_method === m.id ? 'rgba(252,226,5,0.12)' : 'var(--color-mist)', border: form.payment_method === m.id ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: form.payment_method === m.id ? '#8A7600' : 'var(--color-muted)', transition: 'all 0.12s' }}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {form.payment_method === 'personal' && (
                  <p style={{ fontSize: 10, color: '#D97706', marginTop: 5, fontWeight: 600 }}>⚠ Personal expense — will appear in reimbursement report</p>
                )}
              </div>

              {/* Vehicle/fuel fields */}
              {isFuel && (
                <div style={{ padding: '14px', borderRadius: 9, background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.2)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#D97706', marginBottom: 12 }}>Vehicle Details</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Vehicle ID / Plate</label>
                      <input style={inp} placeholder="Truck #1, ABC-1234" value={form.vehicle_id} onChange={e => setF('vehicle_id', e.target.value)} onFocus={focus} onBlur={blur} />
                    </div>
                    <div>
                      <label style={lbl}>Odometer Start (km)</label>
                      <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={form.odometer_start} onChange={e => setF('odometer_start', e.target.value)} onFocus={focus} onBlur={blur} />
                    </div>
                    <div>
                      <label style={lbl}>Odometer End (km)</label>
                      <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={form.odometer_end} onChange={e => setF('odometer_end', e.target.value)} onFocus={focus} onBlur={blur} />
                    </div>
                  </div>
                  {kmTotal > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Car size={13} color="#D97706" strokeWidth={1.5} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#D97706' }}>{kmTotal} km logged</span>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>· CRA rate: ${(kmTotal * 0.70).toFixed(2)} @ $0.70/km</span>
                    </div>
                  )}
                </div>
              )}

              {/* Client + Project */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Client (optional)</label>
                  <select style={inp} value={form.client_id} onChange={e => { setF('client_id', e.target.value); setF('project_id', ''); }} onFocus={focus} onBlur={blur}>
                    <option value="">No client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Project (optional)</label>
                  <select style={inp} value={form.project_id} onChange={e => setF('project_id', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">No project</option>
                    {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Billable toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: form.billable ? 'rgba(22,163,74,0.05)' : 'var(--color-mist)', border: `1px solid ${form.billable ? 'rgba(22,163,74,0.2)' : 'var(--color-border)'}`, cursor: 'pointer', transition: 'all 0.15s' }}
                onClick={() => setF('billable', !form.billable)}>
                <div style={{ width: 36, height: 20, borderRadius: 100, background: form.billable ? '#16A34A' : 'var(--color-border)', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: form.billable ? 19 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600 }}>Billable to client</p>
                  <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Will appear in billable expenses report for invoicing</p>
                </div>
              </div>

              {/* Receipt upload */}
              <ReceiptUpload
                expenseId={newId}
                currentUrl={form.receipt_url}
                onUploaded={url => setF('receipt_url', url)}
              />

              {/* Notes */}
              <div>
                <label style={lbl}>Notes</label>
                <textarea style={{ ...inp, height: 60, padding: '8px 10px', resize: 'none' }} value={form.notes} onChange={e => setF('notes', e.target.value)} onFocus={focus} onBlur={blur} placeholder="Additional context..." />
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="forge-button forge-button--secondary">Cancel</button>
              <button onClick={save} disabled={saving || !form.description || !form.amount} className="forge-button forge-button--primary" style={{ gap: 6 }}>
                <Receipt size={13} /> {saving ? 'Saving...' : 'Add Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Financial</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Expenses</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>{expenses.length} expenses recorded</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={exportXLSX} className="forge-button forge-button--secondary" style={{ gap: 6 }}>
            <Download size={13} /> Export XLSX
          </button>
          <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary" style={{ gap: 6 }}>
            <Plus size={13} /> Add Expense
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Expenses',    value: `$${totalAmt.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,      color: '#DC2626' },
          { label: 'HST Reclaimable',  value: `$${totalHST.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,      color: '#16A34A' },
          { label: 'Billable to Client', value: `$${totalBillable.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, color: '#1E5FA4' },
          { label: 'Pending Approval', value: String(pendingApproval),                                                     color: '#D97706' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 6 }}>{stat.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: stat.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input className="forge-input" placeholder="Search expenses..." style={{ paddingLeft: 30 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setTypeFilter('all')} style={{ padding: '6px 12px', fontSize: 11, fontWeight: typeFilter === 'all' ? 700 : 400, borderRadius: 6, cursor: 'pointer', background: typeFilter === 'all' ? 'rgba(252,226,5,0.12)' : 'transparent', border: typeFilter === 'all' ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: typeFilter === 'all' ? '#8A7600' : 'var(--color-muted)', transition: 'all 0.12s' }}>All Types</button>
          {EXPENSE_TYPES.map(t => (
            <button key={t.id} onClick={() => setTypeFilter(t.id)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: typeFilter === t.id ? 700 : 400, borderRadius: 6, cursor: 'pointer', background: typeFilter === t.id ? `${t.color}15` : 'transparent', border: typeFilter === t.id ? `1px solid ${t.color}40` : '1px solid var(--color-border)', color: typeFilter === t.id ? t.color : 'var(--color-muted)', transition: 'all 0.12s' }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {['all', 'approved', 'pending'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: statusFilter === s ? 700 : 400, borderRadius: 6, cursor: 'pointer', background: statusFilter === s ? 'rgba(252,226,5,0.12)' : 'transparent', border: statusFilter === s ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: statusFilter === s ? '#8A7600' : 'var(--color-muted)', transition: 'all 0.12s', textTransform: 'capitalize' }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="forge-card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading expenses...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 40px', textAlign: 'center' }}>
            <Receipt size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
              {search || typeFilter !== 'all' ? 'No expenses match your filter' : 'No expenses yet'}
            </p>
            {!search && typeFilter === 'all' && <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Click Add Expense to record your first expense</p>}
          </div>
        ) : (
          <table className="forge-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Vendor</th>
                <th>Project</th>
                <th>Amount</th>
                <th>HST</th>
                <th>Method</th>
                <th>Billable</th>
                <th>Receipt</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => {
                const typeConfig = EXPENSE_TYPES.find(t => t.id === exp.expense_type) ?? EXPENSE_TYPES[7];
                const Icon       = typeConfig.icon;
                return (
                  <tr key={exp.id}>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(exp.expense_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon size={12} color={typeConfig.color} strokeWidth={1.5} />
                        <span style={{ fontSize: 11, color: typeConfig.color, fontWeight: 600 }}>{typeConfig.label}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.description}</td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>{exp.vendor ?? '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.projects?.name ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: '#DC2626' }}>${exp.amount?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#16A34A' }}>${(exp.hst_amount ?? 0).toFixed(2)}</td>
                    <td>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
                        {PAYMENT_METHODS.find(m => m.id === exp.payment_method)?.label ?? exp.payment_method}
                      </span>
                    </td>
                    <td>
                      {exp.billable
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: '#1E5FA4' }}>Billable</span>
                        : <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>No</span>
                      }
                    </td>
                    <td>
                      {exp.receipt_url
                        ? <a href={exp.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, textDecoration: 'none' }}>View</a>
                        : <span style={{ fontSize: 10, color: '#DC2626' }}>Missing</span>
                      }
                    </td>
                    <td>
                      <button
                        onClick={() => approve(exp.id, !exp.approved)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: exp.approved ? 'rgba(22,163,74,0.10)' : 'rgba(217,119,6,0.10)', border: exp.approved ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(217,119,6,0.25)', color: exp.approved ? '#16A34A' : '#D97706', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                      >
                        {exp.approved ? <><Check size={10} /> Approved</> : <><Clock size={10} /> Pending</>}
                      </button>
                    </td>
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