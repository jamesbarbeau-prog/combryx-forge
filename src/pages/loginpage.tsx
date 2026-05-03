import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Hammer, Mail, Lock, AlertTriangle, Eye, EyeOff, Shield } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44,
    padding: '0 14px 0 42px',
    borderRadius: 10,
    border: '1px solid var(--color-border)',
    background: '#FAFAF8',
    color: 'var(--color-text)',
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    outline: 'none',
    transition: 'all 0.15s',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--color-muted)', marginBottom: 8,
  };

  function focusInput(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = '#FCE205';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.15)';
    e.currentTarget.style.background = '#FFFFFF';
  }

  function blurInput(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--color-border)';
    e.currentTarget.style.boxShadow = 'none';
    e.currentTarget.style.background = '#FAFAF8';
  }

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (authError) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      const from = (location.state as any)?.from ?? '/warranty/today';
      navigate(from, { replace: true });
    } catch {
      setError('Something went wrong — please try again');
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSignIn();
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F6F4EF 0%, #EDEAE3 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'var(--font-body)',
    }}>
      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, background: '#FCE205', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', boxShadow: '0 4px 20px rgba(252,226,5,0.35)',
          }}>
            <Hammer size={26} color="#111010" strokeWidth={2.5} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111010', letterSpacing: '-0.03em', lineHeight: 1 }}>
            Combryx Warranty
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 6 }}>
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#FFFFFF', borderRadius: 16,
          border: '1px solid var(--color-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 24px', borderBottom: '1px solid var(--color-border)',
            background: 'rgba(252,226,5,0.04)', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Shield size={13} color="#8A7600" strokeWidth={1.5} />
            <p style={{ fontSize: 11, color: '#8A7600', fontWeight: 600 }}>
              Combryx Warranty System
            </p>
          </div>

          <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                <input
                  type="email"
                  style={inputStyle}
                  placeholder="you@claridgehomes.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={focusInput}
                  onBlur={blurInput}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  style={{ ...inputStyle, paddingRight: 42 }}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={focusInput}
                  onBlur={blurInput}
                  autoComplete="current-password"
                />
                <button
                  onClick={() => setShowPass(s => !s)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
              }}>
                <AlertTriangle size={13} color="#DC2626" strokeWidth={1.5} />
                <p style={{ fontSize: 12, color: '#DC2626' }}>{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSignIn}
              disabled={loading}
              style={{
                width: '100%', height: 44, fontSize: 13, fontWeight: 700,
                borderRadius: 10, border: 'none', cursor: loading ? 'default' : 'pointer',
                background: loading ? '#D4A800' : '#FCE205',
                color: '#111010', fontFamily: 'var(--font-body)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: loading ? 0.8 : 1, marginTop: 4,
                transition: 'all 0.15s',
              }}
            >
              {loading ? (
                <>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </div>

          <div style={{ padding: '12px 24px', borderTop: '1px solid var(--color-border)', background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Lock size={11} color="var(--color-muted)" />
            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>Secured by Supabase Auth</p>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}