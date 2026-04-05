import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { FileText, Check, AlertCircle, Edit3, Type, MousePointer } from 'lucide-react';

interface ChangeOrder {
  id: string;
  co_number: string;
  title: string;
  description: string | null;
  reason: string | null;
  status: string;
  line_items: any[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  original_value: number;
  revised_value: number;
  valid_until: string | null;
  signed_at: string | null;
  signed_by: string | null;
  signature_data: string | null;
  clients?: { first_name: string; last_name: string; email: string | null } | null;
  projects?: { name: string } | null;
}

type SigMode = 'draw' | 'type';

const SIG_FONTS = [
  { id: 'dancing',  label: 'Elegant',     style: "'Dancing Script', cursive" },
  { id: 'pacifico', label: 'Casual',      style: "'Pacifico', cursive"        },
  { id: 'satisfy',  label: 'Classic',     style: "'Satisfy', cursive"         },
  { id: 'caveat',   label: 'Handwritten', style: "'Caveat', cursive"          },
];

export default function COSignPage() {
  const { id }        = useParams<{ id: string }>();
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const typeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [co, setCo]               = useState<ChangeOrder | null>(null);
  const [loading, setLoading]     = useState(true);
  const [name, setName]           = useState('');
  const [sigMode, setSigMode]     = useState<SigMode>('draw');
  const [selectedFont, setSelectedFont] = useState(SIG_FONTS[0].id);
  const [drawing, setDrawing]     = useState(false);
  const [hasSig, setHasSig]       = useState(false);
  const [agreed, setAgreed]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => { if (id) fetchCO(); }, [id]);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel   = 'stylesheet';
    link.href  = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Pacifico&family=Satisfy&family=Caveat:wght@700&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    if (sigMode !== 'type' || !name.trim()) { setHasSig(false); return; }
    const canvas = typeCanvasRef.current;
    if (!canvas) return;
    const ctx  = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const font = SIG_FONTS.find(f => f.id === selectedFont)?.style ?? SIG_FONTS[0].style;
    ctx.font          = `56px ${font}`;
    ctx.fillStyle     = '#111010';
    ctx.textBaseline  = 'middle';
    ctx.textAlign     = 'center';
    ctx.fillText(name.trim(), canvas.width / 2, canvas.height / 2);
    setHasSig(true);
  }, [name, selectedFont, sigMode]);

  async function fetchCO() {
    const { data: coData } = await supabase
      .from('change_orders')
      .select('*')
      .eq('id', id!)
      .single();

    if (coData) {
      let enriched = { ...coData, clients: null, projects: null };

      if (coData.client_id) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('first_name, last_name, email')
          .eq('id', coData.client_id)
          .single();
        if (clientData) enriched.clients = clientData;
      }

      if (coData.project_id) {
        const { data: projData } = await supabase
          .from('projects')
          .select('name')
          .eq('id', coData.project_id)
          .single();
        if (projData) enriched.projects = projData;
      }

      setCo(enriched as ChangeOrder);
    }
    if (data) setCo(data as ChangeOrder);
    setLoading(false);
  }

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx    = canvas.getContext('2d')!;
    const pos    = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx    = canvas.getContext('2d')!;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111010';
    const pos    = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    setHasSig(true);
  }

  function endDraw() { setDrawing(false); }

  function clearSig() {
    if (sigMode === 'draw') {
      const canvas = canvasRef.current; if (!canvas) return;
      canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSig(false);
  }

  function getSignatureData(): string {
    if (sigMode === 'type') return typeCanvasRef.current?.toDataURL('image/png') ?? '';
    return canvasRef.current?.toDataURL('image/png') ?? '';
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Please enter your full name'); return; }
    if (!hasSig)      { setError(sigMode === 'draw' ? 'Please sign in the box above' : 'Please enter your name to generate a signature'); return; }
    if (!agreed)      { setError('Please check the agreement box to proceed'); return; }
    setError(''); setSubmitting(true);

    const { error: err } = await supabase.from('change_orders').update({
      status:         'signed',
      signed_at:      new Date().toISOString(),
      signed_by:      name.trim(),
      signature_data: getSignatureData(),
    }).eq('id', id!);

    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setDone(true);
  }

  const fmtMoney = (v: number) => `$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F4EF', fontFamily: 'DM Sans, sans-serif', color: '#8C8680' }}>
      Loading document...
    </div>
  );

  if (!co) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F6F4EF', fontFamily: 'DM Sans, sans-serif' }}>
      <AlertCircle size={32} color="#DC2626" strokeWidth={1} style={{ marginBottom: 12 }} />
      <p style={{ fontSize: 16, fontWeight: 700, color: '#111010' }}>Document not found</p>
      <p style={{ fontSize: 13, color: '#8C8680', marginTop: 6 }}>This link may be invalid or expired.</p>
    </div>
  );

  if (co.status === 'signed' || done) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F6F4EF', fontFamily: 'DM Sans, sans-serif', padding: 24 }}>
      <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '48px 40px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Check size={28} color="#16A34A" strokeWidth={2} />
        </div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#111010', marginBottom: 10 }}>Change Order Signed</p>
        <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.7, marginBottom: 6 }}>{co.title}</p>
        <p style={{ fontSize: 13, color: '#8C8680', marginBottom: 24 }}>Thank you. Your contractor has been notified.</p>
        <div style={{ padding: '16px 24px', borderRadius: 10, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#DC2626' }}>+{fmtMoney(co.total)} added to contract</p>
          <p style={{ fontSize: 11, color: '#DC2626' }}>Revised total: {fmtMoney(co.revised_value)}</p>
        </div>
        <p style={{ fontSize: 11, color: '#8C8680' }}>You agreed to this change on {new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F6F4EF', fontFamily: 'DM Sans, sans-serif', padding: '32px 16px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={18} color="#FFFFFF" strokeWidth={1.5} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#111010' }}>Change Order — Review & Sign</p>
            <p style={{ fontSize: 11, color: '#8C8680' }}>{co.co_number}</p>
          </div>
          {co.valid_until && (
            <p style={{ fontSize: 11, color: '#8C8680', marginLeft: 'auto' }}>
              Valid until {new Date(co.valid_until).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Document */}
        <div style={{ background: '#FFFFFF', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '28px', marginBottom: 20 }}>

          {/* Letterhead */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: '3px solid #DC2626' }}>
            <div>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <FileText size={20} color="#FFFFFF" strokeWidth={1.5} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#111010' }}>Change Order</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 18, fontWeight: 900, color: '#DC2626', letterSpacing: '0.04em' }}>CHANGE ORDER</p>
              <p style={{ fontSize: 11, color: '#8C8680', fontFamily: 'monospace' }}>{co.co_number}</p>
              <p style={{ fontSize: 11, color: '#8C8680', marginTop: 4 }}>{new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>

          {/* Client + Project */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            {co.clients && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 4 }}>Prepared for</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#111010' }}>{co.clients.first_name} {co.clients.last_name}</p>
                {co.clients.email && <p style={{ fontSize: 11, color: '#6B7280' }}>{co.clients.email}</p>}
              </div>
            )}
            {co.projects && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 4 }}>Project</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#111010' }}>{co.projects.name}</p>
              </div>
            )}
          </div>

          {/* Title + reason */}
          <p style={{ fontSize: 17, fontWeight: 900, color: '#111010', marginBottom: 6 }}>{co.title}</p>
          {co.reason && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: 'rgba(220,38,38,0.08)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.2)', display: 'inline-block', marginBottom: 12 }}>
              {co.reason}
            </span>
          )}
          {co.description && <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, marginBottom: 18 }}>{co.description}</p>}

          {/* Line items */}
          {(co.line_items ?? []).length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #F0EDE8' }}>Scope of Change</p>
              {(co.line_items ?? []).map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F8F7F4' }}>
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <p style={{ fontSize: 12, color: '#111010', fontWeight: 500 }}>{item.description}</p>
                    {item.quantity !== 1 && <p style={{ fontSize: 10, color: '#8C8680' }}>{item.quantity} {item.unit} × ${item.rate?.toLocaleString()}</p>}
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, color: '#DC2626' }}>
                    +${item.amount?.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div style={{ padding: '14px 16px', borderRadius: 10, background: '#F8F7F4', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: '#6B7280' }}>Subtotal</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace' }}>${co.subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: '#6B7280' }}>HST ({co.tax_rate}%)</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace' }}>${co.tax_amount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #DC2626' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#DC2626' }}>Change Order Total</span>
              <span style={{ fontSize: 15, fontWeight: 900, fontFamily: 'monospace', color: '#DC2626' }}>+{fmtMoney(co.total)}</span>
            </div>
          </div>

          {/* Contract impact */}
          <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', marginBottom: 18 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#DC2626', marginBottom: 10 }}>Contract Impact</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: '#6B7280' }}>Original Contract Value</span>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#6B7280' }}>{fmtMoney(co.original_value)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>This Change Order</span>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#DC2626', fontWeight: 700 }}>+{fmtMoney(co.total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(220,38,38,0.2)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#111010' }}>New Contract Total</span>
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: '#111010' }}>{fmtMoney(co.revised_value)}</span>
            </div>
          </div>

          {/* Legal notice */}
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(30,95,164,0.04)', border: '1px solid rgba(30,95,164,0.12)' }}>
            <p style={{ fontSize: 10, color: '#1E5FA4', lineHeight: 1.7, fontStyle: 'italic' }}>
              <strong>Important:</strong> By signing this Change Order, you authorize the additional work described above and agree to the revised contract total. This document supplements and forms part of the original contract agreement.
            </p>
          </div>
        </div>

        {/* Signature panel */}
        <div style={{ background: '#FFFFFF', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '28px', marginBottom: 24 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#111010', marginBottom: 6 }}>Authorize This Change</p>
          <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6, marginBottom: 20 }}>
            By signing below, you authorize the additional work and agree to the revised contract total of <strong>{fmtMoney(co.revised_value)}</strong>.
          </p>

          {/* Full name */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#8C8680', display: 'block', marginBottom: 6 }}>Full Legal Name</label>
            <input
              style={{ width: '100%', height: 44, padding: '0 14px', borderRadius: 9, border: '1px solid #E4E0D8', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', color: '#111010', transition: 'all 0.15s', background: '#FAFAF9' }}
              placeholder="John Henderson"
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={e => { e.currentTarget.style.borderColor = '#DC2626'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.10)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E4E0D8'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Signature method */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#8C8680', display: 'block', marginBottom: 8 }}>Signature Method</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { id: 'draw' as SigMode, label: 'Draw',  sub: 'Mouse or stylus', icon: MousePointer },
                { id: 'type' as SigMode, label: 'Type',  sub: 'Choose a style',  icon: Type         },
              ].map(opt => {
                const Icon   = opt.icon;
                const active = sigMode === opt.id;
                return (
                  <button key={opt.id} onClick={() => { setSigMode(opt.id); setHasSig(false); }} style={{ flex: 1, padding: '12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'center', background: active ? 'rgba(220,38,38,0.08)' : '#FAFAF9', border: active ? '2px solid #DC2626' : '2px solid #E4E0D8', transition: 'all 0.12s' }}>
                    <Icon size={16} color={active ? '#DC2626' : '#8C8680'} strokeWidth={1.5} style={{ marginBottom: 5 }} />
                    <p style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? '#DC2626' : '#4A4640', marginBottom: 2 }}>{opt.label}</p>
                    <p style={{ fontSize: 10, color: '#8C8680' }}>{opt.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Draw mode */}
          {sigMode === 'draw' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#8C8680' }}>Draw your signature</label>
                {hasSig && <button onClick={clearSig} style={{ fontSize: 11, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Clear</button>}
              </div>
              <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `2px solid ${hasSig ? '#DC2626' : '#E4E0D8'}`, transition: 'border-color 0.15s' }}>
                <canvas
                  ref={canvasRef}
                  width={640} height={180}
                  style={{ display: 'block', width: '100%', height: 180, cursor: 'crosshair', touchAction: 'none', background: '#FAFAF9' }}
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                />
                {!hasSig && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#C8C2B4' }}>
                      <Edit3 size={18} strokeWidth={1.5} />
                      <span style={{ fontSize: 12 }}>Sign with your mouse or stylus</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Type mode */}
          {sigMode === 'type' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#8C8680', display: 'block', marginBottom: 8 }}>Choose a signature style</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                {SIG_FONTS.map(font => (
                  <button key={font.id} onClick={() => setSelectedFont(font.id)} style={{ padding: '14px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: font.style, fontSize: 22, color: '#111010', background: selectedFont === font.id ? 'rgba(220,38,38,0.08)' : '#FAFAF9', border: selectedFont === font.id ? '2px solid #DC2626' : '2px solid #E4E0D8', transition: 'all 0.12s', textAlign: 'center' }}>
                    {name.trim() || 'Your Name'}
                  </button>
                ))}
              </div>
              <canvas ref={typeCanvasRef} width={640} height={100} style={{ display: 'none' }} />
              {name.trim() ? (
                <div style={{ padding: '20px', borderRadius: 10, background: '#FAFAF9', border: `2px solid ${hasSig ? '#DC2626' : '#E4E0D8'}`, textAlign: 'center' }}>
                  <p style={{ fontFamily: SIG_FONTS.find(f => f.id === selectedFont)?.style ?? SIG_FONTS[0].style, fontSize: 40, color: '#111010', lineHeight: 1.2 }}>{name}</p>
                </div>
              ) : (
                <div style={{ padding: '20px', borderRadius: 10, background: '#FAFAF9', border: '2px solid #E4E0D8', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#C8C2B4' }}>Enter your name above to preview</p>
                </div>
              )}
            </div>
          )}

          {/* Agreement checkbox */}
          <div style={{ padding: '16px', borderRadius: 10, background: '#F8F7F4', border: '1px solid #E4E0D8', marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
              <div onClick={() => setAgreed(!agreed)} style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${agreed ? '#DC2626' : '#C8C2B4'}`, background: agreed ? '#DC2626' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, cursor: 'pointer', transition: 'all 0.15s' }}>
                {agreed && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#111010', marginBottom: 4 }}>I authorize this change to my contract</p>
                <p style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6 }}>
                  By checking this box and signing above, I confirm I have read and understood this Change Order including the additional scope, cost of{' '}
                  <strong>{fmtMoney(co.total)}</strong>, and the revised contract total of{' '}
                  <strong>{fmtMoney(co.revised_value)}</strong>. I acknowledge that my{' '}
                  {sigMode === 'type' ? 'typed name in the selected style' : 'drawn signature'}{' '}
                  constitutes a legally binding electronic signature under applicable Canadian law.
                </p>
              </div>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', marginBottom: 14 }}>
              <AlertCircle size={14} color="#DC2626" strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: '#DC2626' }}>{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ width: '100%', padding: '16px', borderRadius: 10, fontSize: 15, fontWeight: 900, background: agreed && hasSig ? '#DC2626' : '#E4E0D8', border: 'none', color: agreed && hasSig ? '#FFFFFF' : '#8C8680', cursor: agreed && hasSig ? 'pointer' : 'default', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.2s', letterSpacing: '-0.01em' }}
          >
            {submitting ? 'Submitting...' : `I Authorize — +${fmtMoney(co.total)} to Contract`}
          </button>

          <p style={{ fontSize: 10, color: '#8C8680', textAlign: 'center', marginTop: 10, lineHeight: 1.7 }}>
            Your signature, name, and timestamp are recorded at the time of signing.
            This constitutes a legally binding electronic authorization under Canadian electronic commerce legislation.
          </p>
        </div>
      </div>
    </div>
  );
}