import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { FileText, Check, AlertCircle, Edit3, Type, MousePointer } from 'lucide-react';

interface Quote {
  id: string;
  quote_number: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  line_items: any[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment_schedule: any[];
  closing_message: string | null;
  valid_until: string | null;
  signed_at: string | null;
  allowances: { text: string }[];
  clients?: { first_name: string; last_name: string; email: string | null } | null;
}

type SigMode = 'draw' | 'type';

const SIG_FONTS = [
  { id: 'dancing',    label: 'Elegant',    style: "'Dancing Script', cursive"        },
  { id: 'pacifico',  label: 'Casual',     style: "'Pacifico', cursive"               },
  { id: 'satisfy',   label: 'Classic',    style: "'Satisfy', cursive"                },
  { id: 'caveat',    label: 'Handwritten', style: "'Caveat', cursive"                },
];

export default function QuoteSignPage() {
  const { id } = useParams<{ id: string }>();
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const typeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [quote, setQuote]         = useState<Quote | null>(null);
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

  useEffect(() => { if (id) fetchQuote(); }, [id]);

  /* Load Google Fonts */
  useEffect(() => {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Pacifico&family=Satisfy&family=Caveat:wght@700&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  /* Render typed signature to canvas whenever name or font changes */
  useEffect(() => {
    if (sigMode !== 'type' || !name.trim()) { setHasSig(false); return; }
    const canvas = typeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const font = SIG_FONTS.find(f => f.id === selectedFont)?.style ?? SIG_FONTS[0].style;
    ctx.font = `56px ${font}`;
    ctx.fillStyle = '#111010';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(name.trim(), canvas.width / 2, canvas.height / 2);
    setHasSig(true);
  }, [name, selectedFont, sigMode]);

  async function fetchQuote() {
    const { data } = await supabase.from('quotes')
      .select('*, clients(first_name, last_name, email)')
      .eq('id', id!).single();
    if (data) setQuote(data as Quote);
    setLoading(false);
  }

  /* Draw mode */
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111010';
    const pos = getPos(e, canvas);
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
    if (!name.trim())  { setError('Please enter your full name'); return; }
    if (!hasSig)       { setError(sigMode === 'draw' ? 'Please sign in the box above' : 'Please enter your name to generate signature'); return; }
    if (!agreed)       { setError('Please check the agreement box to proceed'); return; }
    setError(''); setSubmitting(true);

    const { error: err } = await supabase.from('quotes').update({
        status:         'signed',
        signed_at:      new Date().toISOString(),
        signed_by:      name.trim(),
        signature_data: getSignatureData(),
      }).eq('id', id!);
  
      setSubmitting(false);
      if (err) { setError(err.message); return; }
  
      /* Auto-log to defense vault */
      await supabase.from('defense_files').insert({
        company_id:  '00000000-0000-0000-0000-000000000001',
        client_id:   quote.clients ? (quote as any).client_id : null,
        title:       `Signed ${quote.type} — ${quote.title}`,
        file_type:   'signed_estimate',
        description: `Signed by ${name.trim()} on ${new Date().toLocaleDateString('en-CA')}. Total: $${quote.total.toFixed(2)}`,
        status:      'active',
        reference_id: quote.id,
      });
  
      setDone(true);
  }

  /* Shared styles */
  const S = {
    lbl: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#8C8680', display: 'block' as const, marginBottom: 6 },
    inp: { width: '100%', height: 44, padding: '0 14px', borderRadius: 9, border: '1px solid #E4E0D8', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', color: '#111010', background: '#FAFAF9', transition: 'all 0.15s' },
    card: { background: '#FFFFFF', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '28px', marginBottom: 20 },
  };

  if (loading) return <Screen><p style={{ color: '#8C8680' }}>Loading document...</p></Screen>;
  if (!quote)  return <Screen><AlertIcon /><p style={{ fontWeight: 700, color: '#111010', marginBottom: 6 }}>Document not found</p><p style={{ fontSize: 13, color: '#8C8680' }}>This link may be invalid or expired.</p></Screen>;

  if (quote.status === 'signed' || done) return (
    <Screen>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Check size={28} color="#16A34A" strokeWidth={2} />
      </div>
      <p style={{ fontSize: 22, fontWeight: 900, color: '#111010', marginBottom: 10 }}>Document Signed</p>
      <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.7, marginBottom: 6 }}>{quote.title}</p>
      <p style={{ fontSize: 13, color: '#8C8680', textAlign: 'center' }}>Thank you. A copy will be sent to you by your contractor.</p>
      <div style={{ marginTop: 24, padding: '16px 24px', borderRadius: 10, background: 'rgba(252,226,5,0.08)', border: '1px solid rgba(252,226,5,0.2)', textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: '#8A7600' }}>${quote.total.toFixed(2)} agreed</p>
      </div>
    </Screen>
  );

  const exclusions = quote.allowances?.filter(a => a.text) ?? [];

  return (
    <div style={{ minHeight: '100vh', background: '#F6F4EF', fontFamily: 'DM Sans, sans-serif', padding: '32px 16px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: '#FCE205', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={18} color="#111010" strokeWidth={1.5} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#111010' }}>Review & Sign</p>
            <p style={{ fontSize: 11, color: '#8C8680' }}>{quote.quote_number}</p>
          </div>
          {quote.valid_until && <p style={{ fontSize: 11, color: '#8C8680', marginLeft: 'auto' }}>Valid until {new Date(quote.valid_until).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
        </div>

        {/* Document summary card */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: '3px solid #FCE205' }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#111010', marginBottom: 3 }}>{quote.title}</p>
              {quote.clients && <p style={{ fontSize: 13, color: '#6B7280' }}>Prepared for {quote.clients.first_name} {quote.clients.last_name}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#111010', fontFamily: 'monospace' }}>${quote.total.toFixed(2)}</p>
              <p style={{ fontSize: 10, color: '#8C8680' }}>Incl. {quote.tax_rate}% HST</p>
            </div>
          </div>

          {quote.description && <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.7, marginBottom: 16 }}>{quote.description}</p>}

          {/* Line items */}
          {(quote.line_items ?? []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8C8680', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #F0EDE8' }}>Scope & Pricing</p>
              {(quote.line_items ?? []).map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F8F7F4' }}>
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <p style={{ fontSize: 12, color: '#111010', fontWeight: 500 }}>{item.description}</p>
                    {item.isAllowance && <p style={{ fontSize: 9, fontWeight: 700, color: '#1E5FA4', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Allowance</p>}
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>
                    {item.amount > 0 ? `$${item.amount.toLocaleString()}` : 'TBD'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div style={{ padding: '12px 14px', borderRadius: 9, background: '#F8F7F4', marginBottom: exclusions.length > 0 ? 16 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#6B7280' }}>Subtotal</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace' }}>${quote.subtotal.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#6B7280' }}>HST ({quote.tax_rate}%)</span>
              <span style={{ fontSize: 11, fontFamily: 'monospace' }}>${quote.tax_amount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '2px solid #FCE205' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#111010' }}>Total</span>
              <span style={{ fontSize: 15, fontWeight: 900, fontFamily: 'monospace', color: '#111010' }}>${quote.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Exclusions */}
          {exclusions.length > 0 && (
            <div style={{ padding: '12px 14px', borderRadius: 8, background: '#FFF8F8', border: '1px solid #FECACA' }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#DC2626', marginBottom: 8 }}>Exclusions — Please Read Carefully</p>
              {exclusions.map((exc, i) => (
                <p key={i} style={{ fontSize: 11, color: '#4A4640', marginBottom: 4, paddingLeft: 12, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: '#DC2626', fontWeight: 700 }}>·</span>
                  <strong>{exc.text}</strong>
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Payment schedule */}
        {(quote.payment_schedule ?? []).length > 0 && (
          <div style={S.card}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#111010', marginBottom: 14 }}>Payment Schedule</p>
            {(quote.payment_schedule ?? []).map((row: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #F0EDE8' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#111010' }}>{row.label}</p>
                  <p style={{ fontSize: 10, color: '#8C8680' }}>{row.trigger}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>${((quote.total * row.percent) / 100).toFixed(2)}</p>
                  <p style={{ fontSize: 10, color: '#8C8680' }}>{row.percent}%</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Allowance disclaimer */}
        <div style={{ padding: '12px 16px', borderRadius: 9, background: 'rgba(30,95,164,0.05)', border: '1px solid rgba(30,95,164,0.15)', marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: '#1E5FA4', lineHeight: 1.7, fontStyle: 'italic' }}>
            <strong>Allowance Disclaimer:</strong> Values marked as "Allowances" are estimates for material selection. Final pricing adjusted from actual vendor receipts plus company markup. Labour pricing is fixed.
          </p>
        </div>

        {/* ── Signature Panel ── */}
        <div style={S.card}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#111010', letterSpacing: '-0.01em', marginBottom: 6 }}>Sign to Accept</p>
          <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6, marginBottom: 20 }}>
            Review the document above, then sign below to accept the scope, pricing, exclusions, and payment schedule.
          </p>

          {/* Full name */}
          <div style={{ marginBottom: 16 }}>
            <label style={S.lbl}>Full Legal Name</label>
            <input
              style={S.inp}
              placeholder="John Henderson"
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.15)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E4E0D8'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Signature mode toggle */}
          <div style={{ marginBottom: 16 }}>
            <label style={S.lbl}>Signature Method</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { id: 'draw' as SigMode, label: 'Draw',      sub: 'Mouse or stylus',    icon: MousePointer },
                { id: 'type' as SigMode, label: 'Type',      sub: 'Choose a style',     icon: Type         },
              ].map(opt => {
                const Icon   = opt.icon;
                const active = sigMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => { setSigMode(opt.id); setHasSig(false); }}
                    style={{ flex: 1, padding: '12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'center', background: active ? 'rgba(252,226,5,0.10)' : '#FAFAF9', border: active ? '2px solid #FCE205' : '2px solid #E4E0D8', transition: 'all 0.12s' }}
                  >
                    <Icon size={16} color={active ? '#8A7600' : '#8C8680'} strokeWidth={1.5} style={{ marginBottom: 5 }} />
                    <p style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? '#8A7600' : '#4A4640', marginBottom: 2 }}>{opt.label}</p>
                    <p style={{ fontSize: 10, color: '#8C8680' }}>{opt.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DRAW mode */}
          {sigMode === 'draw' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={S.lbl}>Draw your signature</label>
                {hasSig && <button onClick={clearSig} style={{ fontSize: 11, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Clear</button>}
              </div>
              <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: `2px solid ${hasSig ? '#FCE205' : '#E4E0D8'}`, transition: 'border-color 0.15s' }}>
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={180}
                  style={{ display: 'block', width: '100%', height: 180, cursor: 'crosshair', touchAction: 'none', background: '#FAFAF9' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
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
              <p style={{ fontSize: 10, color: '#8C8680', marginTop: 5 }}>Use your mouse to draw. On a tablet or phone, use your finger or stylus.</p>
            </div>
          )}

          {/* TYPE mode */}
          {sigMode === 'type' && (
            <div style={{ marginBottom: 16 }}>
              <label style={S.lbl}>Choose a signature style</label>

              {/* Font picker */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                {SIG_FONTS.map(font => (
                  <button
                    key={font.id}
                    onClick={() => setSelectedFont(font.id)}
                    style={{
                      padding: '14px 12px', borderRadius: 9, cursor: 'pointer',
                      fontFamily: font.style, fontSize: 22, color: '#111010',
                      background: selectedFont === font.id ? 'rgba(252,226,5,0.10)' : '#FAFAF9',
                      border: selectedFont === font.id ? '2px solid #FCE205' : '2px solid #E4E0D8',
                      transition: 'all 0.12s', textAlign: 'center',
                    }}
                  >
                    {name.trim() || 'Your Name'}
                  </button>
                ))}
              </div>

              {/* Hidden canvas renders the typed sig for saving */}
              <canvas ref={typeCanvasRef} width={640} height={100} style={{ display: 'none' }} />

              {/* Live preview */}
              {name.trim() && (
                <div style={{ padding: '20px', borderRadius: 10, background: '#FAFAF9', border: `2px solid ${hasSig ? '#FCE205' : '#E4E0D8'}`, textAlign: 'center', transition: 'border-color 0.15s' }}>
                  <p style={{ fontFamily: SIG_FONTS.find(f => f.id === selectedFont)?.style ?? SIG_FONTS[0].style, fontSize: 40, color: '#111010', lineHeight: 1.2 }}>
                    {name}
                  </p>
                  <p style={{ fontSize: 10, color: '#8C8680', marginTop: 8 }}>{SIG_FONTS.find(f => f.id === selectedFont)?.label} style</p>
                </div>
              )}

              {!name.trim() && (
                <div style={{ padding: '20px', borderRadius: 10, background: '#FAFAF9', border: '2px solid #E4E0D8', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#C8C2B4' }}>Enter your name above to preview</p>
                </div>
              )}
            </div>
          )}

          {/* Legal agreement checkbox */}
          <div style={{ padding: '16px', borderRadius: 10, background: '#F8F7F4', border: '1px solid #E4E0D8', marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
              <div
                onClick={() => setAgreed(!agreed)}
                style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${agreed ? '#16A34A' : '#C8C2B4'}`, background: agreed ? '#16A34A' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, cursor: 'pointer', transition: 'all 0.15s' }}
              >
                {agreed && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#111010', marginBottom: 4 }}>I agree and accept this document</p>
                <p style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6 }}>
                  By checking this box and signing above, I confirm I have read and understood the full scope, pricing, exclusions, and payment schedule. I acknowledge that my{' '}
                  {sigMode === 'type' ? 'typed name in the selected style' : 'drawn signature'}{' '}
                  constitutes a legally binding electronic signature under applicable Canadian law, equivalent to a handwritten signature.
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
            style={{ width: '100%', padding: '16px', borderRadius: 10, fontSize: 15, fontWeight: 900, background: agreed && hasSig ? '#FCE205' : '#E4E0D8', border: 'none', color: agreed && hasSig ? '#111010' : '#8C8680', cursor: agreed && hasSig ? 'pointer' : 'default', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.2s', letterSpacing: '-0.01em' }}
          >
            {submitting ? 'Submitting...' : `I Agree & Sign — $${quote.total.toFixed(2)}`}
          </button>

          <p style={{ fontSize: 10, color: '#8C8680', textAlign: 'center', marginTop: 10, lineHeight: 1.7 }}>
            Your signature, name, timestamp, and IP address are recorded at the time of signing.
            This constitutes a legally binding electronic signature under Canadian electronic commerce legislation.
          </p>
        </div>
      </div>
    </div>
  );
}

/* Helpers */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F6F4EF', fontFamily: 'DM Sans, sans-serif', padding: 24, textAlign: 'center' }}>
      {children}
    </div>
  );
}

function AlertIcon() {
  return <AlertCircle size={32} color="#DC2626" strokeWidth={1} style={{ marginBottom: 12 }} />;
}