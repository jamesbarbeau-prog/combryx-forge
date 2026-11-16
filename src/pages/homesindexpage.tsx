// Homes & Lots: find any home across every community, or jump into a community.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Home as HomeIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Hit { lot_id: string; community: string; lot_number: string | null; address: string | null; owner: string | null; enrollment: string | null; open_cases: number; closed_cases: number; conciliations: number }
interface Comm { community_id: string; name: string; lots: number; open_cases: number; open_items: number }
const street = (a: string | null) => (a ?? '').replace(/,\s*Ottawa.*$/i, '');

export default function HomesIndexPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [comms, setComms] = useState<Comm[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => { supabase.rpc('community_counts').then(({ data }) => setComms((data ?? []) as Comm[])); }, []);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const mine = ++seq.current;
    const id = setTimeout(async () => {
      const { data } = await supabase.rpc('warranty_search', { p_q: t, p_limit: 60 });
      if (mine !== seq.current) return;
      setHits((data ?? []) as Hit[]); setBusy(false);
    }, 160);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="hx">
      <style>{CSS}</style>
      <h1>Homes &amp; lots</h1>
      <p className="sub">Search every home by lot (B04-39 or 39), street address, owner, enrolment or case number.</p>
      <label className="box"><Search size={18} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="124 big dipper, B04-39, Smith, H3670987…" aria-label="Search homes" /></label>

      {q.trim().length >= 2 ? (
        <section className="panel">
          <h2>{busy ? 'Searching…' : `${hits.length} home${hits.length === 1 ? '' : 's'}`}</h2>
          {hits.map(h => (
            <button key={h.lot_id} className="row" onClick={() => nav(`/warranty/lots/${h.lot_id}`)}>
              <HomeIcon size={17} />
              <span className="mid"><b>{street(h.address) || `Lot ${h.lot_number}`}</b><small>{h.community} · Lot {h.lot_number}{h.owner ? ` · ${h.owner}` : ''}{h.enrollment ? ` · ${h.enrollment}` : ''}</small></span>
              <span className="tags">{h.open_cases > 0 && <i className="a">{h.open_cases} open</i>}{h.closed_cases > 0 && <i>{h.closed_cases} closed</i>}{h.conciliations > 0 && <i className="b">conc.</i>}</span>
            </button>
          ))}
          {!busy && !hits.length && <p className="sub" style={{ padding: '12px 4px' }}>No match. Try the street name only, or the lot number.</p>}
        </section>
      ) : (
        <section>
          <h2 style={{ margin: '22px 0 10px' }}>Or browse a community</h2>
          <div className="grid">
            {comms.map(c => (
              <button key={c.community_id} className="card" onClick={() => nav(`/warranty/communities/${c.community_id}`)}>
                <b>{c.name}</b><span>{c.lots.toLocaleString()} homes</span><small>{c.open_cases.toLocaleString()} open cases · {c.open_items.toLocaleString()} open items</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const CSS = `
.hx{max-width:1100px;margin:0 auto;padding:30px 28px 60px;font-family:var(--font-body);color:#1F2A3C}
.hx h1{font:800 30px var(--font-body);letter-spacing:-.02em}.hx h2{font:800 15px var(--font-body)}.hx .sub{color:#485163;font-size:14px;margin-top:6px}
.hx .box{display:flex;align-items:center;gap:10px;margin-top:20px;background:#F8F6F1;border:1px solid #C6BDAC;border-radius:10px;padding:0 16px;height:52px;box-shadow:0 1px 2px rgba(60,48,28,.06)}
.hx .box:focus-within{border-color:#3F6A8F;box-shadow:0 0 0 3px rgba(63,106,143,.18)}.hx .box svg{color:#6C7280;flex-shrink:0}
.hx .box input{flex:1;border:0;background:transparent;font:500 16px var(--font-body);color:#1F2A3C;outline:none}
.hx .panel{background:#F8F6F1;border:1px solid #D9D2C5;border-radius:10px;padding:14px 14px 8px;margin-top:16px}.hx .panel h2{margin:0 0 8px 4px}
.hx .row{display:flex;align-items:center;gap:12px;width:100%;border:0;border-top:1px solid #E6E0D5;background:transparent;padding:11px 8px;border-radius:6px;cursor:pointer;text-align:left;color:#3F6A8F;font-family:var(--font-body)}
.hx .row:hover{background:#EFEBE2}.hx .mid{flex:1;min-width:0}.hx .mid b{display:block;font:700 14px var(--font-body);color:#1F2A3C}.hx .mid small{display:block;font:500 12.5px var(--font-body);color:#485163;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hx .tags{display:flex;gap:5px;flex-shrink:0}.hx .tags i{font:700 11px var(--font-body);font-style:normal;padding:2px 8px;border-radius:999px;background:#E6E0D5;color:#485163}.hx .tags i.a{background:#E2EAF1;color:#2F5576}.hx .tags i.b{background:#F6ECD3;color:#8A4B0B}
.hx .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.hx .card{display:flex;flex-direction:column;gap:2px;text-align:left;background:#F8F6F1;border:1px solid #D9D2C5;border-radius:10px;padding:14px 16px;cursor:pointer;font-family:var(--font-body);color:#1F2A3C}
.hx .card:hover{border-color:#B8903F;box-shadow:0 2px 8px rgba(60,48,28,.08)}.hx .card b{font:800 15px var(--font-body)}.hx .card span{font:600 13px var(--font-body);color:#2F5576}.hx .card small{font:500 12px var(--font-body);color:#6C7280}
`;
