import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useauth';
import { qdef, DATA_SOURCE } from '@/lib/qdefclient';
import { RefreshCw } from 'lucide-react';

const today = new Date().toLocaleDateString('en-CA', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});

const NAV = [
  { id: 'today',       label: 'Today',        path: '/warranty/today'       },
  { id: 'communities', label: 'Portfolio',     path: '/warranty/communities' },
  { id: 'cases',       label: 'Cases',         path: '/warranty/cases'       },
  { id: 'work-orders', label: 'Work Orders',   path: '/warranty/work-orders' },
  { id: 'po-requests', label: 'PO Approvals',  path: '/warranty/po-requests' },
  { id: 'reports',     label: 'Reports',       path: '/warranty/reports'     },
  { id: 'settings',    label: 'Settings',      path: '/warranty/settings'    },
];

export default function WarrantyLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { signOut } = useAuth();
  const [syncing,      setSyncing]      = useState(false);
  const [lastSync,     setLastSync]     = useState<string | null>(null);
  const [syncStatus,   setSyncStatus]   = useState<'idle' | 'ok' | 'err'>('idle');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstall,   setShowInstall]   = useState(false);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); setShowInstall(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setShowInstall(false);
  }

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncStatus('idle');
    try {
      // Pull bootstrap (sites, lots, trades) — auto-syncs to Supabase
      await qdef.getBootstrap();
      // Pull recent deficiencies — auto-syncs to Supabase
      const since = lastSync || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await qdef.getDeficiencies(since);
      await qdef.getInspections(since);
      setLastSync(new Date().toLocaleTimeString());
      setSyncStatus('ok');
    } catch (e: any) {
      console.error('Sync failed:', e);
      setSyncStatus('err');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  }

  const syncBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 7,
    fontSize: 12, fontWeight: 700,
    cursor: syncing ? 'default' : 'pointer',
    fontFamily: 'var(--font-body)',
    transition: 'all 0.15s',
    background: syncStatus === 'ok'  ? 'rgba(22,163,74,0.15)'  :
                syncStatus === 'err' ? 'rgba(220,38,38,0.15)'  :
                'rgba(252,226,5,0.10)',
    border:     syncStatus === 'ok'  ? '1px solid rgba(22,163,74,0.3)'  :
                syncStatus === 'err' ? '1px solid rgba(220,38,38,0.3)'  :
                '1px solid rgba(252,226,5,0.25)',
    color:      syncStatus === 'ok'  ? '#16A34A' :
                syncStatus === 'err' ? '#DC2626'  :
                '#FCE205',
    opacity: syncing ? 0.7 : 1,
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-canvas)', fontFamily: 'var(--font-body)' }}>

      {/* ── TOP NAV ── */}
      <div style={{
        borderBottom: '1px solid rgba(252,226,5,0.10)',
        background: 'radial-gradient(ellipse at top left, #4A4D52 0%, #3A3C40 40%, #2E3033 100%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        padding: '0 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 56, position: 'sticky', top: 0, zIndex: 50,
      }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'linear-gradient(135deg, #FCE205 0%, #D4A800 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#111' }}>W</span>
            </div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#FCE205', letterSpacing: '-0.02em' }}>
                Combryx
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#FFFFFF', marginLeft: 6, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Warranty
              </span>
            </div>
          </div>

          {/* Data source pill */}
          <div style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            background: DATA_SOURCE === 'qdef' ? 'rgba(74,158,255,0.15)' : 'rgba(92,207,160,0.15)',
            border: DATA_SOURCE === 'qdef' ? '1px solid rgba(74,158,255,0.3)' : '1px solid rgba(92,207,160,0.3)',
            color: DATA_SOURCE === 'qdef' ? '#4A9EFF' : '#5CCFA0',
          }}>
            {DATA_SOURCE === 'qdef' ? '⚡ QDEF Live' : '✓ Supabase'}
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(252,226,5,0.15)' }} />

          {/* Nav */}
          {NAV.map(n => {
            const active =
              location.pathname === n.path ||
              (n.id === 'communities' && (
                location.pathname.startsWith('/warranty/communities') ||
                location.pathname.startsWith('/warranty/lots')
              )) ||
              (n.id === 'cases' && location.pathname.startsWith('/warranty/cases')) ||
              (n.id !== 'today' && n.id !== 'communities' && n.id !== 'cases' && location.pathname.startsWith(n.path));

            return (
              <button
                key={n.id}
                onClick={() => navigate(n.path)}
                style={{
                  padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  background: active ? 'rgba(252,226,5,0.15)' : 'transparent',
                  border: active ? '1px solid rgba(252,226,5,0.30)' : '1px solid transparent',
                  color: active ? '#FCE205' : 'rgba(255,255,255,0.85)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#FFFFFF'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
              >
                {n.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* QDEF Sync button */}
          <button onClick={handleSync} disabled={syncing} style={syncBtnStyle}>
            <RefreshCw
              size={11}
              style={{ animation: syncing ? 'spin 0.8s linear infinite' : 'none' }}
            />
            {syncing ? 'Syncing...' :
             syncStatus === 'ok'  ? '✓ Synced' :
             syncStatus === 'err' ? '✗ Failed' :
             '↓ Sync QDEF'}
            {lastSync && syncStatus === 'idle' && (
              <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>{lastSync}</span>
            )}
          </button>

          {showInstall && (
            <button onClick={installApp} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)',
              color: '#16A34A', cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>
              ⬇ Install App
            </button>
          )}

          {/* Date */}
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.4)',
            padding: '5px 10px', borderRadius: 6,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {today}
          </div>

          <button
            onClick={signOut}
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <Outlet />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}