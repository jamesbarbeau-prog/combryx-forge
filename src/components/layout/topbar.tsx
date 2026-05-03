import { useState } from 'react';
import { Bell, Plus, Search, ChevronRight, HardHat, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import AskTheCodeSidebar from '@/components/askthecodesidebar';
import ForgeAssistant from '@/components/forgeassistant';
import QuickCreate from '@/components/quickcreate';

const BREADCRUMBS: Record<string, string[]> = {
  '/forge/dashboard':     ['Command Center', 'Dashboard'],
  '/forge/clients':       ['CRM', 'Clients'],
  '/forge/opportunities': ['CRM', 'Opportunities'],
  '/forge/quotes':        ['CRM', 'Quotes'],
  '/forge/projects':      ['Projects', 'All Projects'],
  '/forge/workorders':    ['Projects', 'Work Orders'],
  '/forge/dispatch':      ['Operations', 'Dispatch'],
  '/forge/procurement':   ['Financial', 'Procurement'],
  '/forge/invoices':      ['Financial', 'Invoices'],
  '/forge/reports':       ['System', 'Reports'],
  '/forge/automations':   ['System', 'Automations'],
  '/forge/settings':      ['System', 'Settings'],
  '/forge/mail':          ['Communications', 'Forge Mail'],
};

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const location  = useLocation();
  const crumbs    = BREADCRUMBS[location.pathname] ?? ['Forge', title];
  const [askOpen, setAskOpen]                   = useState(false);
  const [assistantOpen, setAssistantOpen]       = useState(false);
  const [quickCreateOpen, setQuickCreateOpen]   = useState(false);

  return (
    <>
      <AskTheCodeSidebar open={askOpen} onClose={() => setAskOpen(false)} />
      <ForgeAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <QuickCreate open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} />

      <header style={{
        height: 56, background: '#FFFFFF',
        borderBottom: '1px solid rgba(252,226,5,0.08)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 16,
        position: 'sticky', top: 0, zIndex: 20, flexShrink: 0,
      }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          {crumbs.map((crumb, i) => (
            <div key={crumb} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <ChevronRight size={12} color="#C8C2B4" />}
              <span style={{
                fontSize: i === crumbs.length - 1 ? 14 : 13,
                fontWeight: i === crumbs.length - 1 ? 700 : 400,
                color: i === crumbs.length - 1 ? '#111010' : '#8C8680',
                letterSpacing: i === crumbs.length - 1 ? '-0.01em' : 'normal',
              }}>
                {crumb}
              </span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 240 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8C8680' }} />
          <input
            style={{
              width: '100%', height: 34, paddingLeft: 30, paddingRight: 12,
              borderRadius: 8, border: '1px solid #E4E0D8',
              background: '#F6F4EF', fontSize: 12, color: '#111010',
              fontFamily: 'var(--font-body)', outline: 'none', transition: 'all 0.15s',
            }}
            placeholder="Search..."
            onFocus={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.15)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#E4E0D8'; e.currentTarget.style.background = '#F6F4EF'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>

        {/* Forge Assistant button */}
        <button
          onClick={() => setAssistantOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 8,
            background: 'rgba(30,95,164,0.08)',
            border: '1px solid rgba(30,95,164,0.2)',
            color: '#1E5FA4', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(30,95,164,0.14)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(30,95,164,0.08)'; }}
        >
          <Sparkles size={13} strokeWidth={1.5} />
          Forge AI
        </button>

        {/* Ask The Code button */}
        <button
          onClick={() => setAskOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 8,
            background: 'rgba(252,226,5,0.10)',
            border: '1px solid rgba(252,226,5,0.3)',
            color: '#8A7600', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(252,226,5,0.18)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(252,226,5,0.10)'; }}
        >
          <HardHat size={13} strokeWidth={1.5} />
          Ask The Code
        </button>

        {/* Bell */}
        <div style={{ position: 'relative' }}>
          <button style={{
            width: 36, height: 36, borderRadius: 8,
            border: '1px solid #E4E0D8', background: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.12s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.background = 'rgba(252,226,5,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E4E0D8'; e.currentTarget.style.background = '#FFFFFF'; }}
          >
            <Bell size={14} color="#4A4640" />
          </button>
          <div style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: '#FCE205', border: '1.5px solid #FFFFFF' }} />
        </div>

        {/* Quick Create */}
        <button
          className="forge-button forge-button--primary"
          style={{ gap: 6 }}
          onClick={() => setQuickCreateOpen(true)}
        >
          <Plus size={13} strokeWidth={2.5} /> Quick Create
        </button>
      </header>
    </>
  );
}