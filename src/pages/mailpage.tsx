import { useState } from 'react';
import type React from 'react';
import {
  Inbox, Star, FileText, Archive,
  Search, Plus, Paperclip,
  Send, MoreHorizontal, Link2,
  User, AlertTriangle,
  Mail, Sparkles, X,
  FolderOpen, Receipt, Shield,
} from 'lucide-react';

/* ── Types ── */
type Hive = 'all' | 'client' | 'supplier' | 'legal' | 'warranty';
type MessageStatus = 'new' | 'inprogress' | 'waiting' | 'closed';
type MessageType = 'lead' | 'quote' | 'warranty' | 'invoice' | 'general';

interface MockMessage {
  id: string;
  from: string;
  fromEmail: string;
  subject: string;
  preview: string;
  body: string;
  timestamp: string;
  read: boolean;
  starred: boolean;
  status: MessageStatus;
  type: MessageType;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  attachments?: string[];
  thread?: { from: string; body: string; timestamp: string; isMe?: boolean }[];
}

/* ── Mock data ── */
const MOCK_MESSAGES: MockMessage[] = [
  {
    id: '1',
    from: 'Robert Henderson',
    fromEmail: 'rhenderson@gmail.com',
    subject: 'Re: Kitchen renovation — permit question',
    preview: 'Hi, just wanted to follow up on the permit status. Our inspector said...',
    body: 'Hi James,\n\nJust wanted to follow up on the permit status for the kitchen renovation. Our inspector mentioned there may be an issue with the egress window sizing in the basement bedroom.\n\nCan you confirm what the OBC requires for that? We want to make sure we\'re compliant before the next inspection.\n\nThanks,\nRobert',
    timestamp: '10:42 am',
    read: false,
    starred: true,
    status: 'new',
    type: 'general',
    clientName: 'Robert Henderson',
    projectName: 'Henderson Kitchen Reno',
    attachments: ['permit_application.pdf'],
    thread: [
      { from: 'James Barbeau', body: 'Hi Robert, I\'ve submitted the permit application and we\'re waiting on approval. Should be 5-7 business days.', timestamp: 'Yesterday 3:12 pm', isMe: true },
      { from: 'Robert Henderson', body: 'Thanks James. Any update on the timeline? We\'re trying to plan around the inspection.', timestamp: 'Yesterday 4:45 pm' },
      { from: 'James Barbeau', body: 'Still waiting. I\'ll follow up with the building department tomorrow morning.', timestamp: 'Today 8:30 am', isMe: true },
      { from: 'Robert Henderson', body: 'Hi James,\n\nJust wanted to follow up on the permit status for the kitchen renovation. Our inspector mentioned there may be an issue with the egress window sizing in the basement bedroom.\n\nCan you confirm what the OBC requires for that? We want to make sure we\'re compliant before the next inspection.\n\nThanks,\nRobert', timestamp: 'Today 10:42 am' },
    ]
  },
  {
    id: '2',
    from: 'Sarah Morrison',
    fromEmail: 's.morrison@outlook.com',
    subject: 'Invoice INV-088 — Payment Question',
    preview: 'I received the invoice but I have a question about the holdback amount...',
    body: 'Hi,\n\nI received invoice INV-088 and noticed there is a holdback amount of $4,200 listed. Can you explain what this is for and when it will be released?\n\nThanks,\nSarah Morrison',
    timestamp: '9:15 am',
    read: false,
    starred: false,
    status: 'new',
    type: 'invoice',
    clientName: 'Sarah Morrison',
    projectName: 'Morrison Basement',
    thread: [
      { from: 'Sarah Morrison', body: 'Hi,\n\nI received invoice INV-088 and noticed there is a holdback amount of $4,200 listed. Can you explain what this is for and when it will be released?\n\nThanks,\nSarah Morrison', timestamp: 'Today 9:15 am' },
    ]
  },
  {
    id: '3',
    from: 'Mike Nguyen',
    fromEmail: 'mike.nguyen@rogers.com',
    subject: 'Deck issue — water coming in',
    preview: 'There\'s water getting under the deck boards after the rain last week...',
    body: 'Hi James,\n\nWe\'ve noticed water is getting under the deck boards after last week\'s rain. There\'s some pooling near the ledger board and I\'m worried about rot.\n\nThis deck was built last summer. Can you come take a look?\n\nMike',
    timestamp: 'Yesterday',
    read: true,
    starred: false,
    status: 'inprogress',
    type: 'warranty',
    clientName: 'Mike Nguyen',
    projectName: 'Nguyen Deck Build',
    attachments: ['photo1.jpg', 'photo2.jpg'],
    thread: [
      { from: 'Mike Nguyen', body: 'Hi James,\n\nWe\'ve noticed water is getting under the deck boards after last week\'s rain. There\'s some pooling near the ledger board and I\'m worried about rot.\n\nThis deck was built last summer. Can you come take a look?\n\nMike', timestamp: 'Yesterday 2:30 pm' },
      { from: 'James Barbeau', body: 'Hi Mike, thanks for reaching out. I\'ll have someone come by Thursday to assess. Can you send more photos in the meantime?', timestamp: 'Yesterday 4:00 pm', isMe: true },
    ]
  },
  {
    id: '4',
    from: 'BuildRight Supplies',
    fromEmail: 'orders@buildright.ca',
    subject: 'PO-2024-089 — Delivery Confirmation',
    preview: 'Your order of framing lumber has been confirmed for delivery...',
    body: 'Hello,\n\nYour order PO-2024-089 for framing lumber (240 LF 2x6, 180 LF 2x4) has been confirmed for delivery on Friday between 7am-10am.\n\nPlease ensure someone is on site to receive the delivery.\n\nBuildRight Supplies',
    timestamp: 'Yesterday',
    read: true,
    starred: false,
    status: 'waiting',
    type: 'general',
    clientName: 'BuildRight Supplies',
    projectName: 'Riverside Addition',
    thread: [
      { from: 'BuildRight Supplies', body: 'Hello,\n\nYour order PO-2024-089 for framing lumber has been confirmed for delivery on Friday between 7am-10am.\n\nBuildRight Supplies', timestamp: 'Yesterday 11:00 am' },
    ]
  },
  {
    id: '5',
    from: 'Linda Park',
    fromEmail: 'linda.park@gmail.com',
    subject: 'New project inquiry — bathroom renovation',
    preview: 'Hi, I found you through a referral from the Hendersons. We\'re looking...',
    body: 'Hi,\n\nI found you through a referral from Robert Henderson. We\'re looking to renovate our main bathroom and add an ensuite to the master bedroom.\n\nThe house is in Aurora. Budget is around $45,000. Can we schedule a site visit?\n\nLinda Park\n(905) 555-0142',
    timestamp: 'Tuesday',
    read: true,
    starred: true,
    status: 'new',
    type: 'lead',
    clientName: 'Linda Park',
    thread: [
      { from: 'Linda Park', body: 'Hi,\n\nI found you through a referral from Robert Henderson. We\'re looking to renovate our main bathroom and add an ensuite to the master bedroom.\n\nThe house is in Aurora. Budget is around $45,000. Can we schedule a site visit?\n\nLinda Park\n(905) 555-0142', timestamp: 'Tuesday 2:15 pm' },
    ]
  },
];

