import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/topbar';
import { useState } from 'react';
import ForgeAssistant from '@/components/forgeassistant';
import { Sparkles } from 'lucide-react';

const TITLES: Record<string, string> = {
  '/forge/dashboard': 'Dashboard',
  '/forge/clients': 'Clients',
  '/forge/opportunities': 'Opportunities',
  '/forge/quotes': 'Quotes',
  '/forge/proposals': 'Proposals',
  '/forge/projects': 'Projects',
  '/forge/scope-documents': 'Scope & Documents',
  '/forge/schedule': 'Schedule',
  '/forge/work-orders': 'Work Orders',
  '/forge/field-activity': 'Field Activity',
  '/forge/issues': 'Issues',
  '/forge/procurement': 'Procurement',
  '/forge/financials': 'Financials',
  '/forge/holdback': 'Holdback',
  '/forge/closeout': 'Closeout',
  '/forge/automation': 'Automation',
  '/forge/reports': 'Reports',
  '/forge/audit-trail': 'Audit Trail',
  '/forge/team': 'Team',
  '/forge/templates': 'Templates',
  '/forge/plans-entitlements': 'Plans & Entitlements',
  '/forge/settings': 'Settings',
};

export function AppLayout() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const location = useLocation();
  const title = TITLES[location.pathname] ?? 'Forge';

  return (
    <div className="forge-app-shell">
      <Sidebar />
      <div className="forge-app-shell__main">
        <TopBar title={title} />
        <main className="forge-app-shell__content">
          <Outlet />
        </main>
      </div>

      <ForgeAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />

      <button
        onClick={() => setAssistantOpen(true)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 80,
          width: 52, height: 52, borderRadius: '50%',
          background: '#1E5FA4',
          border: '2px solid rgba(255,255,255,0.15)',
          boxShadow: '0 4px 20px rgba(30,95,164,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(30,95,164,0.5)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(30,95,164,0.4)'; }}
        title="Forge Assistant"
      >
        <Sparkles size={22} color="#FFFFFF" strokeWidth={1.5} />
      </button>
    </div>
          
  );
}