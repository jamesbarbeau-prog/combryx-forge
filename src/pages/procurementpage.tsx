import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import {
  Plus, Search, Download, X, Check, ChevronRight,
  Star, AlertTriangle, Package, Users, FileText,
  Truck, CheckCircle, Clock, Send, Award,
  Trash2, GripVertical, Shield, Calendar,
} from 'lucide-react';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

type Tab = 'pos' | 'vendors' | 'subtrades' | 'rfqs';

const PO_STATUSES = [
  { id: 'draft',     label: 'Draft',     color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
  { id: 'approved',  label: 'Approved',  color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)'  },
  { id: 'sent',      label: 'Sent',      color: '#8A7600', bg: 'rgba(252,226,5,0.12)'  },
  { id: 'received',  label: 'Received',  color: '#16A34A', bg: 'rgba(22,163,74,0.10)'  },
  { id: 'partial',   label: 'Partial',   color: '#D97706', bg: 'rgba(217,119,6,0.10)'  },
  { id: 'cancelled', label: 'Cancelled', color: '#DC2626', bg: 'rgba(220,38,38,0.10)'  },
];

const SUB_STATUSES = [
  { id: 'pending',          label: 'Pending',          color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
  { id: 'active',           label: 'Active',           color: '#16A34A', bg: 'rgba(22,163,74,0.10)'  },
  { id: 'complete',         label: 'Complete',         color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)'  },
  { id: 'holdback_released',label: 'Holdback Released',color: '#8A7600', bg: 'rgba(252,226,5,0.12)'  },
  { id: 'disputed',         label: 'Disputed',         color: '#DC2626', bg: 'rgba(220,38,38,0.10)'  },
];

const RFQ_STATUSES = [
  { id: 'draft',    label: 'Draft',    color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
  { id: 'sent',     label: 'Sent',     color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)'  },
  { id: 'received', label: 'Received', color: '#D97706', bg: 'rgba(217,119,6,0.10)'  },
  { id: 'awarded',  label: 'Awarded',  color: '#16A34A', bg: 'rgba(22,163,74,0.10)'  },
];

const TRADES = [
  'Framing','Electrical','Plumbing','HVAC','Drywall','Painting',
  'Flooring','Tile','Concrete','Demolition','Roofing','Windows',
  'Siding','Insulation','Masonry','Landscape','Carpentry','General',
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

function StatusBadge({ status, statuses }: { status: string; statuses: typeof PO_STATUSES }) {
  const s = statuses.find(x => x.id === status) ?? statuses[0];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function ComplianceFlag({ date, label }: { date: string | null; label: string }) {
  if (!date) return <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>No {label}</span>;
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86400000);
  const color = days < 0 ? '#DC2626' : days < 30 ? '#D97706' : '#16A34A';
  const bg    = days < 0 ? 'rgba(220,38,38,0.08)' : days < 30 ? 'rgba(217,119,6,0.08)' : 'rgba(22,163,74,0.08)';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, color, background: bg }}>
      {days < 0 ? `${label} EXPIRED` : days < 30 ? `${label} exp. ${days}d` : `${label} ✓`}
    </span>
  );
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={13} fill={i <= value ? '#FCE205' : 'none'} color={i <= value ? '#8A7600' : 'var(--color-muted)'}
          strokeWidth={1.5} style={{ cursor: onChange ? 'pointer' : 'default' }}
          onClick={() => onChange?.(i)} />
      ))}
    </div>
  );
}

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState<Tab>('pos');
  const [vendors, setVendors]     = useState<any[]>([]);
  const [projects, setProjects]   = useState<any[]>([]);
  const [clients, setClients]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { fetchBase(); }, []);

  async function fetchBase() {
    setLoading(true);
    const [vRes, pRes, cRes] = await Promise.all([
      supabase.from('vendors').select('*').eq('company_id', COMPANY_ID).order('name'),
      supabase.from('projects').select('id, name, client_id').eq('company_id', COMPANY_ID),
      supabase.from('clients').select('id, first_name, last_name').eq('company_id', COMPANY_ID),
    ]);
    if (vRes.data) setVendors(vRes.data);
    if (pRes.data) setProjects(pRes.data);
    if (cRes.data) setClients(cRes.data);
    setLoading(false);
  }

  const TABS = [
    { id: 'pos',      label: 'Purchase Orders', icon: Package  },
    { id: 'vendors',  label: 'Vendors',          icon: Users    },
    { id: 'subtrades',label: 'Sub-trades',       icon: Shield   },
    { id: 'rfqs',     label: 'RFQ / Bids',       icon: FileText },
  ] as const;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>Operations</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Procurement</h1>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--color-mist)', padding: 4, borderRadius: 10, border: '1px solid var(--color-border)', width: 'fit-content' }}>
        {TABS.map(tab => {
          const Icon   = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: active ? 700 : 400, background: active ? 'var(--color-panel)' : 'transparent', border: active ? '1px solid var(--color-border)' : '1px solid transparent', color: active ? 'var(--color-text)' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.12s' }}>
              <Icon size={12} strokeWidth={active ? 2 : 1.5} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Loading...</div>
      ) : (
        <>
          {activeTab === 'pos'       && <POTab       vendors={vendors} projects={projects} clients={clients} />}
          {activeTab === 'vendors'   && <VendorsTab  vendors={vendors} onRefresh={fetchBase} />}
          {activeTab === 'subtrades' && <SubtradesTab vendors={vendors} projects={projects} />}
          {activeTab === 'rfqs'      && <RFQTab      vendors={vendors} projects={projects} clients={clients} />}
        </>
      )}
    </div>
  );
}