const STATUS_CONFIG: Record<MessageStatus, { color: string; bg: string; label: string }> = {
  new:        { color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)',   label: 'New'         },
  inprogress: { color: '#D97706', bg: 'rgba(217,119,6,0.10)',  label: 'In Progress' },
  waiting:    { color: '#6B7280', bg: 'rgba(107,114,128,0.10)', label: 'Waiting'     },
  closed:     { color: '#16A34A', bg: 'rgba(22,163,74,0.10)',  label: 'Closed'      },
};

const TYPE_CONFIG: Record<MessageType, { color: string; label: string; icon: React.ElementType }> = {
  lead:     { color: '#8A7600', label: 'Lead',     icon: User        },
  quote:    { color: '#1E5FA4', label: 'Quote',    icon: FileText    },
  warranty: { color: '#DC2626', label: 'Warranty', icon: AlertTriangle },
  invoice:  { color: '#16A34A', label: 'Invoice',  icon: Receipt     },
  general:  { color: '#6B7280', label: 'General',  icon: Mail        },
};

const NAV_ITEMS = [
  { id: 'inbox',   label: 'Inbox',   icon: Inbox,    count: 2  },
  { id: 'starred', label: 'Starred', icon: Star,     count: 0  },
  { id: 'sent',    label: 'Sent',    icon: Send,     count: 0  },
  { id: 'drafts',  label: 'Drafts',  icon: FileText, count: 1  },
  { id: 'archive', label: 'Archive', icon: Archive,  count: 0  },
];

