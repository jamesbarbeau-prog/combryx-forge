// Phone shell for on-site work: no sidebar, one big header, thumb-sized controls.
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Monitor } from 'lucide-react';
import { useAuth } from '@/hooks/useauth';
import { BrandShield } from '@/components/identity';

export default function FieldLayout() {
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-canvas)', color: 'var(--color-text)', fontFamily: 'var(--font-body)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'linear-gradient(180deg,#1B2A41,#16233A)', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(env(safe-area-inset-top) + 10px) 14px 10px', borderBottom: '2px solid #B08D4F' }}>
        <Link to="/field" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none', flex: 1 }}>
          <BrandShield size={34} />
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.01em' }}>Field{pathname.includes('/inspection/') ? ' inspection' : ''}</span>
        </Link>
        <Link to="/warranty/today" aria-label="Open the desk app" style={{ color: '#D9CFB8', padding: 10 }}><Monitor size={20} /></Link>
        <button onClick={() => signOut()} aria-label="Sign out" style={{ background: 'none', border: 'none', color: '#D9CFB8', padding: 10, cursor: 'pointer' }}><LogOut size={20} /></button>
      </header>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '14px 14px 110px' }}><Outlet /></main>
    </div>
  );
}
