// Phone shell for on-site work: no sidebar, one big header, thumb-sized controls, and a calm sync status line.
import { Link, Outlet, useLocation } from 'react-router-dom';
import { CheckCircle2, CloudOff, Loader2, LogOut, Monitor, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useauth';
import { BrandShield } from '@/components/identity';
import { dropParked, retryParked, syncNow, unsyncedCount, useSyncStatus } from '@/lib/offline';

function SyncBar() {
  const s = useSyncStatus();
  const base: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700 };
  if (s.parked > 0) return (
    <div style={{ ...base, background: '#F6E3DE', color: '#7A2B1D', flexWrap: 'wrap' }} role="status">
      <AlertTriangle size={15} /> <span style={{ flex: 1, minWidth: 180 }}>{s.parked} item{s.parked === 1 ? '' : 's'} could not upload. {s.parkedMsgs[0] ? s.parkedMsgs[0].slice(0, 90) : ''}</span>
      <button onClick={() => retryParked()} style={{ minHeight: 36, borderRadius: 8, border: '1px solid #A5402F', background: '#fff', color: '#7A2B1D', fontWeight: 800, padding: '0 12px', cursor: 'pointer' }}>Try again</button>
      <button onClick={() => { if (confirm('Discard the items that could not upload? They will be lost.')) dropParked(); }} style={{ minHeight: 36, border: 'none', background: 'none', color: '#7A2B1D', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }}>Discard</button>
    </div>
  );
  if (!s.signedIn && s.pending > 0) return <div style={{ ...base, background: '#F6EBD3', color: '#6A4D12' }} role="status"><AlertTriangle size={15} /> Sign in again to upload {s.pending} waiting item{s.pending === 1 ? '' : 's'}. Nothing is lost.</div>;
  if (!s.online) return <div style={{ ...base, background: '#F6EBD3', color: '#6A4D12' }} role="status"><CloudOff size={15} /> Offline. Everything is saved on this phone{s.pending ? ` (${s.pending} waiting to upload)` : ''}.</div>;
  if (s.pending > 0 || s.syncing) return <div style={{ ...base, background: '#E4ECF3', color: '#1F4466' }} role="status"><Loader2 size={15} className="spin" /> Uploading {s.pending} item{s.pending === 1 ? '' : 's'}…<button onClick={() => syncNow()} aria-label="Sync now" style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#1F4466', padding: 6, cursor: 'pointer' }}><RefreshCw size={15} /></button></div>;
  return <div style={{ ...base, background: '#E3EEE5', color: '#2F5E3A' }} role="status"><CheckCircle2 size={15} /> All saved and up to date.</div>;
}

export default function FieldLayout() {
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  async function out() {
    const n = await unsyncedCount();
    if (n > 0 && !confirm(`${n} item${n === 1 ? ' has' : 's have'} not uploaded yet. They stay on this phone and upload when you sign in again with signal. Sign out anyway?`)) return;
    signOut();
  }
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-canvas)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', paddingBottom: 'var(--sab)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ background: 'linear-gradient(180deg,#1B2A41,#16233A)', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(var(--sat) + 10px) 14px 10px', borderBottom: '2px solid #B08D4F' }}>
          <Link to="/field" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none', flex: 1 }}>
            <BrandShield size={34} />
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.01em' }}>Field{pathname.includes('/inspection/') ? ' inspection' : ''}</span>
          </Link>
          <Link to="/warranty/today" aria-label="Open the desk app" style={{ color: '#D9CFB8', padding: 10 }}><Monitor size={20} /></Link>
          <button onClick={out} aria-label="Sign out" style={{ background: 'none', border: 'none', color: '#D9CFB8', padding: 10, cursor: 'pointer' }}><LogOut size={20} /></button>
        </div>
        <SyncBar />
      </header>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '14px 14px 110px' }}><Outlet /></main>
      <style>{`.spin{animation:sp .9s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
