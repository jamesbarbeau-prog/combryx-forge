import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import {
  Inbox, Star, FileText, Archive, Search, Plus, Paperclip,
  Send, MoreHorizontal, User, AlertTriangle, Mail, Sparkles,
  FolderOpen, Shield, Folder, ChevronDown, Trash2, Reply,
  ReplyAll, Forward, X, Check, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type MessageStatus = 'new' | 'inprogress' | 'waiting' | 'closed';
type MessageType   = 'homeowner' | 'tarion' | 'trade' | 'internal' | 'general';
type NavId         = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive';

interface ThreadMsg {
  from: string;
  body: string;
  timestamp: string;
  isMe?: boolean;
}

interface Message {
  id: string;
  from: string;
  fromEmail: string;
  to?: string;
  subject: string;
  preview: string;
  body: string;
  timestamp: string;
  read: boolean;
  starred: boolean;
  archived: boolean;
  status: MessageStatus;
  type: MessageType;
  nav: NavId;
  lotNumber?: string;
  caseNumber?: string;
  folderId?: string;
  attachments?: string[];
  thread: ThreadMsg[];
}

interface CustomFolder {
  id: string;
  label: string;
  color: string;
}

const FOLDER_COLORS = ['#FCE205','#1E5FA4','#16A34A','#DC2626','#7C3AED','#D97706','#6BA3D6','#6B7280'];

const STATUS_CFG: Record<MessageStatus,{color:string;bg:string;label:string}> = {
  new:        { color:'#1E5FA4', bg:'rgba(30,95,164,0.10)',   label:'New'         },
  inprogress: { color:'#D97706', bg:'rgba(217,119,6,0.10)',   label:'In Progress' },
  waiting:    { color:'#6B7280', bg:'rgba(107,114,128,0.10)', label:'Waiting'     },
  closed:     { color:'#16A34A', bg:'rgba(22,163,74,0.10)',   label:'Closed'      },
};

const TYPE_CFG: Record<MessageType,{color:string;label:string;icon:React.ElementType}> = {
  homeowner: { color:'#1E5FA4', label:'Homeowner', icon:User           },
  tarion:    { color:'#DC2626', label:'Tarion',    icon:AlertTriangle  },
  trade:     { color:'#D97706', label:'Trade',     icon:FolderOpen     },
  internal:  { color:'#7C3AED', label:'Internal',  icon:Shield         },
  general:   { color:'#6B7280', label:'General',   icon:Mail           },
};

const HIVES = [
  { id:'all',       label:'All Mail',   color:'#FCE205' },
  { id:'homeowner', label:'Homeowners', color:'#1E5FA4' },
  { id:'tarion',    label:'Tarion',     color:'#DC2626' },
  { id:'trade',     label:'Trades',     color:'#D97706' },
  { id:'internal',  label:'Internal',   color:'#7C3AED' },
];

const INIT_MESSAGES: Message[] = [
  {
    id:'1', from:'Marcus Chen', fromEmail:'mchen@gmail.com',
    subject:'Lot 45 — Drywall crack follow-up',
    preview:'Just wanted to follow up on when the tech is coming...',
    body:'Hi,\n\nJust wanted to follow up on the repair scheduled for the drywall crack in the master bedroom. We were told someone would come last Thursday but nobody showed up.\n\nCan you confirm when this will be addressed? Our BRP window is coming up.\n\nMarcus Chen\nLot 45 — 123 Rideau Crest Dr',
    timestamp:'10:42 am', read:false, starred:true, archived:false,
    status:'new', type:'homeowner', nav:'inbox',
    lotNumber:'Lot 45', caseNumber:'T-998821',
    attachments:['photo_drywall.jpg'],
    thread:[
      { from:'Warranty Team', body:'Hi Marcus, we have your year-end list and are scheduling repairs. Someone will be in touch shortly.', timestamp:'Yesterday 3:12 pm', isMe:true },
      { from:'Marcus Chen', body:'Thanks. Any update? The crack is getting bigger.', timestamp:'Yesterday 4:45 pm' },
      { from:'Marcus Chen', body:'Hi,\n\nJust wanted to follow up on the repair scheduled for the drywall crack. Nobody showed up Thursday.\n\nMarcus Chen', timestamp:'Today 10:42 am' },
    ],
  },
  {
    id:'2', from:'Tarion Warranty', fromEmail:'notifications@tarion.com',
    subject:'New Year-End Form Submitted — H1892341',
    preview:'A homeowner has submitted a Year-End warranty form...',
    body:'A homeowner has submitted a Year-End warranty form for enrollment H1892341.\n\nProperty: 123 Rideau Crest Dr\nForm Type: Year-End\nSubmission Date: April 6, 2026\nItems: 12\n\nPlease log in to BuilderLink to review.',
    timestamp:'9:15 am', read:false, starred:false, archived:false,
    status:'new', type:'tarion', nav:'inbox',
    lotNumber:'Lot 45', caseNumber:'T-998821',
    thread:[
      { from:'Tarion Warranty', body:'A homeowner has submitted a Year-End warranty form for enrollment H1892341.\n\nProperty: 123 Rideau Crest Dr\nItems: 12\n\nLog in to BuilderLink to review.', timestamp:'Today 9:15 am' },
    ],
  },
  {
    id:'3', from:'Dave K. (Tech)', fromEmail:'davek@internal.com',
    subject:'Lot 78 — Could not access today',
    preview:'Homeowner was not home for scheduled repair...',
    body:'Hey,\n\nShowed up at Lot 78 (204 Maple Leaf Way) at 11am as scheduled but nobody answered the door. Tried calling twice, no answer.\n\nShould I log this as an access denial?\n\nDave',
    timestamp:'Yesterday', read:true, starred:false, archived:false,
    status:'inprogress', type:'internal', nav:'inbox',
    lotNumber:'Lot 78', caseNumber:'T-994512',
    thread:[
      { from:'Dave K. (Tech)', body:'Hey,\n\nShowed up at Lot 78 at 11am but nobody answered. Tried calling twice.\n\nShould I log as access denial?\n\nDave', timestamp:'Yesterday 11:30 am' },
    ],
  },
  {
    id:'4', from:'Drywall Pro Inc.', fromEmail:'info@drywallpro.ca',
    subject:'Quote for Lot 45 drywall repairs',
    preview:'Please find attached our quote for the drywall repairs...',
    body:'Hello,\n\nPlease find attached our quote for drywall repairs at 123 Rideau Crest Dr (Lot 45).\n\nScope: Patch and paint master bedroom ceiling crack, 2 nail pops in hallway\nEstimate: $1,240 + HST\nAvailability: April 10–12\n\nDrywall Pro Inc.',
    timestamp:'Yesterday', read:true, starred:false, archived:false,
    status:'waiting', type:'trade', nav:'inbox',
    lotNumber:'Lot 45',
    attachments:['quote_drywallpro.pdf'],
    thread:[
      { from:'Drywall Pro Inc.', body:'Please find our quote for drywall repairs at Lot 45.\n\nEstimate: $1,240 + HST\nAvailability: April 10–12', timestamp:'Yesterday 2:00 pm' },
    ],
  },
  {
    id:'5', from:'Priya Sharma', fromEmail:'p.sharma@outlook.com',
    subject:'Lot 12 — All repairs complete, thank you!',
    preview:'Just wanted to say thank you for the fast turnaround...',
    body:'Hi,\n\nJust wanted to say thank you for the fast turnaround on all our warranty items. The tech was professional and everything looks great.\n\nHappy to sign off on everything.\n\nPriya Sharma\nLot 12',
    timestamp:'Tuesday', read:true, starred:true, archived:false,
    status:'closed', type:'homeowner', nav:'inbox',
    lotNumber:'Lot 12', caseNumber:'T-991003',
    thread:[
      { from:'Priya Sharma', body:'Hi,\n\nJust wanted to say thank you for the fast turnaround on all our warranty items. Happy to sign off.\n\nPriya Sharma', timestamp:'Tuesday 2:15 pm' },
    ],
  },
];

const inp: React.CSSProperties = {
  width:'100%', padding:'0 10px', borderRadius:7,
  border:'1px solid var(--color-border)',
  background:'var(--color-panel-raised)',
  color:'var(--color-text)', fontSize:12,
  fontFamily:'var(--font-body)', outline:'none',
};

const AI_BTN_STYLE = (loading: boolean): React.CSSProperties => ({
  display:'flex', alignItems:'center', gap:6,
  padding:'7px 14px', borderRadius:7, fontSize:12, fontWeight:700,
  background: loading
    ? 'rgba(30,95,164,0.05)'
    : 'linear-gradient(135deg, rgba(30,95,164,0.18) 0%, rgba(107,163,214,0.14) 100%)',
  border:'1px solid rgba(107,163,214,0.35)',
  color: loading ? 'var(--color-muted)' : '#6BA3D6',
  cursor: loading ? 'default' : 'pointer',
  fontFamily:'var(--font-body)',
  boxShadow: loading ? 'none' : '0 2px 10px rgba(30,95,164,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
  transition:'all 0.15s',
  opacity: loading ? 0.6 : 1,
});

export default function MailPage() {
  const [messages, setMessages]             = useState<Message[]>(INIT_MESSAGES);
  const [activeNav, setActiveNav]           = useState<NavId>('inbox');
  const [activeHive, setActiveHive]         = useState('all');
  const [activeFolder, setActiveFolder]     = useState<string|null>(null);
  const [selectedId, setSelectedId]         = useState<string|null>('1');
  const [search, setSearch]                 = useState('');
  const [statusFilter, setStatusFilter]     = useState<MessageStatus|'all'>('all');
  const [replyMode, setReplyMode]           = useState<'reply'|'replyall'|'forward'|null>(null);
  const [replyBody, setReplyBody]           = useState('');
  const [replyTo, setReplyTo]               = useState('');
  const [composeMode, setComposeMode]       = useState(false);
  const [compose, setCompose]               = useState({ to:'', subject:'', body:'' });
  const [customFolders, setCustomFolders]   = useState<CustomFolder[]>([
    { id:'brp-urgent',  label:'BRP Urgent',  color:'#DC2626' },
    { id:'settlements', label:'Settlements', color:'#16A34A' },
  ]);
  const [showNewFolder, setShowNewFolder]   = useState(false);
  const [newFolderName, setNewFolderName]   = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#FCE205');
  const [showFolders, setShowFolders]       = useState(true);
  const [showMoreMenu, setShowMoreMenu]     = useState(false);
  const [aiLoading, setAiLoading]           = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const selected = messages.find(m => m.id === selectedId) ?? null;

  useEffect(() => {
    if (replyMode && replyRef.current) {
      setTimeout(() => replyRef.current?.focus(), 50);
    }
  }, [replyMode]);

  function updateMsg(id: string, patch: Partial<Message>) {
    setMessages(ms => ms.map(m => m.id === id ? { ...m, ...patch } : m));
  }
  function markRead(id: string) { updateMsg(id, { read:true }); }
  function toggleStar(id: string) { updateMsg(id, { starred:!messages.find(m=>m.id===id)?.starred }); }
  function archiveMsg(id: string) { updateMsg(id, { archived:true, nav:'archive' }); setSelectedId(null); }
  function deleteMsg(id: string) { setMessages(ms => ms.filter(m => m.id !== id)); setSelectedId(null); }
  function setStatus(id: string, status: MessageStatus) { updateMsg(id, { status }); }
  function moveToFolder(id: string, folderId: string) { updateMsg(id, { folderId }); }

  function sendReply() {
    if (!selected || !replyBody.trim()) return;
    const newThread: ThreadMsg = { from:'Warranty Team', body:replyBody, timestamp:'Just now', isMe:true };
    updateMsg(selected.id, { thread:[...selected.thread, newThread], read:true, status:'inprogress' });
    const sentCopy: Message = {
      id:`sent-${Date.now()}`, from:'Warranty Team', fromEmail:'warranty@combryx.com',
      to: replyMode==='forward' ? replyTo : selected.fromEmail,
      subject: replyMode==='forward' ? `Fwd: ${selected.subject}` : `Re: ${selected.subject}`,
      preview:replyBody.slice(0,80), body:replyBody,
      timestamp:'Just now', read:true, starred:false, archived:false,
      status:'closed', type:selected.type, nav:'sent',
      lotNumber:selected.lotNumber, caseNumber:selected.caseNumber,
      thread:[{ from:'Warranty Team', body:replyBody, timestamp:'Just now', isMe:true }],
    };
    setMessages(ms => [sentCopy, ...ms]);
    setReplyBody(''); setReplyTo(''); setReplyMode(null);
  }

  function sendCompose() {
    if (!compose.to || !compose.subject || !compose.body.trim()) return;
    const newMsg: Message = {
      id:`sent-${Date.now()}`, from:'Warranty Team', fromEmail:'warranty@combryx.com',
      to:compose.to, subject:compose.subject,
      preview:compose.body.slice(0,80), body:compose.body,
      timestamp:'Just now', read:true, starred:false, archived:false,
      status:'new', type:'general', nav:'sent',
      thread:[{ from:'Warranty Team', body:compose.body, timestamp:'Just now', isMe:true }],
    };
    setMessages(ms => [newMsg, ...ms]);
    setCompose({ to:'', subject:'', body:'' });
    setComposeMode(false);
  }

  async function generateAiDraft() {
    setAiLoading(true);
    try {
      let body: Record<string, unknown>;

      if (composeMode) {
        body = {
          messageType:      'general',
          senderName:       compose.to,
          senderEmail:      compose.to,
          subject:          compose.subject || 'Warranty',
          lastMessage:      '',
          userDraft:        compose.body.trim() || null,
          lotNumber:        null,
          caseNumber:       null,
          brpDaysLeft:      null,
          itemsOutstanding: null,
          replyMode:        'compose',
        };
      } else if (selected) {
        const lastMsg = selected.thread[selected.thread.length - 1];
        body = {
          messageType:      selected.type,
          senderName:       selected.from,
          senderEmail:      selected.fromEmail,
          subject:          selected.subject,
          lastMessage:      lastMsg?.body ?? selected.body,
          userDraft:        replyBody.trim() || null,
          lotNumber:        selected.lotNumber ?? null,
          caseNumber:       selected.caseNumber ?? null,
          brpDaysLeft:      null,
          itemsOutstanding: null,
          replyMode:        replyMode ?? 'reply',
        };
      } else {
        setAiLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('ai-draft', { body });

      if (!error && data?.draft) {
        if (composeMode) {
          setCompose(c => ({ ...c, body: data.draft }));
        } else {
          setReplyBody(data.draft);
          if (!replyMode) {
            setReplyMode('reply');
            setReplyTo(selected!.fromEmail);
          }
        }
      } else if (error) {
        console.error('AI draft error:', error);
      }
    } catch (e) {
      console.error('AI draft error:', e);
    }
    setAiLoading(false);
  }

  function addFolder() {
    if (!newFolderName.trim()) return;
    setCustomFolders(f => [...f, { id:`f-${Date.now()}`, label:newFolderName.trim(), color:newFolderColor }]);
    setNewFolderName(''); setNewFolderColor('#FCE205'); setShowNewFolder(false);
  }

  function handleNavClick(nav: NavId) {
    setActiveNav(nav); setActiveHive('all'); setActiveFolder(null);
    setStatusFilter('all'); setSelectedId(null); setComposeMode(false);
  }

  function handleFolderClick(folderId: string) {
    setActiveFolder(folderId); setActiveNav('inbox');
    setActiveHive('all'); setSelectedId(null); setComposeMode(false);
  }

  const filtered = messages.filter(m => {
    if (activeFolder) return m.folderId === activeFolder;
    if (m.nav !== activeNav) return false;
    if (m.archived && activeNav !== 'archive') return false;
    if (activeHive !== 'all' && m.type !== activeHive) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.from.toLowerCase().includes(q) ||
             m.subject.toLowerCase().includes(q) ||
             m.preview.toLowerCase().includes(q) ||
             (m.lotNumber?.toLowerCase().includes(q) ?? false) ||
             (m.caseNumber?.toLowerCase().includes(q) ?? false);
    }
    return true;
  });

  const unread = messages.filter(m => !m.read && m.nav === 'inbox' && !m.archived).length;

  const pane: React.CSSProperties = {
    background:'var(--color-panel)',
    borderRight:'1px solid var(--color-border)',
    display:'flex', flexDirection:'column', overflow:'hidden',
  };

  return (
    <div style={{ display:'grid', gridTemplateColumns:'210px 310px 1fr', height:'calc(100vh - 56px)', overflow:'hidden', fontFamily:'var(--font-body)' }}>

      {/* ── PANE 1 — Sidebar ── */}
      <div style={{ ...pane, padding:'14px 10px', overflowY:'auto' }}>

        <button
          onClick={() => { setComposeMode(true); setSelectedId(null); setReplyMode(null); }}
          style={{ width:'100%', padding:'9px 14px', borderRadius:8, marginBottom:18, background:'#FCE205', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7, fontSize:12, fontWeight:700, color:'#111010', fontFamily:'var(--font-body)', boxShadow:'0 2px 8px rgba(252,226,5,0.3)' }}
        >
          <Plus size={13} strokeWidth={2.5} /> Compose
        </button>

        {([
          { id:'inbox',   label:'Inbox',   icon:Inbox,    count:unread },
          { id:'starred', label:'Starred', icon:Star,     count:0      },
          { id:'sent',    label:'Sent',    icon:Send,     count:0      },
          { id:'drafts',  label:'Drafts',  icon:FileText, count:0      },
          { id:'archive', label:'Archive', icon:Archive,  count:0      },
        ] as {id:NavId;label:string;icon:React.ElementType;count:number}[]).map(item => {
          const Icon = item.icon;
          const active = activeNav === item.id && !activeFolder && !composeMode;
          return (
            <button key={item.id} onClick={() => handleNavClick(item.id)} style={{ width:'100%', padding:'7px 10px', borderRadius:7, marginBottom:2, display:'flex', alignItems:'center', gap:9, fontSize:12, fontWeight:active?600:400, color:active?'#8A7600':'var(--color-muted)', background:active?'rgba(252,226,5,0.10)':'transparent', border:active?'1px solid rgba(252,226,5,0.2)':'1px solid transparent', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-body)', transition:'all 0.1s' }}>
              <Icon size={13} strokeWidth={active?2.2:1.6} />
              <span style={{ flex:1 }}>{item.label}</span>
              {item.count > 0 && <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:100, background:'#FCE205', color:'#111010' }}>{item.count}</span>}
            </button>
          );
        })}

        <div style={{ marginTop:18, marginBottom:4 }}>
          <p style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--color-muted)', padding:'0 10px', marginBottom:6 }}>Filter by Type</p>
          {HIVES.map(h => (
            <button key={h.id} onClick={() => { setActiveHive(h.id); setActiveFolder(null); setComposeMode(false); }} style={{ width:'100%', padding:'7px 10px', borderRadius:7, marginBottom:2, display:'flex', alignItems:'center', gap:8, fontSize:11, fontWeight:activeHive===h.id&&!activeFolder?600:400, color:activeHive===h.id&&!activeFolder?'var(--color-text)':'var(--color-muted)', background:activeHive===h.id&&!activeFolder?'rgba(252,226,5,0.08)':'transparent', border:'none', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-body)', transition:'all 0.1s' }}>
              <div style={{ width:7, height:7, borderRadius:'50%', flexShrink:0, background:activeHive===h.id&&!activeFolder?h.color:'var(--color-border)' }} />
              {h.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop:18 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 10px', marginBottom:6 }}>
            <button onClick={() => setShowFolders(f=>!f)} style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', padding:0 }}>
              <p style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--color-muted)' }}>My Folders</p>
              <ChevronDown size={10} color="var(--color-muted)" style={{ transform:showFolders?'rotate(0)':'rotate(-90deg)', transition:'transform 0.15s' }} />
            </button>
            <button onClick={() => setShowNewFolder(true)} style={{ background:'none', border:'none', cursor:'pointer', padding:2, borderRadius:4, display:'flex' }}>
              <Plus size={12} color="var(--color-muted)" />
            </button>
          </div>

          {showNewFolder && (
            <div style={{ margin:'0 6px 8px', padding:10, borderRadius:8, background:'var(--color-mist)', border:'1px solid var(--color-border)' }}>
              <input autoFocus style={{ ...inp, height:30, marginBottom:8, boxSizing:'border-box' as const }} placeholder="Folder name..." value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addFolder(); if(e.key==='Escape') setShowNewFolder(false); }} />
              <div style={{ display:'flex', gap:5, marginBottom:8, flexWrap:'wrap' }}>
                {FOLDER_COLORS.map(c => (
                  <button key={c} onClick={() => setNewFolderColor(c)} style={{ width:18, height:18, borderRadius:'50%', background:c, border:'none', cursor:'pointer', boxShadow:newFolderColor===c?`0 0 0 2px var(--color-panel), 0 0 0 3px ${c}`:'none' }} />
                ))}
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={addFolder} disabled={!newFolderName.trim()} style={{ flex:1, height:28, borderRadius:6, fontSize:10, fontWeight:700, background:newFolderName.trim()?'#FCE205':'var(--color-border)', border:'none', cursor:newFolderName.trim()?'pointer':'default', color:'#111', fontFamily:'var(--font-body)' }}>Create</button>
                <button onClick={() => setShowNewFolder(false)} style={{ height:28, padding:'0 10px', borderRadius:6, fontSize:10, background:'none', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>Cancel</button>
              </div>
            </div>
          )}

          {showFolders && customFolders.map(folder => {
            const active = activeFolder === folder.id;
            return (
              <div key={folder.id} onClick={() => handleFolderClick(folder.id)} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:7, marginBottom:2, cursor:'pointer', background:active?'rgba(252,226,5,0.08)':'transparent', transition:'all 0.1s' }}
                onMouseEnter={e=>{ e.currentTarget.style.background = active?'rgba(252,226,5,0.08)':'var(--color-mist)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.background = active?'rgba(252,226,5,0.08)':'transparent'; }}
              >
                <Folder size={12} color={folder.color} strokeWidth={1.6} />
                <span style={{ flex:1, fontSize:11, color:active?'var(--color-text)':'var(--color-muted)', fontWeight:active?600:400 }}>{folder.label}</span>
                <span style={{ fontSize:9, color:'var(--color-muted)' }}>{messages.filter(m=>m.folderId===folder.id).length||''}</span>
                <button onClick={e=>{ e.stopPropagation(); setCustomFolders(f=>f.filter(x=>x.id!==folder.id)); if(activeFolder===folder.id) setActiveFolder(null); }} style={{ background:'none', border:'none', cursor:'pointer', padding:2, opacity:0, transition:'opacity 0.1s' }}
                  onMouseEnter={e=>e.currentTarget.style.opacity='1'}
                  onMouseLeave={e=>e.currentTarget.style.opacity='0'}
                >
                  <Trash2 size={10} color="#DC2626" />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop:'auto', padding:'16px 6px 0' }}>
          <div style={{ padding:12, borderRadius:8, background:'rgba(252,226,5,0.06)', border:'1px dashed rgba(252,226,5,0.25)' }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#8A7600', marginBottom:4 }}>Connect Your Email</p>
            <p style={{ fontSize:10, color:'var(--color-muted)', lineHeight:1.5, marginBottom:8 }}>Gmail, Outlook, or any provider</p>
            <button style={{ width:'100%', padding:'6px', borderRadius:6, fontSize:10, fontWeight:600, background:'#FCE205', border:'none', cursor:'pointer', fontFamily:'var(--font-body)', color:'#111010' }}>Connect Now</button>
          </div>
        </div>
      </div>

      {/* ── PANE 2 — Message List ── */}
      <div style={{ ...pane }}>
        <div style={{ padding:'12px 12px 8px', borderBottom:'1px solid var(--color-border)', flexShrink:0 }}>
          <div style={{ position:'relative', marginBottom:8 }}>
            <Search size={12} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--color-muted)' }} />
            <input style={{ ...inp, height:32, paddingLeft:28 }} placeholder="Search lot, case, sender..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {(['all','new','inprogress','waiting','closed'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{ padding:'3px 7px', borderRadius:100, fontSize:9, fontWeight:statusFilter===s?700:600, background:statusFilter===s?'rgba(252,226,5,0.12)':'var(--color-mist)', border:statusFilter===s?'1px solid rgba(252,226,5,0.3)':'1px solid var(--color-border)', color:statusFilter===s?'#8A7600':'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                {s==='all'?'All':STATUS_CFG[s]?.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding:40, textAlign:'center', color:'var(--color-muted)', fontSize:12 }}>
              <Mail size={24} strokeWidth={1} style={{ marginBottom:8, opacity:0.4 }} />
              <p>No messages</p>
            </div>
          )}
          {filtered.map(msg => {
            const TypeIcon = TYPE_CFG[msg.type].icon;
            const isSel = msg.id === selectedId;
            return (
              <div key={msg.id} onClick={() => { setSelectedId(msg.id); markRead(msg.id); setReplyMode(null); setReplyBody(''); setComposeMode(false); }} style={{ padding:'12px 14px', cursor:'pointer', borderBottom:'1px solid var(--color-border)', background:isSel?'rgba(252,226,5,0.06)':msg.read?'transparent':'rgba(30,95,164,0.03)', borderLeft:isSel?'3px solid #FCE205':'3px solid transparent', transition:'all 0.1s' }}
                onMouseEnter={e=>{ if(!isSel) e.currentTarget.style.background='var(--color-mist)'; }}
                onMouseLeave={e=>{ if(!isSel) e.currentTarget.style.background=msg.read?'transparent':'rgba(30,95,164,0.03)'; }}
              >
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    {!msg.read && <div style={{ width:6, height:6, borderRadius:'50%', background:'#1E5FA4', flexShrink:0 }} />}
                    <p style={{ fontSize:12, fontWeight:msg.read?400:700, color:'var(--color-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:150 }}>{msg.from}</p>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <button onClick={e=>{ e.stopPropagation(); toggleStar(msg.id); }} style={{ background:'none', border:'none', cursor:'pointer', padding:2, opacity:msg.starred?1:0.3, transition:'opacity 0.1s' }}>
                      <Star size={11} color="#FCE205" fill={msg.starred?'#FCE205':'none'} />
                    </button>
                    <span style={{ fontSize:10, color:'var(--color-muted)' }}>{msg.timestamp}</span>
                  </div>
                </div>
                <p style={{ fontSize:11, fontWeight:msg.read?400:600, color:'var(--color-text)', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{msg.subject}</p>
                <p style={{ fontSize:10, color:'var(--color-muted)', lineHeight:1.4, marginBottom:8, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>{msg.preview}</p>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:100, color:TYPE_CFG[msg.type].color, background:`${TYPE_CFG[msg.type].color}15`, border:`1px solid ${TYPE_CFG[msg.type].color}30`, textTransform:'uppercase', letterSpacing:'0.04em', display:'flex', alignItems:'center', gap:3 }}>
                    <TypeIcon size={8} strokeWidth={2} />{TYPE_CFG[msg.type].label}
                  </span>
                  <span style={{ fontSize:9, fontWeight:600, padding:'2px 6px', borderRadius:100, color:STATUS_CFG[msg.status].color, background:STATUS_CFG[msg.status].bg, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                    {STATUS_CFG[msg.status].label}
                  </span>
                  {msg.lotNumber && <span style={{ fontSize:9, color:'var(--color-muted)' }}>🏠 {msg.lotNumber}</span>}
                  {msg.caseNumber && <span style={{ fontSize:9, color:'var(--color-muted)', fontFamily:'var(--font-mono)' }}>{msg.caseNumber}</span>}
                  {msg.attachments && msg.attachments.length > 0 && <span style={{ fontSize:9, color:'var(--color-muted)', display:'flex', alignItems:'center', gap:3 }}><Paperclip size={8} />{msg.attachments.length}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PANE 3 — Thread / Compose ── */}
      <div style={{ display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--color-canvas)' }}>

        {/* COMPOSE MODE */}
        {composeMode && (
          <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
            <div style={{ padding:'16px 24px', background:'var(--color-panel)', borderBottom:'1px solid var(--color-border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <h2 style={{ fontSize:15, fontWeight:700, color:'var(--color-text)' }}>New Message</h2>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={generateAiDraft} disabled={aiLoading} style={AI_BTN_STYLE(aiLoading)}>
                  <Sparkles size={12} strokeWidth={1.8} color={aiLoading ? 'var(--color-muted)' : '#6BA3D6'} />
                  {aiLoading ? 'Drafting...' : 'AI Draft'}
                </button>
                <button onClick={() => { setComposeMode(false); setCompose({ to:'', subject:'', body:'' }); }} style={{ padding:'7px 12px', borderRadius:7, fontSize:11, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  Discard
                </button>
              </div>
            </div>

            <div style={{ padding:'0 24px', background:'var(--color-panel)', borderBottom:'1px solid var(--color-border)', flexShrink:0 }}>
              {[
                { label:'To',      key:'to',      type:'email', placeholder:'recipient@email.com' },
                { label:'Subject', key:'subject', type:'text',  placeholder:'Subject...'          },
              ].map(f => (
                <div key={f.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid var(--color-border)' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--color-muted)', textTransform:'uppercase', letterSpacing:'0.07em', width:52, flexShrink:0 }}>{f.label}</span>
                  <input type={f.type} style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:13, color:'var(--color-text)', fontFamily:'var(--font-body)' }} placeholder={f.placeholder} value={(compose as any)[f.key]} onChange={e => setCompose(c => ({ ...c, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div style={{ flex:1, padding:'20px 24px', display:'flex', flexDirection:'column' }}>
              <textarea
                style={{ flex:1, width:'100%', padding:0, border:'none', outline:'none', background:'transparent', fontSize:13, color:'var(--color-text)', fontFamily:'var(--font-body)', lineHeight:1.8, resize:'none' }}
                placeholder="Write your message... or click AI Draft to generate one"
                value={compose.body}
                onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
              />
            </div>

            <div style={{ padding:'14px 24px', background:'var(--color-panel)', borderTop:'1px solid var(--color-border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div style={{ display:'flex', gap:8 }}>
                <button style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:7, fontSize:11, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  <Paperclip size={11} /> Attach
                </button>
                <button style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:7, fontSize:11, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  <FileText size={11} /> Template
                </button>
              </div>
              <button onClick={sendCompose} disabled={!compose.to||!compose.subject||!compose.body.trim()} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 24px', borderRadius:8, fontSize:13, fontWeight:700, background:compose.to&&compose.subject&&compose.body.trim()?'#FCE205':'var(--color-mist)', border:'none', color:compose.to&&compose.subject&&compose.body.trim()?'#111010':'var(--color-muted)', cursor:compose.to&&compose.subject&&compose.body.trim()?'pointer':'default', fontFamily:'var(--font-body)', transition:'all 0.15s' }}>
                <Send size={14} strokeWidth={2} /> Send
              </button>
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!composeMode && !selected && (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--color-muted)', flexDirection:'column', gap:12 }}>
            <Mail size={36} strokeWidth={1} style={{ opacity:0.2 }} />
            <p style={{ fontSize:13 }}>Select a message or compose a new one</p>
            <button onClick={() => setComposeMode(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, fontSize:12, fontWeight:700, background:'#FCE205', border:'none', cursor:'pointer', color:'#111010', fontFamily:'var(--font-body)' }}>
              <Plus size={13} /> Compose
            </button>
          </div>
        )}

        {/* READ MODE */}
        {!composeMode && selected && (
          <>
            {/* Thread header */}
            <div style={{ padding:'14px 20px', background:'var(--color-panel)', borderBottom:'1px solid var(--color-border)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <h2 style={{ fontSize:15, fontWeight:700, color:'var(--color-text)', letterSpacing:'-0.01em', marginBottom:6 }}>{selected.subject}</h2>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:26, height:26, borderRadius:'50%', background:`${TYPE_CFG[selected.type].color}15`, border:`1px solid ${TYPE_CFG[selected.type].color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:TYPE_CFG[selected.type].color, flexShrink:0 }}>
                      {selected.from.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
                    </div>
                    <div>
                      <p style={{ fontSize:12, fontWeight:600, color:'var(--color-text)' }}>{selected.from}</p>
                      <p style={{ fontSize:10, color:'var(--color-muted)' }}>{selected.fromEmail}{selected.to?` → ${selected.to}`:''}</p>
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
                  <select value={selected.status} onChange={e=>setStatus(selected.id, e.target.value as MessageStatus)} style={{ height:30, padding:'0 8px', borderRadius:6, fontSize:10, border:'1px solid var(--color-border)', background:'var(--color-mist)', color:STATUS_CFG[selected.status].color, cursor:'pointer', fontFamily:'var(--font-body)', outline:'none', fontWeight:600 }}>
                    <option value="new">New</option>
                    <option value="inprogress">In Progress</option>
                    <option value="waiting">Waiting</option>
                    <option value="closed">Closed</option>
                  </select>
                  <select defaultValue="" onChange={e=>{ if(e.target.value) moveToFolder(selected.id, e.target.value); }} style={{ height:30, padding:'0 8px', borderRadius:6, fontSize:10, border:'1px solid var(--color-border)', background:'var(--color-mist)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)', outline:'none' }}>
                    <option value="" disabled>Move to...</option>
                    {customFolders.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <button onClick={()=>toggleStar(selected.id)} style={{ width:30, height:30, borderRadius:6, background:'var(--color-mist)', border:'1px solid var(--color-border)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Star size={13} color="#FCE205" fill={selected.starred?'#FCE205':'none'} />
                  </button>
                  <button onClick={()=>archiveMsg(selected.id)} style={{ width:30, height:30, borderRadius:6, background:'var(--color-mist)', border:'1px solid var(--color-border)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Archive size={13} color="var(--color-muted)" />
                  </button>
                  <div style={{ position:'relative' }}>
                    <button onClick={()=>setShowMoreMenu(m=>!m)} style={{ width:30, height:30, borderRadius:6, background:'var(--color-mist)', border:'1px solid var(--color-border)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <MoreHorizontal size={13} color="var(--color-muted)" />
                    </button>
                    {showMoreMenu && (
                      <>
                        <div style={{ position:'fixed', inset:0, zIndex:49 }} onClick={()=>setShowMoreMenu(false)} />
                        <div style={{ position:'absolute', top:'100%', right:0, marginTop:4, zIndex:50, background:'var(--color-panel)', border:'1px solid var(--color-border)', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', overflow:'hidden', minWidth:150 }}>
                          {[
                            { label:'Mark Unread', icon:Mail,   action:()=>updateMsg(selected.id,{read:false}) },
                            { label:'Mark Read',   icon:Check,  action:()=>markRead(selected.id) },
                            { label:'Delete',      icon:Trash2, action:()=>deleteMsg(selected.id), danger:true },
                          ].map(item => {
                            const Icon = item.icon;
                            return (
                              <button key={item.label} onClick={()=>{ item.action(); setShowMoreMenu(false); }} style={{ width:'100%', padding:'9px 14px', display:'flex', alignItems:'center', gap:8, background:'none', border:'none', borderBottom:'1px solid var(--color-border)', color:(item as any).danger?'#DC2626':'var(--color-text)', fontSize:12, cursor:'pointer', fontFamily:'var(--font-body)', textAlign:'left' }}
                                onMouseEnter={e=>e.currentTarget.style.background='var(--color-mist)'}
                                onMouseLeave={e=>e.currentTarget.style.background='none'}
                              >
                                <Icon size={12} strokeWidth={1.5} />{item.label}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {(()=>{ const Icon=TYPE_CFG[selected.type].icon; return (
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:100, color:TYPE_CFG[selected.type].color, background:`${TYPE_CFG[selected.type].color}15`, border:`1px solid ${TYPE_CFG[selected.type].color}25`, display:'flex', alignItems:'center', gap:4 }}>
                    <Icon size={9} strokeWidth={2} />{TYPE_CFG[selected.type].label}
                  </span>
                ); })()}
                <span style={{ fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:100, color:STATUS_CFG[selected.status].color, background:STATUS_CFG[selected.status].bg }}>{STATUS_CFG[selected.status].label}</span>
                {selected.lotNumber && <span style={{ fontSize:10, color:'var(--color-muted)', padding:'3px 8px', borderRadius:100, background:'var(--color-mist)', border:'1px solid var(--color-border)' }}>🏠 {selected.lotNumber}</span>}
                {selected.caseNumber && <span style={{ fontSize:10, color:'var(--color-muted)', padding:'3px 8px', borderRadius:100, background:'var(--color-mist)', border:'1px solid var(--color-border)', fontFamily:'var(--font-mono)' }}>{selected.caseNumber}</span>}
                <span style={{ fontSize:10, color:'var(--color-muted)', padding:'3px 8px', borderRadius:100, background:'var(--color-mist)', border:'1px solid var(--color-border)' }}>{selected.thread.length} message{selected.thread.length!==1?'s':''}</span>
              </div>
            </div>

            {/* Attachments */}
            {selected.attachments && selected.attachments.length > 0 && (
              <div style={{ padding:'8px 20px', background:'var(--color-mist)', borderBottom:'1px solid var(--color-border)', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <Paperclip size={11} color="var(--color-muted)" />
                {selected.attachments.map(att => (
                  <span key={att} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'var(--color-panel)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer' }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='#FCE205'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--color-border)'}
                  >{att}</span>
                ))}
              </div>
            )}

            {/* Smart action bars */}
            {selected.type==='tarion' && (
              <div style={{ padding:'8px 20px', background:'rgba(220,38,38,0.04)', borderBottom:'1px solid rgba(220,38,38,0.12)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                <AlertTriangle size={13} color="#DC2626" strokeWidth={1.5} />
                <p style={{ fontSize:11, color:'#DC2626', flex:1 }}>Tarion notification — new warranty list received.</p>
                <button style={{ padding:'5px 10px', borderRadius:6, fontSize:10, fontWeight:700, background:'rgba(220,38,38,0.10)', border:'1px solid rgba(220,38,38,0.2)', color:'#DC2626', cursor:'pointer', fontFamily:'var(--font-body)' }}>↓ Sync Now</button>
              </div>
            )}
            {selected.type==='homeowner' && (
              <div style={{ padding:'8px 20px', background:'rgba(30,95,164,0.04)', borderBottom:'1px solid rgba(30,95,164,0.12)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                <Shield size={13} color="#1E5FA4" strokeWidth={1.5} />
                <p style={{ fontSize:11, color:'#1E5FA4', flex:1 }}>Homeowner communication — log this for chargeability defense.</p>
                <button style={{ padding:'5px 10px', borderRadius:6, fontSize:10, fontWeight:700, background:'rgba(30,95,164,0.10)', border:'1px solid rgba(30,95,164,0.2)', color:'#1E5FA4', cursor:'pointer', fontFamily:'var(--font-body)' }}>Log to Case</button>
              </div>
            )}
            {selected.type==='internal' && (
              <div style={{ padding:'8px 20px', background:'rgba(217,119,6,0.04)', borderBottom:'1px solid rgba(217,119,6,0.12)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                <AlertTriangle size={13} color="#D97706" strokeWidth={1.5} />
                <p style={{ fontSize:11, color:'#D97706', flex:1 }}>Tech report — log access denial to protect chargeability position.</p>
                <button style={{ padding:'5px 10px', borderRadius:6, fontSize:10, fontWeight:700, background:'rgba(217,119,6,0.10)', border:'1px solid rgba(217,119,6,0.2)', color:'#D97706', cursor:'pointer', fontFamily:'var(--font-body)' }}>Log Access Denial</button>
              </div>
            )}
            {selected.type==='trade' && (
              <div style={{ padding:'8px 20px', background:'rgba(22,163,74,0.04)', borderBottom:'1px solid rgba(22,163,74,0.12)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                <Sparkles size={13} color="#16A34A" strokeWidth={1.5} />
                <p style={{ fontSize:11, color:'#16A34A', flex:1 }}>Trade quote received — approve or request revision.</p>
                <div style={{ display:'flex', gap:6 }}>
                  <button style={{ padding:'5px 10px', borderRadius:6, fontSize:10, fontWeight:700, background:'rgba(22,163,74,0.12)', border:'1px solid rgba(22,163,74,0.25)', color:'#16A34A', cursor:'pointer', fontFamily:'var(--font-body)' }}>Approve PO</button>
                  <button style={{ padding:'5px 10px', borderRadius:6, fontSize:10, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>Revise</button>
                </div>
              </div>
            )}

            {/* Thread messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
              {selected.thread.map((msg, i) => (
                <div key={i} style={{ marginBottom:16, display:'flex', flexDirection:'column', alignItems:msg.isMe?'flex-end':'flex-start' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    <p style={{ fontSize:10, fontWeight:600, color:msg.isMe?'#1E5FA4':'var(--color-text)' }}>{msg.from}</p>
                    <p style={{ fontSize:9, color:'var(--color-muted)' }}>{msg.timestamp}</p>
                  </div>
                  <div style={{ maxWidth:'80%', padding:'12px 16px', borderRadius:msg.isMe?'12px 2px 12px 12px':'2px 12px 12px 12px', background:msg.isMe?'rgba(30,95,164,0.08)':'var(--color-panel)', border:msg.isMe?'1px solid rgba(30,95,164,0.15)':'1px solid var(--color-border)', fontSize:12, color:'var(--color-text)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                    {msg.body}
                  </div>
                </div>
              ))}
            </div>

            {/* Reply toolbar */}
            {!replyMode && (
              <div style={{ padding:'10px 20px', background:'var(--color-panel)', borderTop:'1px solid var(--color-border)', display:'flex', gap:8, flexShrink:0 }}>
                <button onClick={()=>{ setReplyMode('reply'); setReplyTo(selected.fromEmail); }} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:7, fontSize:12, fontWeight:600, background:'rgba(252,226,5,0.10)', border:'1px solid rgba(252,226,5,0.25)', color:'#8A7600', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  <Reply size={13} strokeWidth={1.5} /> Reply
                </button>
                <button onClick={()=>{ setReplyMode('replyall'); setReplyTo(selected.fromEmail); }} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:7, fontSize:12, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  <ReplyAll size={13} strokeWidth={1.5} /> Reply All
                </button>
                <button onClick={()=>{ setReplyMode('forward'); setReplyTo(''); }} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:7, fontSize:12, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  <Forward size={13} strokeWidth={1.5} /> Forward
                </button>
              </div>
            )}

            {/* Reply box */}
            {replyMode && (
              <div style={{ padding:'14px 20px', background:'var(--color-panel)', borderTop:'1px solid var(--color-border)', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {replyMode==='reply'    && <><Reply size={13} color="#8A7600" /><span style={{ fontSize:12, fontWeight:700, color:'#8A7600' }}>Reply to {selected.from}</span></>}
                    {replyMode==='replyall' && <><ReplyAll size={13} color="#1E5FA4" /><span style={{ fontSize:12, fontWeight:700, color:'#1E5FA4' }}>Reply All</span></>}
                    {replyMode==='forward'  && <><Forward size={13} color="#D97706" /><span style={{ fontSize:12, fontWeight:700, color:'#D97706' }}>Forward</span></>}
                  </div>
                  <button onClick={()=>{ setReplyMode(null); setReplyBody(''); setReplyTo(''); }} style={{ background:'none', border:'none', cursor:'pointer', padding:4 }}>
                    <X size={14} color="var(--color-muted)" />
                  </button>
                </div>

                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
                  <button onClick={generateAiDraft} disabled={aiLoading} style={AI_BTN_STYLE(aiLoading)}>
                    <Sparkles size={12} strokeWidth={1.8} color={aiLoading?'var(--color-muted)':'#6BA3D6'} />
                    {aiLoading ? 'Drafting...' : 'AI Draft Reply'}
                  </button>
                  <span style={{ fontSize:10, color:'var(--color-muted)' }}>
                    {replyBody.trim() ? 'AI will improve your draft' : 'AI writes a reply from scratch'}
                  </span>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:7, background:'var(--color-mist)', border:'1px solid var(--color-border)', marginBottom:8 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'var(--color-muted)', textTransform:'uppercase', letterSpacing:'0.06em', flexShrink:0 }}>To</span>
                  <input style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:11, color:'var(--color-text)', fontFamily:'var(--font-body)' }} value={replyMode==='forward'?replyTo:selected.fromEmail} onChange={e=>setReplyTo(e.target.value)} readOnly={replyMode==='reply'||replyMode==='replyall'} />
                </div>

                {replyMode==='forward' && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:7, background:'var(--color-mist)', border:'1px solid var(--color-border)', marginBottom:8 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'var(--color-muted)', textTransform:'uppercase', letterSpacing:'0.06em', flexShrink:0 }}>Subj</span>
                    <input style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:11, color:'var(--color-text)', fontFamily:'var(--font-body)' }} defaultValue={`Fwd: ${selected.subject}`} />
                  </div>
                )}

                <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                  <textarea
                    ref={replyRef}
                    style={{ flex:1, height:80, padding:'10px 12px', borderRadius:8, border:'1px solid var(--color-border)', background:'var(--color-panel-raised)', fontSize:12, color:'var(--color-text)', fontFamily:'var(--font-body)', outline:'none', resize:'none', lineHeight:1.6, transition:'all 0.15s' }}
                    placeholder={replyMode==='forward'?'Add a message...':`Reply to ${selected.from}...`}
                    value={replyBody}
                    onChange={e=>setReplyBody(e.target.value)}
                    onFocus={e=>{ e.currentTarget.style.borderColor='#FCE205'; e.currentTarget.style.boxShadow='0 0 0 3px rgba(252,226,5,0.10)'; }}
                    onBlur={e=>{ e.currentTarget.style.borderColor='var(--color-border)'; e.currentTarget.style.boxShadow='none'; }}
                    onKeyDown={e=>{ if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)) sendReply(); }}
                  />
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <button onClick={sendReply} disabled={!replyBody.trim()} style={{ width:40, height:40, borderRadius:8, background:replyBody.trim()?'#FCE205':'var(--color-mist)', border:'none', cursor:replyBody.trim()?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                      <Send size={15} color={replyBody.trim()?'#111010':'var(--color-muted)'} strokeWidth={2} />
                    </button>
                    <button style={{ width:40, height:40, borderRadius:8, background:'var(--color-mist)', border:'1px solid var(--color-border)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Paperclip size={13} color="var(--color-muted)" />
                    </button>
                  </div>
                </div>
                <p style={{ fontSize:9, color:'var(--color-muted)', marginTop:6 }}>Cmd+Enter to send</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}