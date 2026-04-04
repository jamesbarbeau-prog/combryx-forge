import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useauth';
import { useFeatureStore } from '@/store/featurestore';
import {
  LayoutDashboard, Users, Briefcase, FileText, FolderOpen,
  Hammer, ShoppingCart, Receipt, BarChart2, Settings,
  ChevronRight, Zap, Radio, Bell, LogOut, Shield,
} from 'lucide-react';

function UserMenu({ user, signOut }: { user: any; signOut: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const MENU_ITEMS = [
    { label: 'Profile & Settings', icon: Settings, action: () => { setOpen(false); navigate('/forge/settings'); } },
    { label: 'Security & MFA',     icon: Shield,   action: () => { setOpen(false); navigate('/forge/mfa-setup'); } },
    { label: 'Notifications',      icon: Bell,     action: () => { setOpen(false); } },
  ];

  return (
    <div style={{ position: 'relative', padding: '12px 14px', borderTop: '1px solid rgba(252,226,5,0.08)', background: 'rgba(0,0,0,0.15)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(252,226,5,0.15)',
          border: '1px solid rgba(252,226,5,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, color: '#FCE205', flexShrink: 0,
        }}>
          {user?.email?.slice(0, 2).toUpperCase() ?? 'AD'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', lineHeight: 1 }}>
            {user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Admin'}
          </p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email ?? ''}
          </p>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
            background: open ? 'rgba(252,226,5,0.15)' : 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.12s',
          }}
        >
          <Settings size={12} color="rgba(212,175,55,0.7)" />
        </button>
      </div>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', bottom: '100%', left: 14, right: 14,
            marginBottom: 8, zIndex: 50,
            background: '#1E1C1A',
            border: '1px solid rgba(252,226,5,0.15)',
            borderRadius: 10,
            boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(252,226,5,0.05)',
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#FCE205' }}>
                {user?.user_metadata?.full_name ?? 'Admin'}
              </p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                {user?.email}
              </p>
            </div>

            {MENU_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.action}
                  style={{
                    width: '100%', padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'none', border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.65)',
                    fontSize: 12, cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    textAlign: 'left', transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(252,226,5,0.08)'; e.currentTarget.style.color = '#FCE205'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
                >
                  <Icon size={12} strokeWidth={1.5} />
                  {item.label}
                </button>
              );
            })}

            <button
              onClick={() => { setOpen(false); signOut(); }}
              style={{
                width: '100%', padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'none', border: 'none',
                color: '#F05252', fontSize: 12, cursor: 'pointer',
                fontFamily: 'var(--font-body)', textAlign: 'left',
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(240,82,82,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <LogOut size={12} strokeWidth={1.5} />
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const { features, fetchFeatures } = useFeatureStore();

  useEffect(() => { fetchFeatures(); }, []);

  const NAV = [
    {
      section: 'Command',
      items: [
        { label: 'Dashboard', path: '/forge/dashboard', icon: LayoutDashboard },
        ...(features.dispatch ? [{ label: 'Dispatch', path: '/forge/dispatch', icon: Radio }] : []),
      ],
    },
    {
      section: 'CRM',
      items: [
        { label: 'Clients', path: '/forge/clients', icon: Users },
        ...(features.opportunities ? [{ label: 'Opportunities', path: '/forge/opportunities', icon: Briefcase }] : []),
        ...(features.quotes        ? [{ label: 'Quotes',        path: '/forge/quotes',        icon: FileText  }] : []),
      ],
    },
    {
      section: 'Projects',
      items: [
        { label: 'All Projects', path: '/forge/projects', icon: FolderOpen },
        ...(features.dispatch ? [{ label: 'Work Orders', path: '/forge/workorders', icon: Hammer }] : []),
      ],
    },
    {
      section: 'Financial',
      items: [
        ...(features.procurement ? [{ label: 'Procurement', path: '/forge/procurement', icon: ShoppingCart }] : []),
        { label: 'Invoices', path: '/forge/invoices', icon: Receipt },
        ...(features.reports ? [{ label: 'Reports', path: '/forge/reports', icon: BarChart2 }] : []),
      ],
    },
    {
      section: 'System',
      items: [
        ...(features.automations ? [{ label: 'Automations', path: '/forge/automations', icon: Zap }] : []),
        { label: 'Settings', path: '/forge/settings', icon: Settings },
      ],
    },
  ].filter(group => group.items.length > 0);

  return (
    <aside style={{
      width: 224,
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top left, #4A4D52 0%, #3A3C40 40%, #2E3033 100%)',
      borderRight: '1px solid rgba(252,226,5,0.10)',
      boxShadow: '4px 0 24px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>

      {/* Logo */}
      <div style={{
        padding: '18px 16px',
        borderBottom: '1px solid rgba(252,226,5,0.08)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, background: '#FCE205', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 15px rgba(252,226,5,0.30), 0 0 0 1px rgba(252,226,5,0.2)',
          flexShrink: 0,
        }}>
          <Hammer size={15} color="#1A1A1B" strokeWidth={2.5} />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Combryx
          </p>
          <p style={{ fontSize: 9, fontWeight: 700, color: '#FCE205', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 2 }}>
            Forge
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {NAV.map(group => (
          <div key={group.section} style={{ marginBottom: 2 }}>
            <p style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)',
              padding: '10px 18px 4px',
            }}>
              {group.section}
            </p>
            {group.items.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '8px 10px 8px 14px', margin: '1px 8px',
                    borderRadius: 7, fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#FCE205' : 'rgba(255,255,255,0.75)',
                    background: isActive ? 'rgba(252,226,5,0.12)' : 'transparent',
                    border: isActive ? '1px solid rgba(252,226,5,0.25)' : '1px solid transparent',
                    textDecoration: 'none', transition: 'all 0.12s ease',
                    boxShadow: isActive ? '0 0 12px rgba(252,226,5,0.12), inset 0 0 16px rgba(252,226,5,0.04)' : 'none',
                  })}
                  onMouseEnter={e => {
                    const el = e.currentTarget;
                    if (!el.className.includes('active')) {
                      el.style.background = 'rgba(255,255,255,0.06)';
                      el.style.color = '#FFFFFF';
                    }
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget;
                    if (!el.className.includes('active')) {
                      el.style.background = 'transparent';
                      el.style.color = 'rgba(255,255,255,0.75)';
                    }
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={14} color={isActive ? '#FCE205' : 'rgba(255,255,255,0.45)'} strokeWidth={isActive ? 2.2 : 1.6} />
                      <span style={{ flex: 1, letterSpacing: '0.01em' }}>{item.label}</span>
                      {isActive && <ChevronRight size={11} color="#FCE205" strokeWidth={2} />}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <UserMenu user={user} signOut={signOut} />
    </aside>
  );
}