import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  X, ChevronRight, ChevronLeft, Check,
  Zap, User, Mail, Send, Save,
  AlertCircle, Search,
} from 'lucide-react';

/* ── Types ── */
interface TradeMatrix {
  id: string;
  trade: string;
  category: string;
  unit: string;
  labour_rate: number;
  allowance_standard: number;
  allowance_premium: number;
  allowance_luxury: number;
  sundries_percent: number;
  markup_multiplier: number;
  notes: string;
}

interface ActivatedTrade {
  trade: string;
  category: string;
  quantity: number;
  unit: string;
  tier: 'standard' | 'premium' | 'luxury';
  includeLabour: boolean;
  includeMaterial: boolean;
  extras: string[];
}

interface OutputLineItem {
  description: string;
  category: 'labour' | 'material' | 'allowance' | 'other';
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  isAllowance: boolean;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

type Step = 'profile' | 'trades' | 'configure' | 'review' | 'client';
type QualityTier = 'standard' | 'premium' | 'luxury';
type DocType = 'estimate' | 'proposal';

/* ── Trade unit profiles ── */
const UNIT_PROFILES: Record<string, { unit: string; label: string; placeholder: string }> = {
  Flooring:       { unit: 'sqft', label: 'sq ft',      placeholder: '2300' },
  Painting:       { unit: 'sqft', label: 'sq ft',      placeholder: '1800' },
  Drywall:        { unit: 'sqft', label: 'sq ft',      placeholder: '3200' },
  Framing:        { unit: 'lf',   label: 'lin ft',     placeholder: '240'  },
  Carpentry:      { unit: 'lf',   label: 'lin ft',     placeholder: '180'  },
  Electrical:     { unit: 'ea',   label: 'drops',      placeholder: '14'   },
  Plumbing:       { unit: 'ea',   label: 'drops',      placeholder: '6'    },
  HVAC:           { unit: 'ea',   label: 'runs / units', placeholder: '8'  },
  Concrete:       { unit: 'cy',   label: 'cubic yards', placeholder: '12'  },
  Masonry:        { unit: 'sqft', label: 'sq ft',      placeholder: '800'  },
  Insulation:     { unit: 'sqft', label: 'sq ft',      placeholder: '2400' },
  Roofing:        { unit: 'sqft', label: 'sq ft',      placeholder: '2400' },
  Siding:         { unit: 'sqft', label: 'sq ft',      placeholder: '1400' },
  Tile:           { unit: 'sqft', label: 'sq ft',      placeholder: '400'  },
  Waterproofing:  { unit: 'lf',   label: 'lin ft',     placeholder: '80'   },
  Demolition:     { unit: 'sqft', label: 'sq ft',      placeholder: '800'  },
  Windows:        { unit: 'ea',   label: 'units',      placeholder: '8'    },
  Landscape:      { unit: 'sqyd', label: 'sq yards',   placeholder: '400'  },
};

/* ── Trade extras (max 3 checkboxes) ── */
const TRADE_EXTRAS: Record<string, string[]> = {
  Flooring:      ['Demo / removal',    'Subfloor leveling',   'Transitions & trim'   ],
  Framing:       ['Engineering stamp', 'LVL beams',           'Shear wall'           ],
  Drywall:       ['Level 5 finish',    'Soundproofing',       'Bulkheads'            ],
  Electrical:    ['Panel upgrade',     'ESA permit',          'Pot lights'           ],
  Plumbing:      ['Building permit',   'Rough-in only',       'Fixture supply'       ],
  HVAC:          ['Gas line',          'Electrical hookup',   'Permit & inspection'  ],
  Painting:      ['Prime coat',        'Ceiling included',    'Trim & doors'         ],
  Carpentry:     ['Crown moulding',    'Custom millwork',     'Door installation'    ],
  Masonry:       ['Scaffolding',       'Waterproofing',       'Tuckpointing'         ],
  Concrete:      ['Rebar',             'Vapour barrier',      'Pump truck'           ],
  Insulation:    ['Vapour barrier',    'Spray foam upgrade',  'Attic baffles'        ],
  Roofing:       ['Tear-off',          'Ice & water shield',  'Drip edge & flashing' ],
  Siding:        ['Housewrap',         'Trim & corners',      'Old siding removal'   ],
  Tile:          ['Waterproofing',     'Heated floor',        'Custom grout'         ],
  Waterproofing: ['Window wells',      'Sump pump',           'Exterior grading'     ],
  Demolition:    ['Bin rental',        'Hazmat check',        'Site protection'      ],
  Windows:       ['Exterior capping',  'Interior trim',       'Disposal'             ],
  Landscape:     ['Topsoil supply',    'Edge restraints',     'Delivery charge'      ],
};

/* ── Trade categories ── */
const TRADE_CATEGORIES = [
  { id: 'renovation',    label: 'Renovation'    },
  { id: 'electrical',    label: 'Electrical'    },
  { id: 'plumbing',      label: 'Plumbing'      },
  { id: 'hvac',          label: 'HVAC'          },
  { id: 'painting',      label: 'Painting'      },
  { id: 'masonry',       label: 'Masonry'       },
  { id: 'framing',       label: 'Framing'       },
  { id: 'roofing',       label: 'Roofing'       },
  { id: 'concrete',      label: 'Concrete'      },
  { id: 'drywall',       label: 'Drywall'       },
  { id: 'tile',          label: 'Tile'          },
  { id: 'siding',        label: 'Siding'        },
  { id: 'windows',       label: 'Windows/Doors' },
  { id: 'waterproofing', label: 'Waterproofing' },
  { id: 'landscape',     label: 'Landscape'     },
  { id: 'demolition',    label: 'Demolition'    },
  { id: 'other',         label: 'Other'         },
];

/* ── Project types per trade ── */
const PROJECT_TYPES_BY_TRADE: Record<string, string[]> = {
  renovation:    ['Kitchen Renovation','Bathroom Renovation','Basement Finish','Full Renovation','Addition','New Build','Commercial Renovation','Condo Renovation'],
  electrical:    ['Rough-In — New Build','Rough-In — Renovation','Fixture Installation','Panel Upgrade','EV Charger','Generator','Service Call','Commercial'],
  plumbing:      ['Rough-In — New Build','Rough-In — Renovation','Fixture Installation','Bathroom Rough-In','Drain & Sewer','Water Heater','Service Call','Commercial'],
  hvac:          ['Furnace Installation','Air Conditioning','Heat Pump','Ductwork','Gas Line','HRV & Ventilation','Service Call','Commercial HVAC'],
  painting:      ['Interior Painting','Exterior Painting','Commercial Building','Apartment Block','Cabinet Refinishing','Epoxy Flooring','Service Call'],
  masonry:       ['Brick Repair','Stone Work','Tuckpointing','Chimney','Retaining Wall','Interlock','Foundation Parging','Commercial'],
  framing:       ['New Build','Addition','Garage','Deck & Pergola','Basement','Commercial'],
  roofing:       ['Asphalt Shingles','Flat Roof','Metal Roof','Repair / Patch','Commercial'],
  concrete:      ['Driveway','Flatwork / Slab','Foundation','Steps & Walkway','Retaining Wall','Commercial'],
  drywall:       ['New Build','Renovation','Patch & Repair','Ceiling','Commercial'],
  tile:          ['Floor Tile','Shower Tile','Backsplash','Commercial'],
  siding:        ['Vinyl Siding','Hardie Board','Stucco / EIFS','Repair'],
  windows:       ['Supply & Install','Install Only','Commercial'],
  waterproofing: ['Interior Drain Tile','Exterior Membrane','Crack Injection'],
  landscape:     ['Sod Supply & Install','Interlock / Paving','Grading & Topsoil','Irrigation System','Cleanup & Disposal'],
  demolition:    ['Selective Demo','Full Gut','Disposal Only'],
  other:         ['Service Call','Consultation','Inspection','Other'],
};

/* ── Trade tiles for step 2 ── */
const TRADE_TILES = [
  { trade: 'Flooring',      color: '#8B5E3C' },
  { trade: 'Framing',       color: '#5C6BC0' },
  { trade: 'Drywall',       color: '#78909C' },
  { trade: 'Electrical',    color: '#F9A825' },
  { trade: 'Plumbing',      color: '#1E88E5' },
  { trade: 'HVAC',          color: '#00897B' },
  { trade: 'Painting',      color: '#E53935' },
  { trade: 'Carpentry',     color: '#6D4C41' },
  { trade: 'Masonry',       color: '#546E7A' },
  { trade: 'Concrete',      color: '#757575' },
  { trade: 'Insulation',    color: '#F57C00' },
  { trade: 'Roofing',       color: '#37474F' },
  { trade: 'Siding',        color: '#558B2F' },
  { trade: 'Tile',          color: '#6A1B9A' },
  { trade: 'Waterproofing', color: '#0277BD' },
  { trade: 'Demolition',    color: '#B71C1C' },
  { trade: 'Windows',       color: '#00838F' },
  { trade: 'Landscape',     color: '#2E7D32' },
];

/* ── Preloads: which tiles to pre-check per trade+project ── */
const PRELOADS: Record<string, Record<string, string[]>> = {
  renovation: {
    'Kitchen Renovation':    ['Flooring','Electrical','Plumbing','Painting','Carpentry','Drywall','Tile'],
    'Bathroom Renovation':   ['Flooring','Plumbing','Electrical','Painting','Carpentry','Tile','Waterproofing'],
    'Basement Finish':       ['Framing','Drywall','Electrical','Plumbing','Flooring','Painting','Insulation'],
    'Full Renovation':       ['Framing','Drywall','Electrical','Plumbing','HVAC','Flooring','Painting','Carpentry','Insulation','Tile'],
    'Addition':              ['Framing','Drywall','Electrical','Plumbing','HVAC','Flooring','Painting','Insulation','Roofing','Siding'],
    'New Build':             ['Framing','Drywall','Electrical','Plumbing','HVAC','Flooring','Painting','Carpentry','Insulation','Concrete','Roofing','Siding','Windows'],
    'Commercial Renovation': ['Framing','Drywall','Electrical','Plumbing','HVAC','Flooring','Painting'],
    'Condo Renovation':      ['Flooring','Electrical','Plumbing','Painting','Carpentry','Drywall','Tile'],
  },
  electrical:    { _default: ['Electrical'] },
  plumbing:      { _default: ['Plumbing']   },
  hvac:          { _default: ['HVAC']       },
  painting:      { _default: ['Painting']   },
  masonry:       { _default: ['Masonry']    },
  framing:       { _default: ['Framing']    },
  roofing:       { _default: ['Roofing']    },
  concrete:      { _default: ['Concrete']   },
  drywall:       { _default: ['Drywall']    },
  tile:          { _default: ['Tile']       },
  siding:        { _default: ['Siding']     },
  windows:       { _default: ['Windows']    },
  waterproofing: { _default: ['Waterproofing'] },
  landscape:     { _default: ['Landscape']  },
  demolition:    { _default: ['Demolition'] },
  other:         { _default: []             },
};

const TIER_CONFIG = {
  standard: { label: 'Standard', sub: 'Builder grade',      color: '#6B7280' },
  premium:  { label: 'Premium',  sub: 'Mid-range finishes',  color: '#1E5FA4' },
  luxury:   { label: 'Luxury',   sub: 'High-end finishes',   color: '#8A7600' },
};

/* ── Math ── */
function calculateLineItems(act: ActivatedTrade, matrix: TradeMatrix[]): OutputLineItem[] {
  const row = matrix.find(m => m.trade === act.trade && m.category === act.category)
    ?? matrix.find(m => m.trade === act.trade);
  if (!row) return [];
  const markup   = row.markup_multiplier;
  const allowance = act.tier === 'luxury'
    ? (row.allowance_luxury ?? row.allowance_premium)
    : act.tier === 'premium' ? row.allowance_premium : row.allowance_standard;
  const items: OutputLineItem[] = [];
  if (act.includeLabour) {
    const rate = row.labour_rate * markup;
    items.push({ description: `${act.category} — Labour`, category: 'labour', quantity: act.quantity, unit: act.unit, rate: Math.round(rate * 100) / 100, amount: Math.round(act.quantity * rate * 100) / 100, isAllowance: false });
  }
  if (act.includeMaterial && allowance > 0) {
    const rate = allowance * markup;
    const mat  = act.quantity * rate;
    const sun  = mat * row.sundries_percent;
    items.push({ description: `${act.category} — Materials Allowance (${TIER_CONFIG[act.tier].label})`, category: 'allowance', quantity: act.quantity, unit: act.unit, rate: Math.round(rate * 100) / 100, amount: Math.round((mat + sun) * 100) / 100, isAllowance: true });
  }
  /* Extras as lump-sum adders */
  if (act.extras.length > 0) {
    items.push({ description: `Extras: ${act.extras.join(', ')}`, category: 'other', quantity: 1, unit: 'ls', rate: 0, amount: 0, isAllowance: false });
  }
  return items;
}

function uid() { return Math.random().toString(36).slice(2); }

/* ── Component ── */
export default function QuickCreate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate   = useNavigate();
  const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
  const [matrix, setMatrix]   = useState<TradeMatrix[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [step, setStep]       = useState<Step>('profile');

  /* Step 1 */
  const [tradeCat, setTradeCat]       = useState('renovation');
  const [projectType, setProjectType] = useState('');
  const [typeSearch, setTypeSearch]   = useState('');
  const [typeOpen, setTypeOpen]       = useState(false);
  const [quantity, setQuantity]       = useState('');
  const [tier, setTier]               = useState<QualityTier>('standard');
  const typeRef = useRef<HTMLDivElement>(null);

  /* Step 2 */
  const [activeTrades, setActiveTrades] = useState<Set<string>>(new Set());

  /* Step 3 */
  const [configured, setConfigured] = useState<ActivatedTrade[]>([]);
  const [configIdx, setConfigIdx]   = useState(0);

  /* Step 4 */
  const [lineItems, setLineItems] = useState<OutputLineItem[]>([]);
  const [docType, setDocType]     = useState<DocType>('estimate');

  /* Step 5 */
  const [clientId, setClientId]       = useState('');
  const [clientName, setClientName]   = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);

