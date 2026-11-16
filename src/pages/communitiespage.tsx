import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Building2, ChevronRight, RefreshCw, AlertTriangle, Home, Shield } from 'lucide-react';

const PROJECT_COLORS: Record<string, string> = {
  '75fa72fe-332f-4dca-afbb-c2968c9d5594': '#5B87AD',
  'a390c161-78ae-4045-b545-3deb7e49cba0': '#5CCFA0',
  'd2dd2755-a598-4b42-bcfe-1af4a742a5f6': '#B08D4F',
  '74fd3c76-8692-4988-a190-9283a3cd3566': '#C97BFF',
  '2f24cdcb-87dc-4a5b-82a8-bb1cc704c6c3': '#FF7B7B',
  '43f0c1af-0a9f-4155-aee5-f23f33970fa6': '#FFD700',
  '8ebfe175-35bb-4505-ba5e-6f19826ada9f': '#FF9F40',
  'ce14b818-68a4-4357-add4-12baea2236c0': '#40E0D0',
  'e1981d6e-fcf5-4d28-82f4-7e0932e9d0f4': '#98D85B',
};

interface Community {
  id: string;
  name: string;
  lot_count: number;
  assigned_count: number;
  open_cases: number;
}

export default function CommunitiesPage() {
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);

  // 1. Resolve the signed-in user's company
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      supabase.from('users').select('company_id').eq('id', user.id).single()
        .then(({ data, error: err }) => {
          if (data?.company_id) setCompanyId(data.company_id);
          else { setError(err?.message || 'No company found for this user'); setLoading(false); }
        });
    });
  }, []);

  // 2. Load data once companyId is available
  useEffect(() => {
    if (companyId) {
      load();
    }
  }, [companyId]);

  async function load() {
    if (!companyId) return;
    
    setLoading(true);
    setError('');
    try {
      const { data: comms, error: commErr } = await supabase
        .from('warranty_communities')
        .select('id, name')
        .eq('company_id', companyId) // Using dynamic ID
        .order('name');

      if (commErr) throw new Error(commErr.message);
      if (!comms || comms.length === 0) {
        setCommunities([]);
        return;
      }

      const commIds = comms.map(c => c.id);

      const [{ data: lotCounts }, { data: caseCounts }] = await Promise.all([
        supabase.rpc('get_community_lot_counts', { community_ids: commIds }),
        supabase.rpc('get_community_case_counts', { community_ids: commIds })
      ]);

      const openCases: Record<string, number> = {};
      (caseCounts ?? []).forEach((r: { community_id: string; open_case_count: number }) => {
        openCases[r.community_id] = Number(r.open_case_count);
      });

      setCommunities(comms.map(c => {
        const counts = (lotCounts ?? []).find((r: any) => r.community_id === c.id);
        return {
          id: c.id,
          name: c.name,
          lot_count: Number(counts?.lot_count ?? 0),
          assigned_count: Number(counts?.assigned_count ?? 0),
          open_cases: openCases[c.id] ?? 0,
        };
      }));
    } catch (e: any) {
      setError(e.message || 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }

  const totalLots = communities.reduce((s, c) => s + c.lot_count, 0);
  const totalCases = communities.reduce((s, c) => s + c.open_cases, 0);
  const totalOwned = communities.reduce((s, c) => s + c.assigned_count, 0);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <RefreshCw size={24} color="var(--color-muted)" style={{ animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading portfolio…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 10, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', maxWidth: 500 }}>
        <AlertTriangle size={16} color="#A5402F" />
        <p style={{ fontSize: 13, color: '#A5402F' }}>{error}</p>
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', color: '#A5402F', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          Retry
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.03em', marginBottom: 4 }}>
            Portfolio
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            {communities.length} communities · {totalLots} lots · {totalOwned} with owners
          </p>
        </div>
        <button
          onClick={load}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Communities', value: communities.length, icon: Building2, color: '#8A7600' },
          { label: 'Total Lots', value: totalLots, icon: Home, color: '#5B87AD' },
          { label: 'Open Cases', value: totalCases, icon: Shield, color: totalCases > 0 ? '#B08D4F' : '#5CCFA0' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={16} color={color} strokeWidth={1.5} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Community cards */}
      {communities.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Building2 size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>No communities yet</p>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 20 }}>Import your QDef purchaser CSVs to get started.</p>
          <button
            onClick={() => navigate('/warranty/qdef-import')}
            style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'rgba(74,158,255,0.1)', border: '1px solid rgba(74,158,255,0.3)', color: '#5B87AD', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >
            Go to QDef import
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 14 }}>
          {communities.map(community => {
            const color = PROJECT_COLORS[community.id] || '#8A7600';
            return (
              <div
                key={community.id}
                onClick={() => navigate(`/warranty/communities/${community.id}`)}
                style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '20px 22px', cursor: 'pointer', transition: 'all 0.15s', position: 'relative', overflow: 'hidden' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = color + '60'; el.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--color-border)'; el.style.transform = 'none'; }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '12px 12px 0 0' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Building2 size={16} color={color} strokeWidth={1.5} />
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3 }}>
                        {community.name}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>{community.lot_count}</p>
                        <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>Lots</p>
                      </div>
                      <div style={{ width: 1, height: 28, background: 'var(--color-border)' }} />
                      <div>
                        <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>{community.assigned_count}</p>
                        <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>Owners</p>
                      </div>
                      <div style={{ width: 1, height: 28, background: 'var(--color-border)' }} />
                      <div>
                        <p style={{ fontSize: 20, fontWeight: 800, color: community.open_cases > 0 ? '#B08D4F' : '#5CCFA0', lineHeight: 1 }}>{community.open_cases}</p>
                        <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>Open cases</p>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} color="var(--color-muted)" style={{ marginTop: 4, flexShrink: 0 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
