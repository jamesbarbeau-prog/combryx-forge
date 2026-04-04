import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  ChevronLeft, Plus, Trash2, Send, Save,
  FileText, User, DollarSign, Calendar,
  GripVertical, Check, AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useauth';

interface Client { id: string; first_name: string; last_name: string; email: string | null; }
interface LineItem { id: string; description: string; quantity: number; unit: string; rate: number; amount: number; category: 'labour' | 'material' | 'allowance' | 'other'; }
interface PaymentRow { label: string; percent: number; trigger: string; addToDispatch: boolean; }
interface NarrativeSection { title: string; content: string; }

/* ── Trade Templates ── */
const TRADE_TEMPLATES: Record<string, {
  narrativeSections: NarrativeSection[];
  defaultItems: Partial<LineItem>[];
  defaultExclusions: string[];
  defaultPayment: PaymentRow[];
  closingMessage: string;
}> = {
  renovation: {
    narrativeSections: [
      { title: 'Scope of Work', content: '' },
      { title: 'Materials & Finishes', content: '' },
      { title: 'Project Timeline', content: '' },
      { title: 'Inclusions', content: '' },
    ],
    defaultItems: [
      { description: 'Demolition & disposal', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Framing & rough carpentry', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Materials allowance', category: 'allowance', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Finishing & cleanup', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
    ],
    defaultExclusions: [
      'Permit fees unless specifically stated',
      'Furniture moving or storage',
      'Appliance supply or installation',
      'Engineering or architectural drawings',
      'Asbestos or hazardous material abatement',
      'Work beyond the defined scope',
    ],
    defaultPayment: [
      { label: 'Deposit on signing', percent: 20, trigger: 'Contract signed', addToDispatch: false },
      { label: 'Rough-in complete', percent: 30, trigger: 'Rough inspection passed', addToDispatch: true },
      { label: 'Substantial completion', percent: 40, trigger: '90% complete', addToDispatch: true },
      { label: 'Holdback release', percent: 10, trigger: '45 days after completion', addToDispatch: false },
    ],
    closingMessage: 'Thank you for the opportunity to quote this project. We look forward to working with you and delivering exceptional results.',
  },
  electrical: {
    narrativeSections: [
      { title: 'Scope of Work', content: '' },
      { title: 'Permit & Inspection', content: '' },
      { title: 'Inclusions', content: '' },
    ],
    defaultItems: [
      { description: 'Electrical rough-in labour', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Panel, breakers & service', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Wire, conduit & devices', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Fixture installation', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'ESA permit & inspection', category: 'other', unit: 'ls', quantity: 1, rate: 0 },
    ],
    defaultExclusions: [
      'Low voltage work (data, cable, security, audio/video)',
      'Pot light layout or design',
      'Drywall patching after rough-in',
      'Painting or finishing',
      'Temporary power supply',
      'Work beyond defined scope',
    ],
    defaultPayment: [
      { label: 'Deposit on signing', percent: 25, trigger: 'Contract signed', addToDispatch: false },
      { label: 'Rough-in complete', percent: 50, trigger: 'ESA rough inspection passed', addToDispatch: true },
      { label: 'Final completion', percent: 25, trigger: 'ESA final inspection passed', addToDispatch: true },
    ],
    closingMessage: 'All electrical work performed to Ontario Electrical Safety Code. ESA permit and inspections included as specified.',
  },
  plumbing: {
    narrativeSections: [
      { title: 'Scope of Work', content: '' },
      { title: 'Permit & Inspection', content: '' },
      { title: 'Inclusions', content: '' },
    ],
    defaultItems: [
      { description: 'Plumbing rough-in labour', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Pipe, fittings & materials', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Fixture installation', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Building permit & inspection', category: 'other', unit: 'ls', quantity: 1, rate: 0 },
    ],
    defaultExclusions: [
      'Tile work or flooring',
      'Vanity, toilet or fixture supply (unless specified)',
      'Drywall repair or patching',
      'Painting or finishing',
      'Excavation or drain replacement',
      'Work beyond defined scope',
    ],
    defaultPayment: [
      { label: 'Deposit on signing', percent: 25, trigger: 'Contract signed', addToDispatch: false },
      { label: 'Rough-in complete', percent: 50, trigger: 'Rough-in inspection passed', addToDispatch: true },
      { label: 'Final completion', percent: 25, trigger: 'Final inspection passed', addToDispatch: true },
    ],
    closingMessage: 'All plumbing work performed to Ontario Plumbing Code. Permit and inspections included as specified.',
  },
  hvac: {
    narrativeSections: [
      { title: 'Scope of Work', content: '' },
      { title: 'Equipment Specifications', content: '' },
      { title: 'Permit & Inspection', content: '' },
      { title: 'Inclusions', content: '' },
    ],
    defaultItems: [
      { description: 'Equipment supply', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Installation labour', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Ductwork modifications', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Gas line connection', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'TSSA permit & inspection', category: 'other', unit: 'ls', quantity: 1, rate: 0 },
    ],
    defaultExclusions: [
      'Electrical connections unless specifically included',
      'Ductwork beyond defined scope',
      'Asbestos or hazardous material abatement',
      'Structural modifications',
      'Cosmetic repairs or patching',
      'Extended warranty beyond manufacturer standard',
    ],
    defaultPayment: [
      { label: 'Deposit on signing', percent: 30, trigger: 'Contract signed', addToDispatch: false },
      { label: 'Equipment delivery', percent: 40, trigger: 'Equipment on site', addToDispatch: true },
      { label: 'Final completion', percent: 30, trigger: 'TSSA inspection passed', addToDispatch: true },
    ],
    closingMessage: 'All HVAC work performed to TSSA and Ontario standards. Equipment manufacturer warranty provided.',
  },
  painting: {
    narrativeSections: [
      { title: 'Scope of Work', content: '' },
      { title: 'Paint Specifications', content: '' },
      { title: 'Surface Preparation', content: '' },
      { title: 'Inclusions', content: '' },
    ],
    defaultItems: [
      { description: 'Surface preparation & priming', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Paint & materials', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Application — walls & ceilings', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Trim, doors & windows', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Protection, masking & cleanup', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
    ],
    defaultExclusions: [
      'Furniture moving or storage',
      'Minor drywall repairs unless quoted separately',
      'Window cleaning',
      'Exterior work unless specifically included',
      'Wallpaper removal',
      'Work beyond defined scope',
    ],
    defaultPayment: [
      { label: 'Deposit on signing', percent: 25, trigger: 'Contract signed', addToDispatch: false },
      { label: 'Work complete', percent: 75, trigger: 'Final walkthrough approved', addToDispatch: true },
    ],
    closingMessage: 'All surfaces prepared to professional standard. Workmanship warranty provided. Paint specifications available on request.',
  },
  masonry: {
    narrativeSections: [
      { title: 'Scope of Work', content: '' },
      { title: 'Materials & Mix Specifications', content: '' },
      { title: 'Timeline', content: '' },
      { title: 'Inclusions', content: '' },
    ],
    defaultItems: [
      { description: 'Masonry materials & supply', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Installation labour', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Scaffolding & equipment', category: 'other', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Cleanup & disposal', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
    ],
    defaultExclusions: [
      'Waterproofing or parging unless specified',
      'Structural engineering',
      'Excavation or grading',
      'Landscaping restoration',
      'Work in freeze conditions without enclosure',
      'Work beyond defined scope',
    ],
    defaultPayment: [
      { label: 'Deposit on signing', percent: 30, trigger: 'Contract signed', addToDispatch: false },
      { label: 'Materials delivered', percent: 30, trigger: 'Materials on site', addToDispatch: true },
      { label: 'Final completion', percent: 40, trigger: 'Work complete & inspected', addToDispatch: true },
    ],
    closingMessage: 'All masonry work completed to industry standards using quality materials. Workmanship warranty provided.',
  },
  framing: {
    narrativeSections: [
      { title: 'Scope of Work', content: '' },
      { title: 'Lumber & Structural Notes', content: '' },
      { title: 'Inclusions', content: '' },
    ],
    defaultItems: [
      { description: 'Lumber & engineered wood supply', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Framing labour', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Hardware, fasteners & connectors', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Equipment & crane', category: 'other', unit: 'ls', quantity: 1, rate: 0 },
    ],
    defaultExclusions: [
      'Engineering drawings unless specified',
      'Concrete or foundation work',
      'Roofing or sheathing unless specified',
      'Windows or doors unless specified',
      'Insulation or vapour barrier',
      'Work beyond defined scope',
    ],
    defaultPayment: [
      { label: 'Deposit on signing', percent: 25, trigger: 'Contract signed', addToDispatch: false },
      { label: 'Lumber delivery', percent: 35, trigger: 'Lumber on site', addToDispatch: true },
      { label: 'Frame complete', percent: 40, trigger: 'Framing inspection passed', addToDispatch: true },
    ],
    closingMessage: 'All framing to Ontario Building Code. Engineer-stamped drawings available on request.',
  },
  roofing: {
    narrativeSections: [
      { title: 'Scope of Work', content: '' },
      { title: 'Roofing System & Materials', content: '' },
      { title: 'Warranty', content: '' },
      { title: 'Inclusions', content: '' },
    ],
    defaultItems: [
      { description: 'Tear-off & disposal', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Decking inspection & repair', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Underlayment & ice & water shield', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Roofing material supply', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Flashing, venting & drip edge', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Installation labour', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
    ],
    defaultExclusions: [
      'Structural decking replacement beyond 10% of total area',
      'Fascia, soffit or eavestrough unless specified',
      'Interior damage from existing leaks',
      'Skylight installation or replacement unless specified',
      'Solar panel removal or reinstallation',
      'Work beyond defined scope',
    ],
    defaultPayment: [
      { label: 'Deposit on signing', percent: 30, trigger: 'Contract signed', addToDispatch: false },
      { label: 'Final completion', percent: 70, trigger: 'Work complete & site cleaned', addToDispatch: true },
    ],
    closingMessage: 'Manufacturer product warranty provided. Workmanship warranty included. All debris removed from site.',
  },
  other: {
    narrativeSections: [
      { title: 'Scope of Work', content: '' },
      { title: 'Inclusions', content: '' },
    ],
    defaultItems: [
      { description: 'Labour', category: 'labour', unit: 'ls', quantity: 1, rate: 0 },
      { description: 'Materials', category: 'material', unit: 'ls', quantity: 1, rate: 0 },
    ],
    defaultExclusions: [
      'Work beyond the defined scope',
      'Permits unless specifically stated',
      'Damage discovered after work begins',
    ],
    defaultPayment: [
      { label: 'Deposit on signing', percent: 25, trigger: 'Contract signed', addToDispatch: false },
      { label: 'Final completion', percent: 75, trigger: 'Work complete', addToDispatch: true },
    ],
    closingMessage: 'Thank you for the opportunity. We look forward to working with you.',
  },
};

const TRADE_LIST = [
  { id: 'renovation', label: 'Renovation'  },
  { id: 'electrical', label: 'Electrical'  },
  { id: 'plumbing',   label: 'Plumbing'    },
  { id: 'hvac',       label: 'HVAC'        },
  { id: 'painting',   label: 'Painting'    },
  { id: 'masonry',    label: 'Masonry'     },
  { id: 'framing',    label: 'Framing'     },
  { id: 'roofing',    label: 'Roofing'     },
  { id: 'other',      label: 'Other'       },
];

function uid() { return Math.random().toString(36).slice(2); }

export default function QuoteBuilderPage() {
  const navigate          = useNavigate();
  const [params]          = useSearchParams();
  const { session }       = useAuth();
  const docType           = (params.get('type') ?? 'estimate') as 'estimate' | 'proposal' | 'bid';

  const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

  const [clients, setClients]                     = useState<Client[]>([]);
  const [clientId, setClientId]                   = useState('');
  const [trade, setTrade]                         = useState('renovation');
  const [title, setTitle]                         = useState('');
  const [description, setDescription]             = useState('');
  const [lineItems, setLineItems]                 = useState<LineItem[]>([]);
  const [narrativeSections, setNarrativeSections] = useState<NarrativeSection[]>([]);
  const [exclusions, setExclusions]               = useState<string[]>([]);
  const [showMaterials, setShowMaterials]         = useState(true);
  const [showLabour, setShowLabour]               = useState(true);
  const [taxRate, setTaxRate]                     = useState(13);
  const [validDays, setValidDays]                 = useState(30);
  const [paymentSchedule, setPaymentSchedule]     = useState<PaymentRow[]>([]);
  const [closingMessage, setClosingMessage]       = useState('');
  const [saving, setSaving]                       = useState(false);
  const [activeSection, setActiveSection]         = useState<'details' | 'items' | 'payment' | 'preview'>('details');

  useEffect(() => { fetchClients(); }, []);

  useEffect(() => {
    const tmpl = TRADE_TEMPLATES[trade] ?? TRADE_TEMPLATES['other'];
    setLineItems(tmpl.defaultItems.map(item => ({
      id: uid(),
      description: item.description ?? '',
      quantity: item.quantity ?? 1,
      unit: item.unit ?? 'ls',
      rate: item.rate ?? 0,
      amount: (item.quantity ?? 1) * (item.rate ?? 0),
      category: item.category ?? 'other',
    })));
    setNarrativeSections(tmpl.narrativeSections.map(s => ({ ...s })));
    setExclusions([...tmpl.defaultExclusions]);
    setPaymentSchedule(tmpl.defaultPayment.map(p => ({ ...p })));
    setClosingMessage(tmpl.closingMessage);
  }, [trade]);

  async function fetchClients() {
    const { data } = await supabase
      .from('clients')
      .select('id, first_name, last_name, email')
      .eq('company_id', COMPANY_ID);
    if (data) setClients(data as Client[]);
  }

  function updateItem(id: string, field: keyof LineItem, val: string | number) {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: val };
      updated.amount = Number(updated.quantity) * Number(updated.rate);
      return updated;
    }));
  }

  function addItem() {
    setLineItems(prev => [...prev, {
      id: uid(), description: '', quantity: 1,
      unit: 'ls', rate: 0, amount: 0, category: 'labour',
    }]);
  }

  function removeItem(id: string) { setLineItems(prev => prev.filter(i => i.id !== id)); }

  function updateNarrative(idx: number, content: string) {
    setNarrativeSections(prev => prev.map((s, i) => i === idx ? { ...s, content } : s));
  }

  function addExclusion() { setExclusions(prev => [...prev, '']); }
  function updateExclusion(idx: number, val: string) { setExclusions(prev => prev.map((e, i) => i === idx ? val : e)); }
  function removeExclusion(idx: number) { setExclusions(prev => prev.filter((_, i) => i !== idx)); }

  /* Totals */
  const subtotal      = lineItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount     = subtotal * (taxRate / 100);
  const total         = subtotal + taxAmount;
  const labourTotal   = lineItems.filter(i => i.category === 'labour').reduce((s, i) => s + i.amount, 0);
  const materialTotal = lineItems.filter(i => i.category === 'material').reduce((s, i) => s + i.amount, 0);
  const percentTotal  = paymentSchedule.reduce((s, r) => s + r.percent, 0);

  /* Visible items for client preview */
  const visibleItems = (() => {
    if (showMaterials && showLabour) return lineItems;
    const hidden = lineItems.filter(i =>
      (!showMaterials && i.category === 'material') ||
      (!showLabour && i.category === 'labour')
    );
    const visible = lineItems.filter(i => {
      if (!showMaterials && i.category === 'material') return false;
      if (!showLabour && i.category === 'labour') return false;
      return true;
    });
    const hiddenTotal = hidden.reduce((s, i) => s + i.amount, 0);
    if (hiddenTotal > 0) {
      return [...visible, {
        id: 'rolled-up', description: 'Project Scope', quantity: 1,
        unit: 'ls', rate: hiddenTotal, amount: hiddenTotal, category: 'other' as const,
      }];
    }
    return visible;
  })();

  async function handleSave(sendNow = false) {
    if (!title.trim()) { alert('Document title is required'); return; }
    if (percentTotal !== 100) { alert('Payment schedule must total 100%'); return; }
    setSaving(true);
    const quoteNum   = `Q-${Date.now().toString().slice(-6)}`;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    const { error } = await supabase.from('quotes').insert({
      company_id:          COMPANY_ID,
      client_id:           clientId || null,
      quote_number:        quoteNum,
      type:                docType,
      status:              sendNow ? 'sent' : 'draft',
      trade,
      title:               title.trim(),
      description:         description.trim() || null,
      line_items:          lineItems,
      show_materials:      showMaterials,
      show_labour:         showLabour,
      subtotal,
      tax_rate:            taxRate,
      tax_amount:          taxAmount,
      total,
      allowances:          exclusions.filter(Boolean).map(e => ({ text: e })),
      payment_schedule:    paymentSchedule,
      closing_message:     closingMessage,
      valid_until:         validUntil.toISOString().split('T')[0],
      notes:               JSON.stringify({ narrativeSections }),
    });

    setSaving(false);
    if (!error) navigate('/forge/quotes');
    else alert(error.message);
  }

  const TYPE_LABEL: Record<string, string> = { estimate: 'Estimate', proposal: 'Proposal', bid: 'Bid' };
  const isProposal = docType === 'proposal' || docType === 'bid';

  const inp: React.CSSProperties = {
    height: 36, padding: '0 10px', borderRadius: 7,
    border: '1px solid var(--color-border)',
    background: 'var(--color-panel-raised)',
    color: 'var(--color-text)', fontSize: 12,
    fontFamily: 'var(--font-body)', outline: 'none',
    transition: 'all 0.15s',
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

  const STEPS = [
    { id: 'details', label: '1. Details'       },
    { id: 'items',   label: isProposal ? '2. Scope & Items' : '2. Line Items' },
    { id: 'payment', label: '3. Payment'        },
    { id: 'preview', label: '4. Preview'        },
  ] as const;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>

      {/* ── LEFT — Builder ── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px', borderRight: '1px solid var(--color-border)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => navigate('/forge/quotes')} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, fontFamily: 'var(--font-body)' }}>
            <ChevronLeft size={15} /> Back
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--color-border)' }} />
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>New {TYPE_LABEL[docType]}</h1>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, background: 'rgba(252,226,5,0.12)', color: '#8A7600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isProposal ? 'Proposal Mode' : 'Estimate Mode'}
          </span>
        </div>

        {/* Step nav */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {STEPS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '6px 14px', borderRadius: 7, fontSize: 11,
                fontWeight: activeSection === s.id ? 700 : 400,
                background: activeSection === s.id ? 'rgba(252,226,5,0.12)' : 'transparent',
                border: activeSection === s.id ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)',
                color: activeSection === s.id ? '#8A7600' : 'var(--color-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.12s',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ── STEP 1: Details ── */}
        {activeSection === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Trade</label>
                <select style={{ ...inp, width: '100%' }} value={trade} onChange={e => setTrade(e.target.value)} onFocus={focus} onBlur={blur}>
                  {TRADE_LIST.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Client</label>
                <div style={{ position: 'relative' }}>
                  <User size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                  <select style={{ ...inp, width: '100%', paddingLeft: 28 }} value={clientId} onChange={e => setClientId(e.target.value)} onFocus={focus} onBlur={blur}>
                    <option value="">Select client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label style={lbl}>Document Title *</label>
              <input style={{ ...inp, width: '100%' }} placeholder={`e.g. Henderson Kitchen ${TYPE_LABEL[docType]}`} value={title} onChange={e => setTitle(e.target.value)} onFocus={focus} onBlur={blur} autoFocus />
            </div>

            <div>
              <label style={lbl}>{isProposal ? 'Executive Summary' : 'Description'}</label>
              <textarea style={{ ...inp, width: '100%', height: isProposal ? 120 : 80, padding: '10px', resize: 'none', lineHeight: 1.6 }}
                placeholder={isProposal
                  ? 'Brief overview of the project, your understanding of the scope, and your approach...'
                  : 'Brief description of the work to be performed...'}
                value={description}
                onChange={e => setDescription(e.target.value)}
                onFocus={focus} onBlur={blur}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Tax Rate (%)</label>
                <input style={{ ...inp, width: '100%', fontFamily: 'var(--font-mono)' }} type="number" min="0" max="20" step="0.5" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} onFocus={focus} onBlur={blur} />
              </div>
              <div>
                <label style={lbl}>Valid For (days)</label>
                <input style={{ ...inp, width: '100%', fontFamily: 'var(--font-mono)' }} type="number" min="7" max="90" value={validDays} onChange={e => setValidDays(Number(e.target.value))} onFocus={focus} onBlur={blur} />
              </div>
            </div>

            {!isProposal && (
              <div style={{ padding: '14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>Client-facing breakdown</p>
                <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 10 }}>
                  Hidden categories are rolled into "Project Scope" on the client copy. You always see the full breakdown.
                </p>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { key: 'materials', label: 'Show materials', val: showMaterials, set: setShowMaterials },
                    { key: 'labour',    label: 'Show labour',    val: showLabour,    set: setShowLabour    },
                  ].map(opt => (
                    <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12 }}>
                      <div onClick={() => opt.set(!opt.val)} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${opt.val ? '#FCE205' : 'var(--color-border)'}`, background: opt.val ? '#FCE205' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0 }}>
                        {opt.val && <Check size={10} color="#111010" strokeWidth={3} />}
                      </div>
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setActiveSection('items')} className="forge-button forge-button--primary" style={{ alignSelf: 'flex-start', gap: 6 }}>
              Next: {isProposal ? 'Scope & Items' : 'Line Items'} →
            </button>
          </div>
        )}

        {/* ── STEP 2: Items (+ Narrative for proposals) ── */}
        {activeSection === 'items' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* PROPOSAL: Narrative sections */}
            {isProposal && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>Proposal Narrative</p>
                {narrativeSections.map((section, idx) => (
                  <div key={idx}>
                    <label style={lbl}>{section.title}</label>
                    <textarea
                      style={{ ...inp, width: '100%', height: 90, padding: '10px', resize: 'vertical', lineHeight: 1.6 }}
                      placeholder={`Describe ${section.title.toLowerCase()}...`}
                      value={section.content}
                      onChange={e => updateNarrative(idx, e.target.value)}
                      onFocus={focus} onBlur={blur}
                    />
                  </div>
                ))}
                <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />
              </div>
            )}

            {/* Line items */}
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>Pricing</p>
            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>Trade template pre-filled — edit rates and add items as needed.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 56px 60px 84px 84px 28px', gap: 5, padding: '0 2px' }}>
              {['', 'Description', 'Category', 'Qty', 'Unit', 'Rate', 'Amount', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)' }}>{h}</span>
              ))}
            </div>

            {lineItems.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px 56px 60px 84px 84px 28px', gap: 5, alignItems: 'center' }}>
                <GripVertical size={12} color="var(--color-muted)" style={{ cursor: 'grab' }} />
                <input style={{ ...inp, width: '100%' }} placeholder="Description..." value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} onFocus={focus} onBlur={blur} />
                <select style={{ ...inp, width: '100%', fontSize: 11 }} value={item.category} onChange={e => updateItem(item.id, 'category', e.target.value)} onFocus={focus} onBlur={blur}>
                  <option value="labour">Labour</option>
                  <option value="material">Material</option>
                  <option value="allowance">Allowance</option>
                  <option value="other">Other</option>
                </select>
                <input style={{ ...inp, width: '100%', fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))} onFocus={focus} onBlur={blur} />
                <select style={{ ...inp, width: '100%' }} value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} onFocus={focus} onBlur={blur}>
                  {['ls', 'hr', 'sqft', 'lf', 'ea', 'day', 'week'].map(u => <option key={u}>{u}</option>)}
                </select>
                <input style={{ ...inp, width: '100%', fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01" value={item.rate} onChange={e => updateItem(item.id, 'rate', Number(e.target.value))} onFocus={focus} onBlur={blur} />
                <div style={{ height: 36, borderRadius: 7, background: 'var(--color-mist)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
                  ${item.amount.toLocaleString()}
                </div>
                <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <Trash2 size={12} color="var(--color-muted)" />
                </button>
              </div>
            ))}

            <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, background: 'transparent', border: '1px dashed var(--color-border)', color: 'var(--color-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.12s', width: 'fit-content' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.color = '#8A7600'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-muted)'; }}>
              <Plus size={11} /> Add line item
            </button>

            {/* Exclusions */}
            <div style={{ marginTop: 8, padding: '16px', borderRadius: 8, background: 'rgba(220,38,38,0.03)', border: '1px solid rgba(220,38,38,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <AlertCircle size={13} color="#DC2626" strokeWidth={1.5} />
                <p style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>Exclusions</p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>— Auto-populated for {TRADE_LIST.find(t => t.id === trade)?.label}. These appear bolded on the document.</p>
              </div>
              {exclusions.map((exc, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <input
                    style={{ ...inp, flex: 1 }}
                    value={exc}
                    onChange={e => updateExclusion(idx, e.target.value)}
                    onFocus={focus} onBlur={blur}
                    placeholder="Exclusion item..."
                  />
                  <button onClick={() => removeExclusion(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={12} color="var(--color-muted)" />
                  </button>
                </div>
              ))}
              <button onClick={addExclusion} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', padding: '4px 0' }}>
                <Plus size={11} /> Add exclusion
              </button>
            </div>

            {/* Closing message */}
            <div>
              <label style={lbl}>Closing Message</label>
              <textarea style={{ ...inp, width: '100%', height: 70, padding: '10px', resize: 'none', lineHeight: 1.6 }} value={closingMessage} onChange={e => setClosingMessage(e.target.value)} onFocus={focus} onBlur={blur} />
            </div>

            <button onClick={() => setActiveSection('payment')} className="forge-button forge-button--primary" style={{ alignSelf: 'flex-start', gap: 6 }}>
              Next: Payment Schedule →
            </button>
          </div>
        )}

        {/* ── STEP 3: Payment ── */}
        {activeSection === 'payment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              Payment milestones auto-filled for {TRADE_LIST.find(t => t.id === trade)?.label}. Check "Add to Dispatch" to create a task when this milestone is reached.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 1fr 110px 28px', gap: 8, padding: '0 2px' }}>
              {['Milestone', '%', 'Trigger / Condition', 'Add to Dispatch', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)' }}>{h}</span>
              ))}
            </div>

            {paymentSchedule.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 1fr 110px 28px', gap: 8, alignItems: 'center' }}>
                <input style={{ ...inp, width: '100%' }} value={row.label} onChange={e => setPaymentSchedule(prev => prev.map((r, idx) => idx === i ? { ...r, label: e.target.value } : r))} onFocus={focus} onBlur={blur} />
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inp, width: '100%', fontFamily: 'var(--font-mono)', paddingRight: 18 }} type="number" min="0" max="100" value={row.percent} onChange={e => setPaymentSchedule(prev => prev.map((r, idx) => idx === i ? { ...r, percent: Number(e.target.value) } : r))} onFocus={focus} onBlur={blur} />
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-muted)', pointerEvents: 'none' }}>%</span>
                </div>
                <input style={{ ...inp, width: '100%' }} value={row.trigger} onChange={e => setPaymentSchedule(prev => prev.map((r, idx) => idx === i ? { ...r, trigger: e.target.value } : r))} onFocus={focus} onBlur={blur} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
                  <div onClick={() => setPaymentSchedule(prev => prev.map((r, idx) => idx === i ? { ...r, addToDispatch: !r.addToDispatch } : r))}
                    style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${row.addToDispatch ? '#FCE205' : 'var(--color-border)'}`, background: row.addToDispatch ? '#FCE205' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0 }}>
                    {row.addToDispatch && <Check size={9} color="#111010" strokeWidth={3} />}
                  </div>
                  Add task
                </label>
                <button onClick={() => setPaymentSchedule(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <Trash2 size={12} color="var(--color-muted)" />
                </button>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setPaymentSchedule(prev => [...prev, { label: '', percent: 0, trigger: '', addToDispatch: false }])}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, background: 'transparent', border: '1px dashed var(--color-border)', color: 'var(--color-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <Plus size={11} /> Add milestone
              </button>
              <span style={{ fontSize: 12, fontWeight: 700, color: percentTotal === 100 ? '#16A34A' : '#DC2626' }}>
                {percentTotal}% {percentTotal !== 100 && '— must equal 100%'}
                {percentTotal === 100 && '✓'}
              </span>
            </div>

            <button onClick={() => setActiveSection('preview')} className="forge-button forge-button--primary" style={{ alignSelf: 'flex-start', gap: 6, marginTop: 8 }}>
              Preview Document →
            </button>
          </div>
        )}

        {/* ── STEP 4: Preview actions ── */}
        {activeSection === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '16px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Document ready</p>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                Review the live preview on the right. Save as draft to continue editing, or send directly to your client.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => handleSave(false)} disabled={saving} className="forge-button forge-button--secondary" style={{ gap: 6 }}>
                  <Save size={13} /> {saving ? 'Saving...' : 'Save as Draft'}
                </button>
                <button onClick={() => handleSave(true)} disabled={saving || percentTotal !== 100} className="forge-button forge-button--primary" style={{ gap: 6 }}>
                  <Send size={13} /> Send to Client
                </button>
              </div>
              {percentTotal !== 100 && (
                <p style={{ fontSize: 11, color: '#DC2626', marginTop: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertCircle size={11} /> Payment schedule must total 100% before sending
                </p>
              )}
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Document type', value: TYPE_LABEL[docType] },
                { label: 'Trade', value: TRADE_LIST.find(t => t.id === trade)?.label ?? trade },
                { label: 'Client', value: clientId ? (clients.find(c => c.id === clientId) ? `${clients.find(c => c.id === clientId)!.first_name} ${clients.find(c => c.id === clientId)!.last_name}` : '—') : 'Not assigned' },
                { label: 'Line items', value: `${lineItems.length} items` },
                { label: 'Exclusions', value: `${exclusions.filter(Boolean).length} items` },
                { label: 'Total', value: `$${total.toFixed(2)}`, mono: true },
                { label: 'Valid for', value: `${validDays} days` },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 7, background: 'var(--color-panel-raised)', border: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{row.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, fontFamily: row.mono ? 'var(--font-mono)' : 'var(--font-body)' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT — Live Preview ── */}
      <div style={{ overflowY: 'auto', background: '#ECEAE5', padding: '20px 16px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.10)', padding: '28px 24px', minHeight: '100%', fontSize: 12 }}>

          {/* Letterhead */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 18, borderBottom: '3px solid #FCE205' }}>
            <div>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: '#FCE205', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <FileText size={20} color="#111010" strokeWidth={1.5} />
              </div>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#111010' }}>Your Company Name</p>
              <p style={{ fontSize: 10, color: '#8C8680' }}>License # · Insurance # · HST #</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#111010', letterSpacing: '0.04em' }}>{TYPE_LABEL[docType].toUpperCase()}</p>
              <p style={{ fontSize: 10, color: '#8C8680', fontFamily: 'monospace' }}>Q-XXXXXX</p>
              <p style={{ fontSize: 10, color: '#8C8680', marginTop: 4 }}>{new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              <p style={{ fontSize: 10, color: '#8C8680' }}>Valid: {new Date(Date.now() + validDays * 86400000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>

          {/* Client */}
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 3 }}>Prepared for</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#111010' }}>
              {clientId ? (clients.find(c => c.id === clientId) ? `${clients.find(c => c.id === clientId)!.first_name} ${clients.find(c => c.id === clientId)!.last_name}` : '—') : 'Client Name'}
            </p>
          </div>

          {/* Title + summary */}
          {title && <p style={{ fontSize: 15, fontWeight: 800, color: '#111010', marginBottom: 6, letterSpacing: '-0.01em' }}>{title}</p>}
          {description && <p style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.7, marginBottom: 16 }}>{description}</p>}

          {/* Proposal narrative sections */}
          {isProposal && narrativeSections.map((section, idx) => section.content ? (
            <div key={idx} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 5 }}>{section.title}</p>
              <p style={{ fontSize: 11, color: '#4A4640', lineHeight: 1.7 }}>{section.content}</p>
            </div>
          ) : null)}

          {/* Line items */}
          {visibleItems.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 8 }}>Scope & Pricing</p>
              {visibleItems.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F0EDE8' }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#111010', fontWeight: 500 }}>{item.description || 'Line item'}</p>
                    {item.amount > 0 && item.quantity !== 1 && (
                      <p style={{ fontSize: 9, color: '#8C8680' }}>{item.quantity} {item.unit} × ${item.rate.toLocaleString()}</p>
                    )}
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, marginLeft: 12 }}>
                    {item.amount > 0 ? `$${item.amount.toLocaleString()}` : 'TBD'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Totals box */}
          <div style={{ padding: '12px 14px', borderRadius: 8, background: '#F8F7F4', marginBottom: 16 }}>
            {showMaterials && materialTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: '#6B7280' }}>Materials</span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#6B7280' }}>${materialTotal.toLocaleString()}</span>
              </div>
            )}
            {showLabour && labourTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: '#6B7280' }}>Labour</span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#6B7280' }}>${labourTotal.toLocaleString()}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #E4E0D8', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#6B7280' }}>Subtotal</span>
              <span style={{ fontSize: 10, fontFamily: 'monospace' }}>${subtotal.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: '#6B7280' }}>HST ({taxRate}%)</span>
              <span style={{ fontSize: 10, fontFamily: 'monospace' }}>${taxAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '2px solid #FCE205' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#111010' }}>Total</span>
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: '#111010' }}>${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Exclusions — bolded on document */}
          {exclusions.filter(Boolean).length > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: '#FFF8F8', border: '1px solid #FECACA' }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#DC2626', marginBottom: 8 }}>Exclusions</p>
              {exclusions.filter(Boolean).map((exc, i) => (
                <p key={i} style={{ fontSize: 10, color: '#4A4640', marginBottom: 4, paddingLeft: 10, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: '#DC2626' }}>·</span>
                  <strong>{exc}</strong>
                </p>
              ))}
            </div>
          )}

          {/* Payment schedule */}
          {paymentSchedule.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 8 }}>Payment Schedule</p>
              {paymentSchedule.map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #F0EDE8' }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#111010' }}>{row.label || `Payment ${i + 1}`}</p>
                    <p style={{ fontSize: 9, color: '#8C8680' }}>{row.trigger}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#111010' }}>${((total * row.percent) / 100).toFixed(2)}</p>
                    <p style={{ fontSize: 9, color: '#8C8680' }}>{row.percent}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Closing */}
          {closingMessage && (
            <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(252,226,5,0.05)', border: '1px solid rgba(252,226,5,0.2)', marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: '#4A4640', lineHeight: 1.7, fontStyle: 'italic' }}>{closingMessage}</p>
            </div>
          )}

          {/* Signature block */}
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #E4E0D8' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 14 }}>Acceptance & Authorization</p>
            <p style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.6, marginBottom: 16 }}>
              By signing below, the client agrees to the scope, pricing, exclusions, and payment schedule outlined in this document.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ height: 44, borderBottom: '1px solid #111010', marginBottom: 5 }} />
                <p style={{ fontSize: 9, color: '#8C8680' }}>Client Signature</p>
              </div>
              <div>
                <div style={{ height: 44, borderBottom: '1px solid #111010', marginBottom: 5 }} />
                <p style={{ fontSize: 9, color: '#8C8680' }}>Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}