/* ── PURCHASE ORDERS TAB ── */
function POTab({ vendors, projects, clients }: { vendors: any[]; projects: any[]; clients: any[] }) {
  const [pos, setPos]             = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm]           = useState<any>({
    vendor_id: '', project_id: '', client_id: '',
    delivery_date: '', delivery_address: '', lead_time_days: '',
    tax_rate: 13, notes: '', approved_by: '',
    line_items: [{ id: uid(), description: '', quantity: 1, unit: 'ea', unit_price: 0, amount: 0 }],
  });

  useEffect(() => { fetchPOs(); }, []);

  async function fetchPOs() {
    setLoading(true);
    const { data } = await supabase.from('purchase_orders')
      .select('*, vendors(name), projects(name)')
      .eq('company_id', COMPANY_ID)
      .order('created_at', { ascending: false });
    if (data) setPos(data);
    setLoading(false);
  }

  function setF(k: string, v: any) { setForm((p: any) => ({ ...p, [k]: v })); }

  function updateItem(id: string, field: string, val: any) {
    setForm((prev: any) => ({
      ...prev,
      line_items: prev.line_items.map((item: any) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        updated.amount = Number(updated.quantity) * Number(updated.unit_price);
        return updated;
      }),
    }));
  }

  const subtotal  = form.line_items.reduce((s: number, i: any) => s + (i.amount ?? 0), 0);
  const taxAmount = subtotal * (form.tax_rate / 100);
  const total     = subtotal + taxAmount;

  async function save() {
    if (!form.vendor_id) return;
    setSaving(true);
    const poNum = `PO-${Date.now().toString().slice(-5)}`;
    await supabase.from('purchase_orders').insert({
      company_id:       COMPANY_ID,
      po_number:        poNum,
      vendor_id:        form.vendor_id,
      project_id:       form.project_id || null,
      client_id:        form.client_id  || null,
      status:           'draft',
      line_items:       form.line_items,
      subtotal,
      tax_rate:         form.tax_rate,
      tax_amount:       taxAmount,
      total,
      delivery_date:    form.delivery_date || null,
      delivery_address: form.delivery_address || null,
      lead_time_days:   form.lead_time_days ? Number(form.lead_time_days) : null,
      notes:            form.notes || null,
    });
    setSaving(false);
    setShowModal(false);
    fetchPOs();
  }

  async function advanceStatus(po: any) {
    const flow: Record<string, string> = { draft: 'approved', approved: 'sent', sent: 'received' };
    const next = flow[po.status];
    if (!next) return;
    const updates: any = { status: next };
    if (next === 'approved') updates.approved_at = new Date().toISOString();
    if (next === 'received') updates.received_at = new Date().toISOString();
    await supabase.from('purchase_orders').update(updates).eq('id', po.id);
    setPos(prev => prev.map(p => p.id === po.id ? { ...p, ...updates } : p));
  }

  function exportXLSX() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filtered.map(po => ({
      'PO #':        po.po_number,
      'Vendor':      po.vendors?.name ?? '—',
      'Project':     po.projects?.name ?? '—',
      'Status':      po.status,
      'Total':       po.total?.toFixed(2),
      'Delivery':    po.delivery_date ?? '—',
      'Lead Days':   po.lead_time_days ?? '—',
      'Created':     new Date(po.created_at).toLocaleDateString('en-CA'),
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Orders');
    XLSX.writeFile(wb, `POs_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  const filtered = pos.filter(po => {
    const matchStatus = statusFilter === 'all' || po.status === statusFilter;
    const matchSearch = !search || po.po_number?.toLowerCase().includes(search.toLowerCase()) || po.vendors?.name?.toLowerCase().includes(search.toLowerCase()) || po.projects?.name?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalValue    = pos.reduce((s, p) => s + (p.total ?? 0), 0);
  const pendingCount  = pos.filter(p => p.status === 'draft' || p.status === 'approved').length;
  const receivedCount = pos.filter(p => p.status === 'received').length;

  return (
    <div>
      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 680, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(252,226,5,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Purchase Order</span>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="var(--color-muted)" /></button>
            </div>

            <div style={{ padding: '20px', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Vendor + Project */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Vendor *</label>
                  <select style={inp} value={form.vendor_id} onChange={e => setF('vendor_id', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select vendor...</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Project (optional)</label>
                  <select style={inp} value={form.project_id} onChange={e => setF('project_id', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">No project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Delivery */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Delivery Date</label>
                  <input style={inp} type="date" value={form.delivery_date} onChange={e => setF('delivery_date', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Lead Time (days)</label>
                  <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={form.lead_time_days} onChange={e => setF('lead_time_days', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Tax Rate (%)</label>
                  <input style={{ ...inp, fontFamily: 'var(--font-mono)' }} type="number" value={form.tax_rate} onChange={e => setF('tax_rate', Number(e.target.value))} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              <div>
                <label style={lbl}>Delivery Address</label>
                <input style={inp} placeholder="Job site address or warehouse" value={form.delivery_address} onChange={e => setF('delivery_address', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>

              {/* Line items */}
              <div>
                <label style={lbl}>Line Items</label>
                <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 60px 70px 90px 90px 24px', gap: 5, padding: '0 2px', marginBottom: 6 }}>
                  {['', 'Description', 'Qty', 'Unit', 'Unit Price', 'Amount', ''].map((h, i) => (
                    <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)' }}>{h}</span>
                  ))}
                </div>
                {form.line_items.map((item: any) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 60px 70px 90px 90px 24px', gap: 5, marginBottom: 6, alignItems: 'center' }}>
                    <GripVertical size={11} color="var(--color-muted)" />
                    <input style={inp} placeholder="Material or service description" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} onFocus={focus} onBlur={blur} />
                    <input style={{ ...inp, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))} onFocus={focus} onBlur={blur} />
                    <select style={inp} value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} onFocus={focus} onBlur={blur}>
                      {['ea','lf','sqft','sqyd','cy','lb','ton','hr','ls','box','sheet','bag'].map(u => <option key={u}>{u}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-muted)' }}>$</span>
                      <input style={{ ...inp, paddingLeft: 18, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(item.id, 'unit_price', Number(e.target.value))} onFocus={focus} onBlur={blur} />
                    </div>
                    <div style={{ height: 38, borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 10px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
                      ${item.amount.toLocaleString()}
                    </div>
                    <button onClick={() => setForm((p: any) => ({ ...p, line_items: p.line_items.filter((i: any) => i.id !== item.id) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4 }}>
                      <Trash2 size={11} color="var(--color-muted)" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setForm((p: any) => ({ ...p, line_items: [...p.line_items, { id: uid(), description: '', quantity: 1, unit: 'ea', unit_price: 0, amount: 0 }] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px dashed var(--color-border)', color: 'var(--color-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', marginTop: 4 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.color = '#8A7600'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-muted)'; }}>
                  <Plus size={11} /> Add line item
                </button>
              </div>

              {/* Totals */}
              <div style={{ padding: '12px 14px', borderRadius: 9, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                {[
                  { label: 'Subtotal', value: `$${subtotal.toFixed(2)}` },
                  { label: `HST (${form.tax_rate}%)`, value: `$${taxAmount.toFixed(2)}` },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{row.label}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #FCE205' }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>Total</span>
                  <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#8A7600' }}>${total.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label style={lbl}>Notes</label>
                <textarea style={{ ...inp, height: 60, padding: '8px 10px', resize: 'none' }} value={form.notes} onChange={e => setF('notes', e.target.value)} onFocus={focus} onBlur={blur} placeholder="Special instructions, terms..." />
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button onClick={() => setShowModal(false)} className="forge-button forge-button--secondary">Cancel</button>
              <button onClick={save} disabled={saving || !form.vendor_id} className="forge-button forge-button--primary" style={{ gap: 6 }}>
                <Package size={13} /> {saving ? 'Saving...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total PO Value', value: `$${totalValue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, color: '#8A7600' },
          { label: 'Pending',        value: String(pendingCount),  color: '#D97706' },
          { label: 'Received',       value: String(receivedCount), color: '#16A34A' },
          { label: 'Total POs',      value: String(pos.length),    color: '#6B7280' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 5 }}>{stat.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input className="forge-input" placeholder="Search POs..." style={{ paddingLeft: 30 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...PO_STATUSES.map(s => s.id)].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: statusFilter === s ? 700 : 400, borderRadius: 6, cursor: 'pointer', background: statusFilter === s ? 'rgba(252,226,5,0.12)' : 'transparent', border: statusFilter === s ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: statusFilter === s ? '#8A7600' : 'var(--color-muted)', transition: 'all 0.12s', textTransform: 'capitalize' }}>{s === 'all' ? 'All' : PO_STATUSES.find(x => x.id === s)?.label ?? s}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={exportXLSX} className="forge-button forge-button--secondary" style={{ gap: 6 }}><Download size={13} /> Export</button>
          <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary" style={{ gap: 6 }}><Plus size={13} /> New PO</button>
        </div>
      </div>

      {/* Table */}
      <div className="forge-card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Loading...</div>
        : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Package size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No purchase orders yet</p>
            <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Create your first PO using the button above</p>
          </div>
        ) : (
          <table className="forge-table">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Vendor</th>
                <th>Project</th>
                <th>Status</th>
                <th>Total</th>
                <th>Delivery</th>
                <th>Lead Time</th>
                <th>3-Way</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(po => {
                const nextAction: Record<string, string> = { draft: 'Approve', approved: 'Mark Sent', sent: 'Mark Received' };
                const action = nextAction[po.status];
                return (
                  <tr key={po.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>{po.po_number}</td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{po.vendors?.name ?? '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>{po.projects?.name ?? '—'}</td>
                    <td><StatusBadge status={po.status} statuses={PO_STATUSES} /></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>${po.total?.toFixed(2)}</td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>{po.delivery_date ? new Date(po.delivery_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>{po.lead_time_days ? `${po.lead_time_days}d` : '—'}</td>
                    <td>
                      {po.three_way_matched
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: '#16A34A' }}>✓ Matched</span>
                        : <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Pending</span>
                      }
                    </td>
                    <td>
                      {action && (
                        <button onClick={() => advanceStatus(po)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: 'rgba(252,226,5,0.12)', border: '1px solid rgba(252,226,5,0.3)', color: '#8A7600', cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                          {action}
                        </button>
                      )}
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

/* ── VENDORS TAB ── */
function VendorsTab({ vendors, onRefresh }: { vendors: any[]; onRefresh: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [form, setForm]           = useState<any>({
    name: '', vendor_type: 'supplier', trade: '', contact_name: '',
    email: '', phone: '', address: '', hst_number: '',
    payment_terms: 'net_30', rating: 0, preferred: false,
    insurance_expiry: '', liability_expiry: '', wsib_expiry: '', notes: '',
  });

  function setF(k: string, v: any) { setForm((p: any) => ({ ...p, [k]: v })); }

  async function save() {
    if (!form.name) return;
    setSaving(true);
    await supabase.from('vendors').insert({ ...form, company_id: COMPANY_ID, status: 'active' });
    setSaving(false);
    setShowModal(false);
    onRefresh();
  }

  async function togglePreferred(v: any) {
    await supabase.from('vendors').update({ preferred: !v.preferred }).eq('id', v.id);
    onRefresh();
  }

  async function updateRating(id: string, rating: number) {
    await supabase.from('vendors').update({ rating }).eq('id', id);
    onRefresh();
  }

  const filtered = vendors.filter(v => !search || v.name?.toLowerCase().includes(search.toLowerCase()) || v.trade?.toLowerCase().includes(search.toLowerCase()));
  const now      = new Date();

  const complianceIssues = vendors.filter(v => {
    const wsibOk = v.wsib_expiry && new Date(v.wsib_expiry) > now;
    const insOk  = v.insurance_expiry && new Date(v.insurance_expiry) > now;
    return !wsibOk || !insOk;
  }).length;

  return (
    <div>
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 580, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Vendor / Supplier</span>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="var(--color-muted)" /></button>
            </div>
            <div style={{ padding: '20px', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Company Name *</label>
                  <input style={inp} value={form.name} onChange={e => setF('name', e.target.value)} onFocus={focus} onBlur={blur} placeholder="ABC Lumber Co." />
                </div>
                <div>
                  <label style={lbl}>Vendor Type</label>
                  <select style={inp} value={form.vendor_type} onChange={e => setF('vendor_type', e.target.value)} onFocus={focus} onBlur={blur}>
                    {['supplier','subcontractor','rental','service','other'].map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Trade / Specialty</label>
                  <select style={inp} value={form.trade} onChange={e => setF('trade', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select trade...</option>
                    {TRADES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Payment Terms</label>
                  <select style={inp} value={form.payment_terms} onChange={e => setF('payment_terms', e.target.value)} onFocus={focus} onBlur={blur}>
                    {['cod','net_7','net_14','net_30','net_45','net_60'].map(t => <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Contact Name</label>
                  <input style={inp} value={form.contact_name} onChange={e => setF('contact_name', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Phone</label>
                  <input style={inp} value={form.phone} onChange={e => setF('phone', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input style={inp} type="email" value={form.email} onChange={e => setF('email', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>HST Number</label>
                  <input style={inp} value={form.hst_number} onChange={e => setF('hst_number', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>
              <div>
                <label style={lbl}>Address</label>
                <input style={inp} value={form.address} onChange={e => setF('address', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>

              {/* Compliance */}
              <div style={{ padding: '14px', borderRadius: 9, background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', marginBottom: 12 }}>Compliance Dates</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>WSIB Expiry</label>
                    <input style={inp} type="date" value={form.wsib_expiry} onChange={e => setF('wsib_expiry', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                  <div>
                    <label style={lbl}>Liability Insurance Expiry</label>
                    <input style={inp} type="date" value={form.liability_expiry} onChange={e => setF('liability_expiry', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                  <div>
                    <label style={lbl}>Gen. Insurance Expiry</label>
                    <input style={inp} type="date" value={form.insurance_expiry} onChange={e => setF('insurance_expiry', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
              </div>

              {/* Rating */}
              <div>
                <label style={lbl}>Rating</label>
                <StarRating value={form.rating} onChange={v => setF('rating', v)} />
              </div>

              <div>
                <label style={lbl}>Notes</label>
                <textarea style={{ ...inp, height: 60, padding: '8px 10px', resize: 'none' }} value={form.notes} onChange={e => setF('notes', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button onClick={() => setShowModal(false)} className="forge-button forge-button--secondary">Cancel</button>
              <button onClick={save} disabled={saving || !form.name} className="forge-button forge-button--primary" style={{ gap: 6 }}>
                <Users size={13} /> {saving ? 'Saving...' : 'Add Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Vendors',       value: String(vendors.length),        color: '#6B7280' },
          { label: 'Preferred',           value: String(vendors.filter(v => v.preferred).length), color: '#8A7600' },
          { label: 'Compliance Issues',   value: String(complianceIssues),       color: complianceIssues > 0 ? '#DC2626' : '#16A34A' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 5 }}>{stat.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input className="forge-input" placeholder="Search vendors..." style={{ paddingLeft: 30 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary" style={{ gap: 6, marginLeft: 'auto' }}><Plus size={13} /> Add Vendor</button>
      </div>

      {filtered.length === 0 ? (
        <div className="forge-card" style={{ padding: '60px', textAlign: 'center' }}>
          <Users size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No vendors yet</p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Add your suppliers and subcontractors</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(v => (
            <div key={v.id} style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 13, fontWeight: 700 }}>{v.name}</p>
                  {v.preferred && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'rgba(252,226,5,0.12)', color: '#8A7600', border: '1px solid rgba(252,226,5,0.25)' }}>⭐ Preferred</span>}
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)', textTransform: 'capitalize' }}>{v.vendor_type}</span>
                  {v.trade && <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>{v.trade}</span>}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {v.contact_name && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{v.contact_name}</p>}
                  {v.phone && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{v.phone}</p>}
                  {v.email && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{v.email}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <ComplianceFlag date={v.wsib_expiry}      label="WSIB"      />
                  <ComplianceFlag date={v.liability_expiry} label="Liability" />
                  <ComplianceFlag date={v.insurance_expiry} label="Insurance" />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                <StarRating value={v.rating ?? 0} onChange={rating => updateRating(v.id, rating)} />
                <button onClick={() => togglePreferred(v)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: v.preferred ? 'rgba(252,226,5,0.12)' : 'var(--color-mist)', border: v.preferred ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: v.preferred ? '#8A7600' : 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {v.preferred ? 'Preferred ✓' : 'Set Preferred'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── SUBTRADES TAB ── */
function SubtradesTab({ vendors, projects }: { vendors: any[]; projects: any[] }) {
  const [subs, setSubs]           = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState<any>({
    vendor_id: '', project_id: '', trade: '', scope: '',
    contract_value: '', holdback_pct: 10, amount_paid: 0,
    start_date: '', end_date: '',
    insurance_expiry: '', wsib_expiry: '',
    notes: '',
  });

  useEffect(() => { fetchSubs(); }, []);

  async function fetchSubs() {
    setLoading(true);
    const { data } = await supabase.from('subtrades')
      .select('*, vendors(name), projects(name)')
      .eq('company_id', COMPANY_ID)
      .order('created_at', { ascending: false });
    if (data) setSubs(data);
    setLoading(false);
  }

  function setF(k: string, v: any) { setForm((p: any) => ({ ...p, [k]: v })); }

  async function save() {
    if (!form.vendor_id || !form.contract_value) return;
    setSaving(true);
    await supabase.from('subtrades').insert({
      ...form,
      company_id:     COMPANY_ID,
      contract_value: Number(form.contract_value),
      holdback_pct:   Number(form.holdback_pct),
      amount_paid:    0,
      status:         'pending',
    });
    setSaving(false);
    setShowModal(false);
    fetchSubs();
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('subtrades').update({ status }).eq('id', id);
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  }

  const totalContractValue = subs.reduce((s, sub) => s + (sub.contract_value ?? 0), 0);
  const totalHoldback      = subs.reduce((s, sub) => s + ((sub.contract_value ?? 0) * (sub.holdback_pct ?? 10) / 100), 0);
  const totalPaid          = subs.reduce((s, sub) => s + (sub.amount_paid ?? 0), 0);

  const complianceIssues = subs.filter(s => {
    const now    = new Date();
    const wsibOk = s.wsib_expiry && new Date(s.wsib_expiry) > now;
    const insOk  = s.insurance_expiry && new Date(s.insurance_expiry) > now;
    return !wsibOk || !insOk;
  }).length;

  return (
    <div>
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 580, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Sub-trade Contract</span>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="var(--color-muted)" /></button>
            </div>
            <div style={{ padding: '20px', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Sub-contractor *</label>
                  <select style={inp} value={form.vendor_id} onChange={e => setF('vendor_id', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select vendor...</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Project</label>
                  <select style={inp} value={form.project_id} onChange={e => setF('project_id', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Trade</label>
                  <select style={inp} value={form.trade} onChange={e => setF('trade', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select trade...</option>
                    {TRADES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Contract Value *</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)' }}>$</span>
                    <input style={{ ...inp, paddingLeft: 20, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={form.contract_value} onChange={e => setF('contract_value', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Holdback %</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[0, 5, 10, 15].map(p => (
                      <button key={p} onClick={() => setF('holdback_pct', p)} style={{ flex: 1, padding: '7px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: form.holdback_pct === p ? 700 : 400, background: form.holdback_pct === p ? 'rgba(252,226,5,0.12)' : 'var(--color-mist)', border: form.holdback_pct === p ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', color: form.holdback_pct === p ? '#8A7600' : 'var(--color-muted)' }}>
                        {p === 0 ? 'None' : `${p}%`}
                      </button>
                    ))}
                  </div>
                  {form.contract_value && form.holdback_pct > 0 && (
                    <p style={{ fontSize: 10, color: '#8A7600', marginTop: 4, fontWeight: 600 }}>
                      Holdback: ${(Number(form.contract_value) * form.holdback_pct / 100).toFixed(2)}
                    </p>
                  )}
                </div>
                <div>
                  <label style={lbl}>Start Date</label>
                  <input style={inp} type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={lbl}>End Date</label>
                  <input style={inp} type="date" value={form.end_date} onChange={e => setF('end_date', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              <div>
                <label style={lbl}>Scope of Work</label>
                <textarea style={{ ...inp, height: 80, padding: '8px 10px', resize: 'none' }} value={form.scope} onChange={e => setF('scope', e.target.value)} onFocus={focus} onBlur={blur} placeholder="Detailed description of what this sub is responsible for..." />
              </div>

              <div style={{ padding: '14px', borderRadius: 9, background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', marginBottom: 12 }}>Compliance</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>WSIB Cert Expiry</label>
                    <input style={inp} type="date" value={form.wsib_expiry} onChange={e => setF('wsib_expiry', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                  <div>
                    <label style={lbl}>Insurance Expiry</label>
                    <input style={inp} type="date" value={form.insurance_expiry} onChange={e => setF('insurance_expiry', e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
              </div>

              <div>
                <label style={lbl}>Notes</label>
                <textarea style={{ ...inp, height: 60, padding: '8px 10px', resize: 'none' }} value={form.notes} onChange={e => setF('notes', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button onClick={() => setShowModal(false)} className="forge-button forge-button--secondary">Cancel</button>
              <button onClick={save} disabled={saving || !form.vendor_id || !form.contract_value} className="forge-button forge-button--primary" style={{ gap: 6 }}>
                <Shield size={13} /> {saving ? 'Saving...' : 'Add Sub-trade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Contract Value', value: `$${totalContractValue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, color: '#1E5FA4' },
          { label: 'Holdback Held', value: `$${totalHoldback.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,      color: '#D97706' },
          { label: 'Amount Paid',   value: `$${totalPaid.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,          color: '#16A34A' },
          { label: 'Compliance ⚠', value: String(complianceIssues), color: complianceIssues > 0 ? '#DC2626' : '#16A34A'   },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 5 }}>{stat.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary" style={{ gap: 6 }}><Plus size={13} /> Add Sub-trade</button>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Loading...</div>
      : subs.length === 0 ? (
        <div className="forge-card" style={{ padding: '60px', textAlign: 'center' }}>
          <Shield size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No sub-trades yet</p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Add your first sub-contractor contract</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {subs.map(sub => {
            const holdback  = (sub.contract_value ?? 0) * (sub.holdback_pct ?? 10) / 100;
            const remaining = (sub.contract_value ?? 0) - (sub.amount_paid ?? 0);
            return (
              <div key={sub.id} style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <p style={{ fontSize: 13, fontWeight: 700 }}>{sub.vendors?.name ?? '—'}</p>
                      <StatusBadge status={sub.status} statuses={SUB_STATUSES} />
                      {sub.trade && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>{sub.trade}</span>}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 6 }}>{sub.projects?.name ?? 'No project'}</p>
                    {sub.scope && <p style={{ fontSize: 11, color: 'var(--color-text)', lineHeight: 1.5, maxWidth: 500 }}>{sub.scope}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 16, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--color-text)', marginBottom: 3 }}>${(sub.contract_value ?? 0).toLocaleString()}</p>
                    <p style={{ fontSize: 10, color: '#D97706', fontWeight: 600 }}>Holdback: ${holdback.toFixed(2)}</p>
                    <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Remaining: ${remaining.toFixed(2)}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <ComplianceFlag date={sub.wsib_expiry}      label="WSIB"      />
                    <ComplianceFlag date={sub.insurance_expiry} label="Insurance" />
                    {sub.start_date && <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{new Date(sub.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} → {sub.end_date ? new Date(sub.end_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : 'TBD'}</span>}
                  </div>
                  <select
                    value={sub.status}
                    onChange={e => updateStatus(sub.id, e.target.value)}
                    style={{ height: 28, padding: '0 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-mist)', fontSize: 11, fontFamily: 'var(--font-body)', color: 'var(--color-text)', outline: 'none', cursor: 'pointer' }}
                  >
                    {SUB_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── RFQ TAB ── */
function RFQTab({ vendors, projects, clients }: { vendors: any[]; projects: any[]; clients: any[] }) {
  const [rfqs, setRfqs]           = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBids, setShowBids]   = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState<any>({
    title: '', description: '', trade: '',
    project_id: '', due_date: '',
    line_items: [{ id: uid(), description: '', quantity: 1, unit: 'ls' }],
    notes: '',
  });

  useEffect(() => { fetchRFQs(); }, []);

  async function fetchRFQs() {
    setLoading(true);
    const { data } = await supabase.from('rfqs')
      .select('*, projects(name), vendors(name)')
      .eq('company_id', COMPANY_ID)
      .order('created_at', { ascending: false });
    if (data) setRfqs(data);
    setLoading(false);
  }

  function setF(k: string, v: any) { setForm((p: any) => ({ ...p, [k]: v })); }

  async function save() {
    if (!form.title) return;
    setSaving(true);
    const rfqNum = `RFQ-${Date.now().toString().slice(-5)}`;
    await supabase.from('rfqs').insert({
      company_id:  COMPANY_ID,
      rfq_number:  rfqNum,
      title:       form.title,
      description: form.description || null,
      trade:       form.trade || null,
      project_id:  form.project_id || null,
      due_date:    form.due_date || null,
      line_items:  form.line_items,
      notes:       form.notes || null,
      status:      'draft',
      bids:        [],
    });
    setSaving(false);
    setShowModal(false);
    fetchRFQs();
  }

  async function addBid(rfqId: string, vendorId: string, amount: number, notes: string) {
    const rfq = rfqs.find(r => r.id === rfqId);
    if (!rfq) return;
    const vendor = vendors.find(v => v.id === vendorId);
    const newBid = { vendor_id: vendorId, vendor_name: vendor?.name ?? '—', amount, notes, submitted_at: new Date().toISOString() };
    const updated = [...(rfq.bids ?? []), newBid];
    await supabase.from('rfqs').update({ bids: updated, status: 'received' }).eq('id', rfqId);
    fetchRFQs();
  }

  async function awardRFQ(rfqId: string, vendorId: string) {
    await supabase.from('rfqs').update({ status: 'awarded', awarded_to: vendorId, awarded_at: new Date().toISOString() }).eq('id', rfqId);
    fetchRFQs();
  }

  return (
    <div>
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 580, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New RFQ / Bid Package</span>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="var(--color-muted)" /></button>
            </div>
            <div style={{ padding: '20px', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>RFQ Title *</label>
                <input style={inp} placeholder="e.g. Lumber Package — Henderson Project" value={form.title} onChange={e => setF('title', e.target.value)} onFocus={focus} onBlur={blur} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Trade</label>
                  <select style={inp} value={form.trade} onChange={e => setF('trade', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select...</option>
                    {TRADES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Project</label>
                  <select style={inp} value={form.project_id} onChange={e => setF('project_id', e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">No project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Bid Due Date</label>
                  <input style={inp} type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea style={{ ...inp, height: 72, padding: '8px 10px', resize: 'none' }} value={form.description} onChange={e => setF('description', e.target.value)} onFocus={focus} onBlur={blur} placeholder="Scope, specifications, site conditions..." />
              </div>

              {/* Line items */}
              <div>
                <label style={lbl}>Items Requested</label>
                {form.line_items.map((item: any) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 24px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <input style={inp} placeholder="Description" value={item.description} onChange={e => setForm((p: any) => ({ ...p, line_items: p.line_items.map((i: any) => i.id === item.id ? { ...i, description: e.target.value } : i) }))} onFocus={focus} onBlur={blur} />
                    <input style={{ ...inp, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" value={item.quantity} onChange={e => setForm((p: any) => ({ ...p, line_items: p.line_items.map((i: any) => i.id === item.id ? { ...i, quantity: Number(e.target.value) } : i) }))} onFocus={focus} onBlur={blur} />
                    <select style={inp} value={item.unit} onChange={e => setForm((p: any) => ({ ...p, line_items: p.line_items.map((i: any) => i.id === item.id ? { ...i, unit: e.target.value } : i) }))} onFocus={focus} onBlur={blur}>
                      {['ls','ea','lf','sqft','cy','lb','hr','box'].map(u => <option key={u}>{u}</option>)}
                    </select>
                    <button onClick={() => setForm((p: any) => ({ ...p, line_items: p.line_items.filter((i: any) => i.id !== item.id) }))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={11} color="var(--color-muted)" /></button>
                  </div>
                ))}
                <button onClick={() => setForm((p: any) => ({ ...p, line_items: [...p.line_items, { id: uid(), description: '', quantity: 1, unit: 'ls' }] }))} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, background: 'transparent', border: '1px dashed var(--color-border)', color: 'var(--color-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  <Plus size={11} /> Add item
                </button>
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button onClick={() => setShowModal(false)} className="forge-button forge-button--secondary">Cancel</button>
              <button onClick={save} disabled={saving || !form.title} className="forge-button forge-button--primary" style={{ gap: 6 }}>
                <FileText size={13} /> {saving ? 'Saving...' : 'Create RFQ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowModal(true)} className="forge-button forge-button--primary" style={{ gap: 6 }}><Plus size={13} /> New RFQ</button>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Loading...</div>
      : rfqs.length === 0 ? (
        <div className="forge-card" style={{ padding: '60px', textAlign: 'center' }}>
          <FileText size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No RFQs yet</p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Create a bid package to compare vendors side by side</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rfqs.map(rfq => (
            <div key={rfq.id} style={{ borderRadius: 12, background: 'var(--color-panel)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>{rfq.title}</p>
                    <StatusBadge status={rfq.status} statuses={RFQ_STATUSES} />
                    {rfq.trade && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>{rfq.trade}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <p style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{rfq.rfq_number}</p>
                    {rfq.projects?.name && <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{rfq.projects.name}</p>}
                    {rfq.due_date && <p style={{ fontSize: 11, color: new Date(rfq.due_date) < new Date() ? '#DC2626' : 'var(--color-muted)', fontWeight: new Date(rfq.due_date) < new Date() ? 700 : 400 }}>Due {new Date(rfq.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</p>}
                    <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{(rfq.bids ?? []).length} bid{(rfq.bids ?? []).length !== 1 ? 's' : ''} received</p>
                  </div>
                </div>
                <button onClick={() => setShowBids(showBids === rfq.id ? null : rfq.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  {showBids === rfq.id ? 'Hide Bids' : 'View Bids'} <ChevronRight size={12} style={{ transform: showBids === rfq.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                </button>
              </div>

              {/* Bid comparison panel */}
              {showBids === rfq.id && (
                <div style={{ borderTop: '1px solid var(--color-border)', padding: '16px 18px', background: 'var(--color-mist)' }}>
                  {(rfq.bids ?? []).length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--color-muted)', textAlign: 'center', padding: '16px 0' }}>No bids received yet</p>
                  ) : (
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 12 }}>Bid Comparison</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
                        {(rfq.bids ?? []).sort((a: any, b: any) => a.amount - b.amount).map((bid: any, i: number) => (
                          <div key={i} style={{ padding: '12px 14px', borderRadius: 9, background: i === 0 ? 'rgba(22,163,74,0.08)' : 'var(--color-panel)', border: i === 0 ? '1px solid rgba(22,163,74,0.25)' : '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <p style={{ fontSize: 12, fontWeight: 700 }}>{bid.vendor_name}</p>
                              {i === 0 && <span style={{ fontSize: 9, fontWeight: 700, color: '#16A34A' }}>LOWEST</span>}
                            </div>
                            <p style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--font-mono)', color: i === 0 ? '#16A34A' : 'var(--color-text)', marginBottom: 4 }}>${bid.amount?.toLocaleString()}</p>
                            {bid.notes && <p style={{ fontSize: 10, color: 'var(--color-muted)', fontStyle: 'italic' }}>{bid.notes}</p>}
                            {rfq.status !== 'awarded' && (
                              <button onClick={() => awardRFQ(rfq.id, bid.vendor_id)} style={{ marginTop: 8, width: '100%', padding: '5px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#FCE205', border: 'none', color: '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                                Award Contract
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rfq.status !== 'awarded' && (
                    <AddBidForm vendors={vendors} onAdd={(vendorId, amount, notes) => addBid(rfq.id, vendorId, amount, notes)} />
                  )}
                  {rfq.status === 'awarded' && rfq.vendors && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
                      <Award size={14} color="#16A34A" strokeWidth={1.5} />
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#16A34A' }}>Awarded to {rfq.vendors.name}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Add Bid Form ── */
function AddBidForm({ vendors, onAdd }: { vendors: any[]; onAdd: (vendorId: string, amount: number, notes: string) => void }) {
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount]     = useState('');
  const [notes, setNotes]       = useState('');

  function submit() {
    if (!vendorId || !amount) return;
    onAdd(vendorId, Number(amount), notes);
    setVendorId(''); setAmount(''); setNotes('');
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
      <div style={{ flex: 2 }}>
        <label style={lbl}>Add Bid — Vendor</label>
        <select style={inp} value={vendorId} onChange={e => setVendorId(e.target.value)} onFocus={focus} onBlur={blur}>
          <option value="">Select vendor...</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      <div style={{ flex: 1 }}>
        <label style={lbl}>Bid Amount</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)' }}>$</span>
          <input style={{ ...inp, paddingLeft: 20, fontFamily: 'var(--font-mono)' }} type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} onFocus={focus} onBlur={blur} />
        </div>
      </div>
      <div style={{ flex: 2 }}>
        <label style={lbl}>Notes</label>
        <input style={inp} placeholder="Inclusions, exclusions, lead time..." value={notes} onChange={e => setNotes(e.target.value)} onFocus={focus} onBlur={blur} />
      </div>
      <button onClick={submit} disabled={!vendorId || !amount} style={{ height: 38, padding: '0 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: vendorId && amount ? '#FCE205' : 'var(--color-mist)', border: 'none', color: vendorId && amount ? '#111010' : 'var(--color-muted)', cursor: vendorId && amount ? 'pointer' : 'default', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
        Add Bid
      </button>
    </div>
  );
}