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
  const isWarranty = location.pathname.startsWith('/warranty');

  if (isWarranty) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-canvas)' }}>
        <Outlet />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar />
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
