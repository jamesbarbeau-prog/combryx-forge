// A small finger/mouse signature pad. Calls onChange with a PNG data URL, or null when empty.
import { useEffect, useRef, useState } from 'react';

export function SignaturePad({ onChange, height = 150 }: { onChange: (png: string | null) => void; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!; const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio; c.height = height * ratio;
    const g = c.getContext('2d')!; g.scale(ratio, ratio); g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1B2A41';
  }, [height]);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function down(e: React.PointerEvent) { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; const g = ref.current!.getContext('2d')!; const p = pos(e); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 0.01, p.y); g.stroke(); }
  function move(e: React.PointerEvent) { if (!drawing.current) return; const g = ref.current!.getContext('2d')!; const p = pos(e); g.lineTo(p.x, p.y); g.stroke(); }
  function up() { if (!drawing.current) return; drawing.current = false; setEmpty(false); onChange(ref.current!.toDataURL('image/png')); }
  function clear() { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(null); }

  return (
    <div>
      <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ width: '100%', height, display: 'block', background: '#fff', border: '1px solid #C9C0AE', borderRadius: 6, touchAction: 'none', cursor: 'crosshair' }} aria-label="Signature area" />
      <button type="button" onClick={clear} disabled={empty} style={{ marginTop: 6, border: 'none', background: 'none', color: '#2F5576', fontWeight: 600, fontSize: 13, cursor: empty ? 'default' : 'pointer', opacity: empty ? 0.4 : 1, padding: 0 }}>Clear signature</button>
    </div>
  );
}
