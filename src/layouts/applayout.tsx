import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/topbar';

const TITLES: Record<string, string> = {
  '/forge/dashboard': 'Dashboard',
  '/forge/clients': 'Clients',
  '/forge/opportunities': 'Opportunities',
  '/forge/quotes': 'Quotes',
  '/forge/projects': 'Projects',
  '/forge/dispatch': 'Dispatch',
  '/forge/procurement': 'Procurement',
  '/forge/invoices': 'Invoices',
  '/forge/reports': 'Reports',
  '/forge/automations': 'Automations',
  '/forge/settings': 'Settings',
  '/forge/mail': 'Mail',
};

export function AppLayout() {
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
    </div>
  );
}