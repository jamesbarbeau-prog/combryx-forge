import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useauth';
import MailPage from '@/pages/mailpage';


const today = new Date().toLocaleDateString('en-CA', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});

const NAV = [
  { id: 'today',       label: 'Today',       path: '/warranty/today'       },
  { id: 'communities', label: 'Communities',  path: '/warranty/communities' },
  { id: 'lots',        label: 'Lots',         path: '/warranty/lots'        },
  { id: 'cases',       label: 'Cases',        path: '/warranty/cases'       },
  { id: 'work-orders', label: 'Work Orders',  path: '/warranty/work-orders' },
  { id: 'po-requests', label: 'PO Requests',  path: '/warranty/po-requests' },
  { id: 'settlements', label: 'Settlements',  path: '/warranty/settlements' },
  { id: 'reports',     label: 'Reports',      path: '/warranty/reports'     },
  { id: 'settings',    label: 'Settings',     path: '/warranty/settings'    },
];

export default function WarrantyLayout() {
    
  const navigate  = useNavigate();
  const location  = useLocation();
  const { signOut } = useAuth();
  const [mailOpen, setMailOpen]       = useState(false);
  const [mailMinimized, setMailMin]   = useState(false);
  const [mailUnread]                  = useState(3);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
const [showInstall, setShowInstall]     = useState(false);

useEffect(() => {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    setInstallPrompt(e);
    setShowInstall(true);
  });
}, []);

async function installApp() {
  if (!installPrompt) return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  if (outcome === 'accepted') setShowInstall(false);
}

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-canvas)', fontFamily: 'var(--font-body)' }}>

      {/* ── TOP NAV ── */}
      <div style={{
        borderBottom: '1px solid rgba(252,226,5,0.10)',
        background: 'radial-gradient(ellipse at top left, #4A4D52 0%, #3A3C40 40%, #2E3033 100%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        padding: '0 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        position: 'sticky',
        top: 0,
        zIndex: 50,
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
              <span style={{ fontSize: 13, fontWeight: 800, color: '#FCE205', letterSpacing: '-0.02em' }}>Combryx</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#FFFFFF', marginLeft: 6, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Warranty</span>
            </div>
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(252,226,5,0.15)' }} />

          {/* Nav items */}
          {NAV.map(n => {
            const active = location.pathname === n.path ||
              (n.id !== 'today' && location.pathname.startsWith(n.path));
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

          {/* Pull BuilderLink */}
          <button style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
            background: 'rgba(252,226,5,0.10)', border: '1px solid rgba(252,226,5,0.25)',
            color: '#FCE205', cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}>
            ↓ Sync BuilderLink
          </button>

          {/* Mail button — toggles floating panel */}
          <button
            onClick={() => { setMailOpen(o => !o); setMailMin(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              background: mailOpen ? 'rgba(107,163,214,0.20)' : 'rgba(255,255,255,0.08)',
              border: mailOpen ? '1px solid rgba(107,163,214,0.35)' : '1px solid rgba(255,255,255,0.12)',
              color: mailOpen ? '#6BA3D6' : 'rgba(255,255,255,0.7)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              position: 'relative',
            }}
          >
            ✉ Mail
            {mailUnread > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                width: 16, height: 16, borderRadius: '50%',
                background: '#FF3B3B', fontSize: 9, fontWeight: 900,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #3A3C40',
              }}>
                {mailUnread}
              </span>
            )}
          </button>
          {showInstall && (
  <button
    onClick={installApp}
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
      background: 'rgba(22,163,74,0.15)',
      border: '1px solid rgba(22,163,74,0.3)',
      color: '#16A34A', cursor: 'pointer',
      fontFamily: 'var(--font-body)',
      animation: 'pulse 2s infinite',
    }}
  >
    ⬇ Install Desktop App
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

      {/* ── PAGE CONTENT ── */}
      <Outlet />

      {/* ── FLOATING MAIL PANEL ── */}
      {mailOpen && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          right: 24,
          width: mailMinimized ? 280 : 720,
          height: mailMinimized ? 44 : 560,
          background: 'var(--color-panel)',
          border: '1px solid var(--color-border)',
          borderBottom: 'none',
          borderRadius: '12px 12px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.2s ease, height 0.2s ease',
        }}>

          {/* Mail panel header — taskbar style */}
          <div style={{
            height: 44,
            background: 'radial-gradient(ellipse at top left, #4A4D52 0%, #3A3C40 40%, #2E3033 100%)',
            borderBottom: mailMinimized ? 'none' : '1px solid rgba(252,226,5,0.10)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            gap: 10,
            cursor: 'pointer',
            flexShrink: 0,
          }}
            onClick={() => setMailMin(m => !m)}
          >
            <span style={{ fontSize: 13, color: '#6BA3D6' }}>✉</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', flex: 1 }}>
              Forge Mail
            </span>
            {mailUnread > 0 && (
              <span style={{
                padding: '1px 7px', borderRadius: 100, fontSize: 10, fontWeight: 800,
                background: '#FF3B3B', color: '#fff',
              }}>
                {mailUnread} new
              </span>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Minimize / restore */}
              <button
                onClick={e => { e.stopPropagation(); setMailMin(m => !m); }}
                style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.6)', fontSize: 12,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'monospace',
                }}
                title={mailMinimized ? 'Restore' : 'Minimize'}
              >
                {mailMinimized ? '▲' : '▼'}
              </button>
              {/* Pop out to new tab */}
              <button
                onClick={e => { e.stopPropagation(); window.open('/warranty/mail-window', '_blank', 'width=1100,height=700'); }}
                style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.6)', fontSize: 11,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="Open in new window"
              >
                ⤢
              </button>
              {/* Close */}
              <button
                onClick={e => { e.stopPropagation(); setMailOpen(false); }}
                style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: 'rgba(255,59,59,0.15)',
                  border: '1px solid rgba(255,59,59,0.25)',
                  color: '#FF3B3B', fontSize: 14,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Mail content */}
          {!mailMinimized && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <iframe
                src="/warranty/mail"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: 'var(--color-canvas)',
                }}
                title="Forge Mail"
              />
            </div>
          )}
        </div>
      )}

      {/* Minimized taskbar pills (when mail is minimized) */}
      {mailOpen && mailMinimized && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          right: 24,
          zIndex: 200,
        }}>
          {/* Already rendered above as minimized panel */}
        </div>
      )}
    </div>
  );
}