const HIVES = [
  { id: 'all',      label: 'All Mail'   },
  { id: 'client',   label: 'Client Comms' },
  { id: 'supplier', label: 'Suppliers'  },
  { id: 'legal',    label: 'Legal / Docs' },
  { id: 'warranty', label: 'Warranty'   },
];

/* ── Main Component ── */
export default function MailPage() {
  const [activeNav, setActiveNav]         = useState('inbox');
  const [activeHive, setActiveHive]       = useState<Hive>('all');
  const [selectedId, setSelectedId]       = useState<string | null>('1');
  const [search, setSearch]               = useState('');
  const [reply, setReply]                 = useState('');
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkedClient, setLinkedClient]   = useState<string | null>(null);
  const [linkedProject, setLinkedProject] = useState<string | null>(null);

  const selected = MOCK_MESSAGES.find(m => m.id === selectedId) ?? null;

  const filtered = MOCK_MESSAGES.filter(m => {
    if (search) {
      const q = search.toLowerCase();
      return m.from.toLowerCase().includes(q) ||
             m.subject.toLowerCase().includes(q) ||
             m.preview.toLowerCase().includes(q);
    }
    return true;
  });

  const unread = MOCK_MESSAGES.filter(m => !m.read).length;

  /* Styles */
  const paneStyle: React.CSSProperties = {
    background: 'var(--color-panel)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 320px 1fr',
      height: 'calc(100vh - 56px)',
      overflow: 'hidden',
      fontFamily: 'var(--font-body)',
    }}>

      {/* ── PANE 1 — Nav ── */}
      <div style={{ ...paneStyle, padding: '16px 10px' }}>

        {/* Compose */}
        <button style={{
          width: '100%', padding: '9px 14px', borderRadius: 8, marginBottom: 20,
          background: '#FCE205', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          fontSize: 12, fontWeight: 700, color: '#111010',
          fontFamily: 'var(--font-body)',
          boxShadow: '0 2px 8px rgba(252,226,5,0.3)',
          transition: 'all 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(252,226,5,0.4)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(252,226,5,0.3)'}
        >
          <Plus size={13} strokeWidth={2.5} /> Compose
        </button>

        {/* Nav items */}
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 7, marginBottom: 2,
                display: 'flex', alignItems: 'center', gap: 9,
                fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? '#8A7600' : 'var(--color-text-sub)',
                background: active ? 'rgba(252,226,5,0.10)' : 'transparent',
                border: active ? '1px solid rgba(252,226,5,0.2)' : '1px solid transparent',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-body)', transition: 'all 0.1s',
              }}
            >
              <Icon size={13} strokeWidth={active ? 2.2 : 1.6} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.id === 'inbox' && unread > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 100,
                  background: '#FCE205', color: '#111010',
                }}>
                  {unread}
                </span>
              )}
            </button>
          );
        })}

        {/* Hives */}
        <div style={{ marginTop: 20, marginBottom: 8 }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-muted)', padding: '0 10px', marginBottom: 6 }}>
            Hives
          </p>
          {HIVES.map(hive => (
            <button
              key={hive.id}
              onClick={() => setActiveHive(hive.id as Hive)}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 7, marginBottom: 2,
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11, fontWeight: activeHive === hive.id ? 600 : 400,
                color: activeHive === hive.id ? '#8A7600' : 'var(--color-muted)',
                background: activeHive === hive.id ? 'rgba(252,226,5,0.08)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-body)', transition: 'all 0.1s',
              }}
            >
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: activeHive === hive.id ? '#FCE205' : 'var(--color-border)',
              }} />
              {hive.label}
            </button>
          ))}
        </div>

        {/* Connect email */}
        <div style={{ marginTop: 'auto', padding: '12px 10px' }}>
          <div style={{
            padding: '12px', borderRadius: 8,
            background: 'rgba(252,226,5,0.06)',
            border: '1px dashed rgba(252,226,5,0.25)',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#8A7600', marginBottom: 4 }}>Connect Your Email</p>
            <p style={{ fontSize: 10, color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: 8 }}>
              Gmail, Outlook, Rogers, Bell, or any email
            </p>
            <button style={{
              width: '100%', padding: '6px', borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: '#FCE205', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', color: '#111010',
            }}>
              Connect Now
            </button>
          </div>
        </div>
      </div>

      {/* ── PANE 2 — Message List ── */}
      <div style={{ ...paneStyle }}>

        {/* Search + filter */}
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
            <input
              style={{
                width: '100%', height: 32, paddingLeft: 28, paddingRight: 12,
                borderRadius: 7, border: '1px solid var(--color-border)',
                background: 'var(--color-mist)', fontSize: 11,
                color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none',
              }}
              placeholder="Search messages..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'new', 'inprogress', 'waiting'] as const).map(s => (
              <button key={s} style={{
                padding: '3px 8px', borderRadius: 100, fontSize: 9, fontWeight: 600,
                background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                color: 'var(--color-muted)', cursor: 'pointer',
                fontFamily: 'var(--font-body)', textTransform: 'capitalize',
              }}>
                {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(msg => {
            const TypeIcon = TYPE_CONFIG[msg.type].icon;
            const isSelected = msg.id === selectedId;
            return (
              <div
                key={msg.id}
                onClick={() => setSelectedId(msg.id)}
                style={{
                  padding: '12px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--color-border)',
                  background: isSelected ? 'rgba(252,226,5,0.06)' : msg.read ? 'transparent' : 'rgba(30,95,164,0.03)',
                  borderLeft: isSelected ? '3px solid #FCE205' : '3px solid transparent',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-mist)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = msg.read ? 'transparent' : 'rgba(30,95,164,0.03)'; }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {!msg.read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1E5FA4', flexShrink: 0 }} />}
                    <p style={{ fontSize: 12, fontWeight: msg.read ? 400 : 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                      {msg.from}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--color-muted)', flexShrink: 0 }}>{msg.timestamp}</span>
                </div>

                {/* Subject */}
                <p style={{ fontSize: 11, fontWeight: msg.read ? 400 : 600, color: 'var(--color-text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {msg.subject}
                </p>

                {/* Preview */}
                <p style={{ fontSize: 10, color: 'var(--color-muted)', lineHeight: 1.4, overflow: 'hidden', marginBottom: 8,
WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, display: '-webkit-box' as const, }}>
                  {msg.preview}
                </p>

                {/* Badges row */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Type badge */}
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100,
                    color: TYPE_CONFIG[msg.type].color,
                    background: `${TYPE_CONFIG[msg.type].color}18`,
                    border: `1px solid ${TYPE_CONFIG[msg.type].color}30`,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <TypeIcon size={8} strokeWidth={2} />
                    {TYPE_CONFIG[msg.type].label}
                  </span>

                  {/* Status badge */}
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 100,
                    color: STATUS_CONFIG[msg.status].color,
                    background: STATUS_CONFIG[msg.status].bg,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {STATUS_CONFIG[msg.status].label}
                  </span>

                  {/* Project link */}
                  {msg.projectName && (
                    <span style={{ fontSize: 9, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <FolderOpen size={8} /> {msg.projectName}
                    </span>
                  )}

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Paperclip size={8} /> {msg.attachments.length}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PANE 3 — Thread ── */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-canvas)' }}>

        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)' }}>
            <div style={{ textAlign: 'center' }}>
              <Mail size={32} strokeWidth={1} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 13 }}>Select a message to read</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div style={{
              padding: '16px 20px',
              background: 'var(--color-panel)',
              borderBottom: '1px solid var(--color-border)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em', marginBottom: 4 }}>
                    {selected.subject}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(30,95,164,0.12)', border: '1px solid rgba(30,95,164,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#1E5FA4', flexShrink: 0 }}>
                      {selected.from.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{selected.from}</p>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>{selected.fromEmail}</p>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => setShowLinkPanel(!showLinkPanel)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                      background: showLinkPanel ? 'rgba(252,226,5,0.12)' : 'var(--color-mist)',
                      border: showLinkPanel ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)',
                      color: showLinkPanel ? '#8A7600' : 'var(--color-text-sub)',
                      cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.12s',
                    }}
                  >
                    <Link2 size={11} strokeWidth={1.5} /> Link to CRM
                  </button>
                  <button style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                    background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-sub)', cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}>
                    <MoreHorizontal size={11} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { label: TYPE_CONFIG[selected.type].label, color: TYPE_CONFIG[selected.type].color, icon: TYPE_CONFIG[selected.type].icon },
                ].map(badge => {
                  const Icon = badge.icon;
                  return (
                    <span key={badge.label} style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, color: badge.color, background: `${badge.color}15`, border: `1px solid ${badge.color}25`, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon size={9} strokeWidth={2} />{badge.label}
                    </span>
                  );
                })}
                <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 100, color: STATUS_CONFIG[selected.status].color, background: STATUS_CONFIG[selected.status].bg }}>
                  {STATUS_CONFIG[selected.status].label}
                </span>
                {selected.projectName && (
                  <span style={{ fontSize: 10, color: 'var(--color-muted)', padding: '3px 8px', borderRadius: 100, background: 'var(--color-mist)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FolderOpen size={9} /> {selected.projectName}
                  </span>
                )}
              </div>
            </div>

            {/* Link to CRM panel */}
            {showLinkPanel && (
              <div style={{
                padding: '14px 20px',
                background: 'rgba(252,226,5,0.04)',
                borderBottom: '1px solid rgba(252,226,5,0.15)',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#8A7600' }}>Link to CRM Record</p>
                  <button onClick={() => setShowLinkPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X size={13} color="var(--color-muted)" />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Client</p>
                    <select
                      style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-panel)', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none' }}
                      value={linkedClient ?? selected.clientName ?? ''}
                      onChange={e => setLinkedClient(e.target.value)}
                    >
                      <option value="">Select client...</option>
                      {['Robert Henderson', 'Sarah Morrison', 'Mike Nguyen', 'Linda Park', 'David Chen'].map(c => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Project</p>
                    <select
                      style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-panel)', fontSize: 11, color: 'var(--color-text)', fontFamily: 'var(--font-body)', outline: 'none' }}
                      value={linkedProject ?? selected.projectName ?? ''}
                      onChange={e => setLinkedProject(e.target.value)}
                    >
                      <option value="">Select project...</option>
                      {['Henderson Kitchen Reno', 'Morrison Basement', 'Nguyen Deck Build', 'Riverside Addition', 'Thornhill Addition'].map(p => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button style={{
                    padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                    background: '#FCE205', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-body)', color: '#111010',
                  }}>
                    Save Link
                  </button>
                  {selected.type === 'lead' && (
                    <button style={{
                      padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                      background: 'rgba(30,95,164,0.10)', border: '1px solid rgba(30,95,164,0.2)',
                      color: '#1E5FA4', cursor: 'pointer', fontFamily: 'var(--font-body)',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <FolderOpen size={11} strokeWidth={1.5} /> Convert to Project
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Attachments bar */}
            {selected.attachments && selected.attachments.length > 0 && (
              <div style={{
                padding: '8px 20px',
                background: 'var(--color-mist)',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              }}>
                <Paperclip size={11} color="var(--color-muted)" />
                {selected.attachments.map(att => (
                  <span key={att} style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 6,
                    background: 'var(--color-panel)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-sub)', cursor: 'pointer',
                  }}>
                    {att}
                  </span>
                ))}
              </div>
            )}

            {/* Thread messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {(selected.thread ?? []).map((msg, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.isMe ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: msg.isMe ? '#1E5FA4' : 'var(--color-text)' }}>
                      {msg.from}
                    </p>
                    <p style={{ fontSize: 9, color: 'var(--color-muted)' }}>{msg.timestamp}</p>
                  </div>
                  <div style={{
                    maxWidth: '80%', padding: '12px 16px',
                    borderRadius: msg.isMe ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                    background: msg.isMe ? 'rgba(30,95,164,0.08)' : 'var(--color-panel)',
                    border: msg.isMe ? '1px solid rgba(30,95,164,0.15)' : '1px solid var(--color-border)',
                    fontSize: 12, color: 'var(--color-text)', lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.body}
                  </div>
                </div>
              ))}
            </div>

            {/* AI suggestion bar */}
            {selected.type === 'warranty' && (
              <div style={{
                padding: '10px 20px',
                background: 'rgba(220,38,38,0.04)',
                borderTop: '1px solid rgba(220,38,38,0.12)',
                display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
              }}>
                <AlertTriangle size={13} color="#DC2626" strokeWidth={1.5} />
                <p style={{ fontSize: 11, color: '#DC2626', flex: 1 }}>
                  Warranty language detected — this message may require a formal response.
                </p>
                <button style={{
                  padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                  background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.2)',
                  color: '#DC2626', cursor: 'pointer', fontFamily: 'var(--font-body)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <Shield size={10} strokeWidth={1.5} /> Generate Defense Response
                </button>
              </div>
            )}

            {selected.type === 'lead' && (
              <div style={{
                padding: '10px 20px',
                background: 'rgba(252,226,5,0.04)',
                borderTop: '1px solid rgba(252,226,5,0.15)',
                display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
              }}>
                <Sparkles size={13} color="#8A7600" strokeWidth={1.5} />
                <p style={{ fontSize: 11, color: '#8A7600', flex: 1 }}>
                  New lead detected — convert to a project or send a quote.
                </p>
                <button style={{
                  padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                  background: 'rgba(252,226,5,0.12)', border: '1px solid rgba(252,226,5,0.3)',
                  color: '#8A7600', cursor: 'pointer', fontFamily: 'var(--font-body)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <FolderOpen size={10} strokeWidth={1.5} /> Convert to Project
                </button>
              </div>
            )}

            {/* Reply box */}
            <div style={{
              padding: '14px 20px',
              background: 'var(--color-panel)',
              borderTop: '1px solid var(--color-border)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-sub)', cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}>
                  <Sparkles size={10} strokeWidth={1.5} color="#1E5FA4" /> AI Draft Reply
                </button>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-sub)', cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}>
                  <Receipt size={10} strokeWidth={1.5} /> Attach Invoice
                </button>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-sub)', cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                }}>
                  <FileText size={10} strokeWidth={1.5} /> Attach Quote
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  style={{
                    flex: 1, height: 80, padding: '10px 12px',
                    borderRadius: 8, border: '1px solid var(--color-border)',
                    background: 'var(--color-panel-raised)',
                    fontSize: 12, color: 'var(--color-text)',
                    fontFamily: 'var(--font-body)', outline: 'none',
                    resize: 'none', lineHeight: 1.6, transition: 'all 0.15s',
                  }}
                  placeholder={`Reply to ${selected.from}...`}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onFocus={e => { e.currentTarget.style.borderColor = '#FCE205'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.10)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button
                  disabled={!reply.trim()}
                  style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    background: reply.trim() ? '#FCE205' : 'var(--color-mist)',
                    border: 'none', cursor: reply.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  <Send size={15} color={reply.trim() ? '#111010' : 'var(--color-muted)'} strokeWidth={2} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}