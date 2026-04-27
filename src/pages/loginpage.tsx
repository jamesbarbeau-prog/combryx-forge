import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { qdef } from '@/lib/qdefclient';
import { Hammer, Mail, Lock, AlertTriangle, Eye, EyeOff, Shield } from 'lucide-react';

export default function LoginPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [username,  setUsername]  = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [step,      setStep]      = useState<'idle' | 'qdef' | 'supabase' | 'done'>('idle');

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
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password');
      return;
    }
    setError('');
    setLoading(true);

    // ── Step 1: Authenticate with QDEF ────────────────────────────────────────
    setStep('qdef');
    try {
      await qdef.login(username.trim(), password.trim());
    } catch (e: any) {
      // QDEF failed — try Supabase-only (admin accounts)
      console.warn('QDEF auth failed, trying Supabase only:', e.message);
    }

    // ── Step 2: Authenticate with Supabase ───────────────────────────────────
    // Use username as email — if it has no @, append domain
    setStep('supabase');
    const email = username.includes('@') ? username.trim() : `${username.trim()}@combryx.ca`;

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Supabase failed — if QDEF succeeded, create/upsert Supabase account
      if (qdef.isAuthenticated()) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: username.trim(), qdef_username: username.trim() } },
        });

        if (signUpError && signUpError.message !== 'User already registered') {
          setError(`Login failed: ${signUpError.message}`);
          setLoading(false);
          setStep('idle');
          return;
        }

        // Try sign in again after signup
        const { error: retryError } = await supabase.auth.signInWithPassword({ email, password });
        if (retryError) {
          // QDEF works but Supabase needs email confirmation — continue with QDEF only
          console.warn('Supabase requires confirmation, proceeding with QDEF session only');
        }
      } else {
        setError('Invalid username or password');
        setLoading(false);
        setStep('idle');
        return;
      }
    }

    setStep('done');
    setLoading(false);
    const from = (location.state as any)?.from ?? '/warranty/today';
    navigate(from, { replace: true });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSignIn();
  }

  const stepLabel = {
    idle:      '',
    qdef:      'Connecting to QDEF...',
    supabase:  'Authenticating...',
    done:      'Redirecting...',
  }[step];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F6F4EF 0%, #EDEAE3 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'var(--font-body)',
    }}>

      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(252,226,5,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(252,226,5,0.05) 0%, transparent 50%)',
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, background: '#FCE205', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 4px 20px rgba(252,226,5,0.35)',
          }}>
            <Hammer size={26} color="#111010" strokeWidth={2.5} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111010', letterSpacing: '-0.03em', lineHeight: 1 }}>
            Combryx Warranty
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-sub)', marginTop: 6 }}>
            Sign in with your QDEF credentials
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#FFFFFF', borderRadius: 16,
          border: '1px solid var(--color-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>

          {/* Header bar */}
          <div style={{
            padding: '14px 24px',
            borderBottom: '1px solid var(--color-border)',
            background: 'rgba(252,226,5,0.04)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Shield size={13} color="#8A7600" strokeWidth={1.5} />
            <p style={{ fontSize: 11, color: '#8A7600', fontWeight: 600 }}>
              Single sign-on · QDEF + Combryx
            </p>
          </div>

          <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Username */}
            <div>
              <label style={labelStyle}>QDEF Username</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                <input
                  type="text"
                  style={inputStyle}
                  placeholder="James.Barbeau"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={focusInput}
                  onBlur={blurInput}
                  autoComplete="username"
                  autoCapitalize="none"
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
                background: 'var(--color-danger-bg)',
                border: '1px solid #DDB0B0',
              }}>
                <AlertTriangle size={13} color="var(--color-danger)" strokeWidth={1.5} />
                <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              className="forge-button forge-button--primary"
              onClick={handleSignIn}
              disabled={loading}
              style={{
                width: '100%', height: 44, fontSize: 13, fontWeight: 700,
                justifyContent: 'center', marginTop: 4,
                opacity: loading ? 0.8 : 1,
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span style={{
                    width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)',
                    borderTopColor: '#111', borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite', display: 'inline-block',
                  }} />
                  {stepLabel}
                </span>
              ) : 'Sign In'}
            </button>

          </div>

          {/* Footer */}
          <div style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--color-border)',
            background: '#FAFAF8',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Lock size={11} color="var(--color-muted)" />
            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              Your QDEF credentials are never stored
            </p>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}