import {
  Archive,
  BarChart3,
  Blocks,
  Briefcase,
  CalendarDays,
  Camera,
  ClipboardList,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  Library,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';

export type ForgeNavItem = {
  label: string;
  path: string;
  icon: any;
};

export type ForgeNavGroup = {
  heading: string;
  items: ForgeNavItem[];
};

export const FORGE_NAV: ForgeNavGroup[] = [
  {
    heading: 'Home',
    items: [{ label: 'Dashboard', path: '/forge/dashboard', icon: LayoutDashboard }],
  },
  {
    heading: 'CRM',
    items: [
      { label: 'Clients', path: '/forge/clients', icon: Users },
      { label: 'Opportunities', path: '/forge/opportunities', icon: Briefcase },
      { label: 'Quotes', path: '/forge/quotes', icon: FileText },
      { label: 'Proposals', path: '/forge/proposals', icon: ScrollText },
    ],
  },
  {
    heading: 'Delivery',
    items: [
      { label: 'Projects', path: '/forge/projects', icon: FolderKanban },
      { label: 'Scope & Documents', path: '/forge/scope-documents', icon: ScrollText },
      { label: 'Schedule', path: '/forge/schedule', icon: CalendarDays },
      { label: 'Work Orders', path: '/forge/work-orders', icon: ClipboardList },
      { label: 'Field Activity', path: '/forge/field-activity', icon: Camera },
      { label: 'Issues', path: '/forge/issues', icon: TriangleAlert },
    ],
  },
  {
    heading: 'Financial Control',
    items: [
      { label: 'Procurement', path: '/forge/procurement', icon: Package },
      { label: 'Financials', path: '/forge/financials', icon: Wallet },
      { label: 'Holdback', path: '/forge/holdback', icon: ShieldCheck },
      { label: 'Closeout', path: '/forge/closeout', icon: Archive },
    ],
  },
  {
    heading: 'Intelligence',
    items: [
      { label: 'Automation', path: '/forge/automation', icon: Zap },
      { label: 'Reports', path: '/forge/reports', icon: BarChart3 },
      { label: 'Audit Trail', path: '/forge/audit-trail', icon: History },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { label: 'Team', path: '/forge/team', icon: UserCog },
      { label: 'Templates', path: '/forge/templates', icon: Library },
      { label: 'Plans & Entitlements', path: '/forge/plans-entitlements', icon: Blocks },
      { label: 'Settings', path: '/forge/settings', icon: Settings },
      { label: 'Clients', path: '/forge/clients', icon: 'Users' }
    ],
  },
];