import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useauth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-canvas)',
        color: 'var(--color-muted)', fontSize: 13,
      }}>
        Loading...
      </div>
    );
  }

  if (!user) return <Navigate to="/forge/login" replace />;

  return <>{children}</>;
}