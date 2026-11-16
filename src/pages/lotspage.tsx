/**
 * COMBRYX — Lots Page
 * Route: /warranty/communities/:projectId
 * Data: Supabase warranty_lots filtered by community_id
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Home, ChevronRight, ChevronLeft, RefreshCw, AlertTriangle, Search, Filter, Shield, Mail } from 'lucide-react';

const COMPANY_ID = 'c8bd8b99-090d-4379-86cd-95c3844c09f9';

interface Lot {
  id: string;
  lot_number: string;
  address: string | null;
  homeowner_name: string | null;
  homeowner_email: string | null;
  phone_primary: string | null;
  closing_date: string | null;
  enrollment_number: string | null;
  is_assigned: boolean;
  open_cases: number;
  total_cases: number;
}

export default function LotsPage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const [communityName, setCommunityName] = useState('Community');
  const [lots,          setLots]          = useState<Lot[]>([]);
  const [filtered,      setFiltered]      = useState<Lot[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [search,        setSearch]        = useState('');
  const [filter,        setFilter]        = useState<'all' | 'open' | 'assigned' | 'unassigned'>('all');

  useEffect(() => { if (projectId) load(); }, [projectId]);

  useEffect(() => {
    let result = lots;
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(l =>
        (l.lot_number ?? '').toLowerCase().includes(s) ||
        (l.homeowner_name ?? '').toLowerCase().includes(s) ||
        (l.address ?? '').toLowerCase().includes(s) ||
        (l.homeowner_email ?? '').toLowerCase().includes(s)
      );
    }
    if (filter === 'open')       result = result.filter(l => l.open_cases > 0);
    if (filter === 'assigned')   result = result.filter(l => l.is_assigned);
    if (filter === 'unassigned') result = result.filter(l => !l.is_assigned);
    setFiltered(result);
  }, [search, filter, lots]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      // Get community name
      const { data: comm } = await supabase
        .from('warranty_communities')
        .select('name')
        .eq('id', projectId!)
        .single();
      if (comm) setCommunityName(comm.name);

      // Get lots for this community
      const { data: lotsData, error: lotsErr } = await supabase
        .from('warranty_lots')
        .select('id, lot_number, address, homeowner_name, homeowner_email, phone_primary, closing_date, enrollment_number, is_assigned')
        .eq('community_id', projectId!)
        .eq('company_id', COMPANY_ID)
        .order('lot_number');

      if (lotsErr) throw new Error(lotsErr.message);
      if (!lotsData || lotsData.length === 0) { setLots([]); setFiltered([]); setLoading(false); return; }

      // Get open case counts per lot
      const lotIds = lotsData.map(l => l.id);
      const { data: cases } = await supabase
        .from('cases')
        .select('lot_id, status')
        .in('lot_id', lotIds)
        .is('deleted_at', null);

      const openMap:  Record<string, number> = {};
      const totalMap: Record<string, number> = {};
      for (const c of (cases ?? []) as { lot_id: string; status: string }[]) {
        totalMap[c.lot_id] = (totalMap[c.lot_id] ?? 0) + 1;
        if (!['closed', 'voided', 'resolved'].includes(c.status)) {
          openMap[c.lot_id] = (openMap[c.lot_id] ?? 0) + 1;
        }
      }

      const withStats: Lot[] = lotsData.map(l => ({
        ...l,
        open_cases:  openMap[l.id]  ?? 0,
        total_cases: totalMap[l.id] ?? 0,
      }));

      // Sort: open cases first, then assigned, then by lot number
      withStats.sort((a, b) => {
        if (b.open_cases !== a.open_cases) return b.open_cases - a.open_cases;
        if (b.is_assigned !== a.is_assigned) return b.is_assigned ? 1 : -1;
        return (a.lot_number ?? '').localeCompare(b.lot_number ?? '', undefined, { numeric: true });
      });

      setLots(withStats);
      setFiltered(withStats);
    } catch (e: any) {
      setError(e.message || 'Failed to load lots');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <RefreshCw size={24} color="var(--color-muted)" style={{ animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading {communityName}…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const openCount      = lots.filter(l => l.open_cases > 0).length;
  const assignedCount  = lots.filter(l => l.is_assigned).length;

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200, fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => navigate('/warranty/communities')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 12, fontFamily: 'var(--font-body)', padding: '4px 8px', borderRadius: 6 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
        >
          <ChevronLeft size={13} /> Portfolio
        </button>
        <span style={{ color: 'var(--color-border)', fontSize: 12 }}>/</span>
        <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 600 }}>{communityName}</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>{communityName}</h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            {lots.length} lots · {assignedCount} with owners · {openCount} with open cases
          </p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, marginBottom: 20, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <AlertTriangle size={14} color="#A5402F" />
          <p style={{ fontSize: 12, color: '#A5402F' }}>{error}</p>
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={13} color="var(--color-muted)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search lot number, owner, address…"
            style={{ width: '100%', height: 36, paddingLeft: 32, paddingRight: 12, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-panel)', color: 'var(--color-text)', fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        {(['all', 'open', 'assigned', 'unassigned'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
            background: filter === f ? 'rgba(63,106,143,0.12)' : 'var(--color-panel)',
            border: filter === f ? '1px solid rgba(63,106,143,0.3)' : '1px solid var(--color-border)',
            color: filter === f ? '#2F5576' : 'var(--color-muted)',
          }}>
            {f === 'all' ? 'All' : f === 'open' ? 'Open cases' : f === 'assigned' ? 'With owners' : 'Unassigned'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--color-panel)', border: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-muted)' }}>
          <Filter size={12} /> {filtered.length} of {lots.length}
        </div>
      </div>

      {/* Lots table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-muted)', fontSize: 13 }}>
          {search ? `No lots matching "${search}"` : 'No lots found for this community'}
        </div>
      ) : (
        <div style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 180px 120px 100px 80px 36px', padding: '10px 16px', background: 'var(--color-mist)', borderBottom: '1px solid var(--color-border)' }}>
            {['Lot #', 'Owner / Address', 'Email', 'Phone', 'Closing', 'Cases', ''].map(h => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{h}</span>
            ))}
          </div>

          {filtered.map((lot, i) => (
            <div
              key={lot.id}
              onClick={() => navigate(`/warranty/lots/${lot.id}`)}
              style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 180px 120px 100px 80px 36px',
                padding: '13px 16px', alignItems: 'center', cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                background: lot.open_cases > 0 ? 'rgba(232,160,64,0.02)' : 'transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-mist)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = lot.open_cases > 0 ? 'rgba(232,160,64,0.02)' : 'transparent'; }}
            >
              {/* Lot number */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: lot.open_cases > 0 ? 'rgba(232,160,64,0.12)' : lot.is_assigned ? 'rgba(92,207,160,0.12)' : 'var(--color-mist)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Home size={12} color={lot.open_cases > 0 ? '#B08D4F' : lot.is_assigned ? '#5CCFA0' : 'var(--color-muted)'} strokeWidth={1.5} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>{lot.lot_number}</span>
              </div>

              {/* Owner + address */}
              <div style={{ paddingRight: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: lot.homeowner_name ? 'var(--color-text)' : 'var(--color-muted)', fontStyle: lot.homeowner_name ? 'normal' : 'italic', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lot.homeowner_name ?? 'Unassigned'}
                </p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lot.address ?? '—'}
                </p>
              </div>

              {/* Email */}
              <div style={{ overflow: 'hidden' }}>
                {lot.homeowner_email ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Mail size={10} color="var(--color-muted)" />
                    <span style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lot.homeowner_email}</span>
                  </div>
                ) : <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>}
              </div>

              {/* Phone */}
              <span style={{ fontSize: 10, color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lot.phone_primary ?? '—'}
              </span>

              {/* Closing */}
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                {lot.closing_date ? new Date(lot.closing_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short' }) : '—'}
              </span>

              {/* Cases */}
              <div>
                {lot.total_cases > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Shield size={10} color={lot.open_cases > 0 ? '#B08D4F' : 'var(--color-muted)'} />
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: lot.open_cases > 0 ? '#B08D4F' : 'var(--color-muted)' }}>
                      {lot.open_cases > 0 ? lot.open_cases : lot.total_cases}
                    </span>
                    {lot.open_cases === 0 && <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>done</span>}
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>—</span>
                )}
              </div>

              <ChevronRight size={14} color="var(--color-muted)" />
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}