  useEffect(() => { if (open) { fetchData(); reset(); } }, [open]);
  useEffect(() => { setProjectType(''); setTypeSearch(''); setQuantity(''); }, [tradeCat]);
  useEffect(() => {
    function h(e: MouseEvent) { if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function fetchData() {
    const [m, c] = await Promise.all([
      supabase.from('trade_matrix').select('*').order('sort_order'),
      supabase.from('clients').select('id,first_name,last_name,email').eq('company_id', COMPANY_ID),
    ]);
    if (m.data) setMatrix(m.data as TradeMatrix[]);
    if (c.data) setClients(c.data as Client[]);
  }

  function reset() {
    setStep('profile'); setTradeCat('renovation'); setProjectType('');
    setTypeSearch(''); setQuantity(''); setTier('standard');
    setActiveTrades(new Set()); setConfigured([]); setConfigIdx(0);
    setLineItems([]); setDocType('estimate');
    setClientId(''); setClientName(''); setClientEmail('');
    setSaved(false);
  }

  /* Derived */
  const unitProfile = UNIT_PROFILES[TRADE_CATEGORIES.find(t => t.id === tradeCat)?.label ?? ''] ?? { unit: 'sqft', label: 'sq ft', placeholder: '0' };
  const typeOptions  = (PROJECT_TYPES_BY_TRADE[tradeCat] ?? []).filter(t => t.toLowerCase().includes(typeSearch.toLowerCase()));

  function selectType(t: string) { setProjectType(t); setTypeSearch(t); setTypeOpen(false); }

  function goToTrades() {
    if (!quantity || Number(quantity) <= 0) return;
    const preloadMap = PRELOADS[tradeCat] ?? {};
    const preloaded  = preloadMap[projectType] ?? preloadMap['_default'] ?? [];
    setActiveTrades(new Set(preloaded));
    setStep('trades');
  }

  function goToConfigure() {
    if (activeTrades.size === 0) return;
    const configs: ActivatedTrade[] = Array.from(activeTrades).map(trade => {
      const up = UNIT_PROFILES[trade] ?? { unit: 'sqft', label: 'sq ft', placeholder: '0' };
      const firstRow = matrix.find(m => m.trade === trade);
      return { trade, category: firstRow?.category ?? '', quantity: Number(quantity), unit: up.unit, tier, includeLabour: true, includeMaterial: true, extras: [] };
    });
    setConfigured(configs); setConfigIdx(0); setStep('configure');
  }

  function goToReview() {
    const items: OutputLineItem[] = [];
    for (const act of configured) items.push(...calculateLineItems(act, matrix));
    setLineItems(items); setStep('review');
  }

  function updateConfig(idx: number, patch: Partial<ActivatedTrade>) {
    setConfigured(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }

  function toggleExtra(idx: number, extra: string) {
    const current = configured[idx].extras;
    updateConfig(idx, { extras: current.includes(extra) ? current.filter(e => e !== extra) : [...current, extra] });
  }

  function toggleTrade(trade: string) {
    setActiveTrades(prev => { const n = new Set(prev); n.has(trade) ? n.delete(trade) : n.add(trade); return n; });
  }

  function categoriesFor(trade: string) { return matrix.filter(m => m.trade === trade); }

  const subtotal       = lineItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount      = subtotal * 0.13;
  const total          = subtotal + taxAmount;
  const allowanceTotal = lineItems.filter(i => i.isAllowance).reduce((s, i) => s + i.amount, 0);

  async function handleSave(send = false) {
    setSaving(true);
    const validDate = new Date(); validDate.setDate(validDate.getDate() + 30);
    await supabase.from('quotes').insert({
      company_id: COMPANY_ID, client_id: clientId || null,
      quote_number: `QC-${Date.now().toString().slice(-6)}`,
      type: docType, status: send ? 'sent' : 'draft', trade: tradeCat,
      title: projectType || TRADE_CATEGORIES.find(t => t.id === tradeCat)?.label,
      description: `${quantity} ${unitProfile.label} · ${TIER_CONFIG[tier].label} · Quick Create`,
      line_items: lineItems, show_materials: true, show_labour: true,
      subtotal, tax_rate: 13, tax_amount: taxAmount, total,
      payment_schedule: [],
      closing_message: 'Allowance values are estimates. Final pricing adjusted from actual vendor receipts plus markup.',
      valid_until: validDate.toISOString().split('T')[0],
    });
    setSaving(false); setSaved(true);
    setTimeout(() => { onClose(); navigate('/forge/quotes'); }, 1200);
  }

  if (!open) return null;

  /* Styles */
  const inp: React.CSSProperties = { height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-panel-raised)', color: 'var(--color-text)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', transition: 'all 0.15s', width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 6, display: 'block' };
  function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.12)'; }
  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }

  const STEPS: { id: Step; label: string }[] = [
    { id: 'profile', label: 'Profile' }, { id: 'trades', label: 'Trades' },
    { id: 'configure', label: 'Details' }, { id: 'review', label: 'Review' },
    { id: 'client', label: 'Client' },
  ];
  const stepIdx = STEPS.findIndex(s => s.id === step);
  const tradeCatLabel = TRADE_CATEGORIES.find(t => t.id === tradeCat)?.label ?? '';

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 111, width: '100%', maxWidth: 640, background: 'var(--color-panel)', borderRadius: 16, boxShadow: '0 40px 100px rgba(0,0,0,0.25)', border: '1px solid var(--color-border)', overflow: 'hidden', animation: 'qcFadeIn 0.2s ease', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(252,226,5,0.04)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FCE205', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={16} color="#111010" strokeWidth={2.5} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>Quick Create</p>
              <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>Guided estimate — 90 seconds</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={16} color="var(--color-muted)" /></button>
        </div>

        {/* Step indicator */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 4, flexShrink: 0, overflowX: 'auto' }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i < stepIdx ? '#16A34A' : i === stepIdx ? '#FCE205' : 'var(--color-mist)', border: `2px solid ${i < stepIdx ? '#16A34A' : i === stepIdx ? '#FCE205' : 'var(--color-border)'}`, color: i < stepIdx ? '#FFFFFF' : i === stepIdx ? '#111010' : 'var(--color-muted)', transition: 'all 0.2s' }}>
                {i < stepIdx ? <Check size={11} strokeWidth={3} /> : i + 1}
              </div>
              <span style={{ fontSize: 11, fontWeight: i === stepIdx ? 700 : 400, color: i === stepIdx ? 'var(--color-text)' : 'var(--color-muted)' }}>{s.label}</span>
              {i < STEPS.length - 1 && <ChevronRight size={11} color="var(--color-border)" style={{ marginLeft: 2 }} />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── STEP 1: Profile ── */}
          {step === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 3 }}>What are we quoting?</p>
                <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Pick the trade, then the job type.</p>
              </div>

              {/* Trade category */}
              <div>
                <label style={lbl}>Trade</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {TRADE_CATEGORIES.map(tc => (
                    <button key={tc.id} onClick={() => setTradeCat(tc.id)} style={{ padding: '8px 4px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, textAlign: 'center', fontWeight: tradeCat === tc.id ? 700 : 400, background: tradeCat === tc.id ? 'rgba(252,226,5,0.10)' : 'var(--color-mist)', border: tradeCat === tc.id ? '2px solid #FCE205' : '2px solid transparent', color: tradeCat === tc.id ? '#8A7600' : 'var(--color-text)', transition: 'all 0.1s' }}>
                      {tc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project type — searchable */}
              <div ref={typeRef} style={{ position: 'relative' }}>
                <label style={lbl}>Job Type</label>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', pointerEvents: 'none' }} />
                  <input
                    style={{ ...inp, paddingLeft: 32, borderColor: typeOpen ? '#FCE205' : 'var(--color-border)', boxShadow: typeOpen ? '0 0 0 3px rgba(252,226,5,0.12)' : 'none' }}
                    placeholder={`Search ${tradeCatLabel} job types...`}
                    value={typeSearch}
                    onChange={e => { setTypeSearch(e.target.value); setProjectType(''); setTypeOpen(true); }}
                    onFocus={() => setTypeOpen(true)}
                  />
                </div>
                {typeOpen && typeOptions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
                    {typeOptions.map(t => (
                      <div key={t} onMouseDown={() => selectType(t)} style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: t === projectType ? '#8A7600' : 'var(--color-text)', background: t === projectType ? 'rgba(252,226,5,0.08)' : 'transparent', borderBottom: '1px solid var(--color-border)', transition: 'all 0.08s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(252,226,5,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = t === projectType ? 'rgba(252,226,5,0.08)' : 'transparent'; }}>
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quantity — unit-aware */}
              <div>
                <label style={lbl}>How much? ({unitProfile.label})</label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...inp, fontSize: 28, fontWeight: 800, height: 60, fontFamily: 'var(--font-mono)', textAlign: 'center', letterSpacing: '-0.02em' }}
                    type="number" min="1" placeholder={unitProfile.placeholder}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    onFocus={onFocus} onBlur={onBlur}
                  />
                  <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--color-muted)', fontWeight: 700 }}>{unitProfile.label}</span>
                </div>
              </div>

              {/* Quality tier */}
              <div>
                <label style={lbl}>Quality Tier</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {(Object.keys(TIER_CONFIG) as QualityTier[]).map(t => {
                    const cfg = TIER_CONFIG[t]; const active = tier === t;
                    return (
                      <button key={t} onClick={() => setTier(t)} style={{ padding: '13px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'center', background: active ? `${cfg.color}12` : 'var(--color-mist)', border: active ? `2px solid ${cfg.color}` : '2px solid transparent', transition: 'all 0.15s' }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: active ? cfg.color : 'var(--color-text)', marginBottom: 3 }}>{cfg.label}</p>
                        <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{cfg.sub}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Trades ── */}
          {step === 'trades' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 3 }}>Which trades are on this job?</p>
                <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Pre-loaded for {projectType || tradeCatLabel}. Add or remove.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {TRADE_TILES.map(tile => {
                  const active = activeTrades.has(tile.trade);
                  return (
                    <button key={tile.trade} onClick={() => toggleTrade(tile.trade)} style={{ padding: '12px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'center', background: active ? `${tile.color}15` : 'var(--color-mist)', border: active ? `2px solid ${tile.color}` : '2px solid transparent', transition: 'all 0.12s', position: 'relative' }}>
                      {active && <div style={{ position: 'absolute', top: 5, right: 5, width: 14, height: 14, borderRadius: '50%', background: tile.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={8} color="#FFFFFF" strokeWidth={3} /></div>}
                      <p style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? tile.color : 'var(--color-text)' }}>{tile.trade}</p>
                      <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 2 }}>{UNIT_PROFILES[tile.trade]?.label ?? 'sqft'}</p>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                <Zap size={12} color="#8A7600" strokeWidth={1.5} />
                <p style={{ fontSize: 11 }}><strong>{activeTrades.size} trade{activeTrades.size !== 1 ? 's' : ''}</strong> selected · {quantity} {unitProfile.label} · {TIER_CONFIG[tier].label}</p>
              </div>
            </div>
          )}

          {/* ── STEP 3: Configure ── */}
          {step === 'configure' && configured.length > 0 && (() => {
            const cfg = configured[configIdx];
            const cats = categoriesFor(cfg.trade);
            const selectedRow = matrix.find(m => m.trade === cfg.trade && m.category === cfg.category) ?? cats[0];
            const up = UNIT_PROFILES[cfg.trade] ?? { unit: 'sqft', label: 'sq ft', placeholder: '0' };
            const extras = TRADE_EXTRAS[cfg.trade] ?? [];
            const allow = cfg.tier === 'luxury' ? (selectedRow?.allowance_luxury ?? selectedRow?.allowance_premium ?? 0) : cfg.tier === 'premium' ? (selectedRow?.allowance_premium ?? 0) : (selectedRow?.allowance_standard ?? 0);
            const labourAmt = selectedRow ? cfg.quantity * selectedRow.labour_rate * selectedRow.markup_multiplier : 0;
            const matAmt = selectedRow ? cfg.quantity * allow * selectedRow.markup_multiplier * (1 + selectedRow.sundries_percent) : 0;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 2 }}>{cfg.trade}</p>
                    <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Trade {configIdx + 1} of {configured.length} — 3 quick questions</p>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {configured.map((_, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < configIdx ? '#16A34A' : i === configIdx ? '#FCE205' : 'var(--color-border)', transition: 'all 0.2s' }} />)}
                  </div>
                </div>

                {/* Q1: Type */}
                {cats.length > 1 && (
                  <div>
                    <label style={lbl}>1. What type of {cfg.trade.toLowerCase()}?</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {cats.map(cat => (
                        <button key={cat.id} onClick={() => updateConfig(configIdx, { category: cat.category })} style={{ padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: cfg.category === cat.category ? 'rgba(252,226,5,0.08)' : 'var(--color-mist)', border: cfg.category === cat.category ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)', transition: 'all 0.1s' }}>
                          <div>
                            <p style={{ fontSize: 12, fontWeight: cfg.category === cat.category ? 700 : 400, color: cfg.category === cat.category ? '#8A7600' : 'var(--color-text)' }}>{cat.category}</p>
                            <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{cat.notes}</p>
                          </div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 12 }}>
                            ${((cat.labour_rate + (cfg.tier === 'luxury' ? (cat.allowance_luxury ?? cat.allowance_premium) : cfg.tier === 'premium' ? cat.allowance_premium : cat.allowance_standard)) * cat.markup_multiplier).toFixed(2)}/{cat.unit}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Q2: Quantity */}
                <div>
                  <label style={lbl}>2. How many {up.label}?</label>
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...inp, fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 800, height: 50, textAlign: 'center' }} type="number" min="1" value={cfg.quantity} onChange={e => updateConfig(configIdx, { quantity: Number(e.target.value) })} onFocus={onFocus} onBlur={onBlur} />
                    <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-muted)', fontWeight: 600 }}>{up.label}</span>
                  </div>
                </div>

                {/* Q3: Extras */}
                {extras.length > 0 && (
                  <div>
                    <label style={lbl}>3. Any extras?</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {extras.map(ex => {
                        const active = cfg.extras.includes(ex);
                        return (
                          <button key={ex} onClick={() => toggleExtra(configIdx, ex)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: active ? 700 : 400, background: active ? 'rgba(252,226,5,0.10)' : 'var(--color-mist)', border: active ? '1px solid rgba(252,226,5,0.35)' : '1px solid var(--color-border)', color: active ? '#8A7600' : 'var(--color-text)', transition: 'all 0.1s' }}>
                            <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${active ? '#FCE205' : 'var(--color-border)'}`, background: active ? '#FCE205' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {active && <Check size={8} color="#111010" strokeWidth={3} />}
                            </div>
                            {ex}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Live preview */}
                {selectedRow && (
                  <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(252,226,5,0.05)', border: '1px solid rgba(252,226,5,0.15)' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#8A7600', marginBottom: 8 }}>Live preview</p>
                    {cfg.includeLabour && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 11 }}>Labour ({cfg.quantity} {up.label})</span><span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>${labourAmt.toFixed(2)}</span></div>}
                    {cfg.includeMaterial && allow > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11 }}>Materials + sundries ({TIER_CONFIG[cfg.tier].label})</span><span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>${matAmt.toFixed(2)}</span></div>}
                  </div>
                )}

                {/* Nav */}
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {configIdx > 0 && <button onClick={() => setConfigIdx(i => i - 1)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}><ChevronLeft size={13} /> Back</button>}
                  {configIdx < configured.length - 1
                    ? <button onClick={() => setConfigIdx(i => i + 1)} className="forge-button forge-button--primary" style={{ flex: 1, gap: 6 }}>Next: {configured[configIdx + 1]?.trade} <ChevronRight size={13} /></button>
                    : <button onClick={goToReview} className="forge-button forge-button--primary" style={{ flex: 1, gap: 6 }}>Calculate Estimate <ChevronRight size={13} /></button>
                  }
                </div>
              </div>
            );
          })()}

          {/* ── STEP 4: Review ── */}
          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 3 }}>Review your estimate</p>
                <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{quantity} {unitProfile.label} · {projectType || tradeCatLabel} · {TIER_CONFIG[tier].label}</p>
              </div>
              <div style={{ background: 'var(--color-mist)', borderRadius: 10, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                {lineItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 14px', borderBottom: i < lineItems.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 500 }}>{item.description}</p>
                      {item.amount > 0 && <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{item.quantity} {item.unit} × ${item.rate.toFixed(2)}{item.isAllowance ? ' (incl. sundries)' : ''}</p>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: item.isAllowance ? '#1E5FA4' : item.amount === 0 ? 'var(--color-muted)' : 'var(--color-text)' }}>
                        {item.amount > 0 ? `$${item.amount.toFixed(2)}` : 'TBD'}
                      </p>
                      {item.isAllowance && <p style={{ fontSize: 9, color: '#1E5FA4', fontWeight: 700 }}>ALLOWANCE</p>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Subtotal</span><span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>${subtotal.toFixed(2)}</span></div>
                {allowanceTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span style={{ fontSize: 11, color: '#1E5FA4' }}>Allowances</span><span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#1E5FA4' }}>${allowanceTotal.toFixed(2)}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ fontSize: 11, color: 'var(--color-muted)' }}>HST (13%)</span><span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>${taxAmount.toFixed(2)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '2px solid #FCE205' }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>Total</span>
                  <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#8A7600' }}>${total.toFixed(2)}</span>
                </div>
              </div>
              {allowanceTotal > 0 && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(30,95,164,0.05)', border: '1px solid rgba(30,95,164,0.15)' }}>
                  <AlertCircle size={13} color="#1E5FA4" strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 11, color: '#1E5FA4', lineHeight: 1.6 }}>Items marked <strong>ALLOWANCE</strong> are estimates. Final pricing adjusted from actual vendor receipts plus markup.</p>
                </div>
              )}
              <div>
                <label style={lbl}>Output type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {(['estimate', 'proposal'] as DocType[]).map(dt => (
                    <button key={dt} onClick={() => setDocType(dt)} style={{ padding: '12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'center', background: docType === dt ? 'rgba(252,226,5,0.10)' : 'var(--color-mist)', border: docType === dt ? '2px solid #FCE205' : '2px solid transparent', transition: 'all 0.12s' }}>
                      <p style={{ fontSize: 13, fontWeight: docType === dt ? 700 : 500, color: docType === dt ? '#8A7600' : 'var(--color-text)', marginBottom: 2, textTransform: 'capitalize' }}>{dt}</p>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{dt === 'estimate' ? 'Simple one-page' : 'Detailed with narrative'}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5: Client ── */}
          {step === 'client' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 3 }}>Who is this for?</p>
                <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Optional — save or send without a client assigned.</p>
              </div>
              <div>
                <label style={lbl}>Existing Client</label>
                <div style={{ position: 'relative' }}>
                  <User size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                  <select style={{ ...inp, paddingLeft: 30 }} value={clientId} onChange={e => setClientId(e.target.value)} onFocus={onFocus} onBlur={onBlur}>
                    <option value="">Select existing client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>or new client</span>
                <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              </div>
              <div>
                <label style={lbl}>Client Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                  <input style={{ ...inp, paddingLeft: 30 }} placeholder="John Henderson" value={clientName} onChange={e => setClientName(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
                </div>
              </div>
              <div>
                <label style={lbl}>Email</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                  <input style={{ ...inp, paddingLeft: 30 }} placeholder="john@email.com" value={clientEmail} onChange={e => setClientEmail(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
                </div>
              </div>
              <div style={{ padding: '14px', borderRadius: 10, background: 'rgba(252,226,5,0.06)', border: '1px solid rgba(252,226,5,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Document</span><span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{docType}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Scope</span><span style={{ fontSize: 11, fontWeight: 600 }}>{projectType || tradeCatLabel} · {quantity} {unitProfile.label} · {TIER_CONFIG[tier].label}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, fontWeight: 800 }}>Total</span><span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#8A7600' }}>${total.toFixed(2)}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', background: 'var(--color-panel-raised)', display: 'flex', gap: 10, flexShrink: 0 }}>
          {step === 'profile' && (
            <button onClick={goToTrades} disabled={!quantity || Number(quantity) <= 0} className="forge-button forge-button--primary" style={{ flex: 1, gap: 6, opacity: !quantity || Number(quantity) <= 0 ? 0.5 : 1 }}>
              Select Trades <ChevronRight size={14} />
            </button>
          )}
          {step === 'trades' && (
            <>
              <button onClick={() => setStep('profile')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}><ChevronLeft size={13} /> Back</button>
              <button onClick={goToConfigure} disabled={activeTrades.size === 0} className="forge-button forge-button--primary" style={{ flex: 1, gap: 6, opacity: activeTrades.size === 0 ? 0.5 : 1 }}>
                Configure {activeTrades.size} Trade{activeTrades.size !== 1 ? 's' : ''} <ChevronRight size={14} />
              </button>
            </>
          )}
          {step === 'configure' && null}
          {step === 'review' && (
            <>
              <button onClick={() => { setConfigIdx(configured.length - 1); setStep('configure'); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}><ChevronLeft size={13} /> Back</button>
              <button onClick={() => setStep('client')} className="forge-button forge-button--primary" style={{ flex: 1, gap: 6 }}>Add Client & Send <ChevronRight size={14} /></button>
            </>
          )}
          {step === 'client' && (
            <>
              <button onClick={() => setStep('review')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, background: 'var(--color-mist)', border: '1px solid var(--color-border)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}><ChevronLeft size={13} /> Back</button>
              <button onClick={() => handleSave(false)} disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                <Save size={13} /> Save Draft
              </button>
              <button onClick={() => handleSave(true)} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: saved ? '#16A34A' : '#FCE205', border: 'none', color: saved ? '#FFFFFF' : '#111010', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.2s' }}>
                {saved ? <><Check size={13} /> Saved!</> : saving ? 'Saving...' : <><Send size={13} /> Send to Client</>}
              </button>
            </>
          )}
        </div>

        <style>{`
          @keyframes qcFadeIn {
            from { opacity: 0; transform: translate(-50%, -47%) scale(0.96); }
            to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
        `}</style>
      </div>
    </>
  );
}