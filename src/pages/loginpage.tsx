import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Hammer, Mail, Lock, AlertTriangle, Eye, EyeOff, Shield, UserPlus, LogIn } from 'lucide-react';

type Mode = 'signin' | 'signup' | 'mfa';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode]           = useState<Mode>('signin');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [fullName, setFullName]   = useState('');
  const [mfaCode, setMfaCode]     = useState('');
  const [factorId, setFactorId]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

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
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }
    setError(''); setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) { setError(authError.message); setLoading(false); return; }

    /* Check if MFA is required */
    if (data?.session === null && data?.user === null) {
      /* MFA challenge needed */
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totp = factorsData?.totp?.[0];
      if (totp) {
        setFactorId(totp.id);
        setMode('mfa');
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    navigate('/warranty/today')
  }

  async function handleSignUp() {
    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    if (!email.trim())    { setError('Please enter your email'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPass) { setError('Passwords do not match'); return; }

    setError(''); setLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });

    if (signUpError) { setError(signUpError.message); setLoading(false); return; }

    setSuccess('Account created! Check your email to confirm, or sign in if confirmation is disabled.');
    setMode('signin');
    setLoading(false);
  }

  async function handleMFA() {
    if (mfaCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return; }
    setError(''); setLoading(true);

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) { setError(challengeError.message); setLoading(false); return; }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: mfaCode,
    });

    if (verifyError) { setError('Invalid code — try again'); setLoading(false); return; }

    setLoading(false);
    navigate('/forge/dashboard');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      if (mode === 'signin') handleSignIn();
      if (mode === 'signup') handleSignUp();
      if (mode === 'mfa')    handleMFA();
    }
  }

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

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>

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
            Combryx Forge
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-sub)', marginTop: 6 }}>
            {mode === 'signin' ? 'Sign in to your account' :
             mode === 'signup' ? 'Create your account' :
             'Two-factor authentication'}
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#FFFFFF', borderRadius: 16,
          border: '1px solid var(--color-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>

          {/* Tab switcher — only show for signin/signup */}
          {mode !== 'mfa' && (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
              {([['signin', 'Sign In', LogIn], ['signup', 'Create Account', UserPlus]] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => { setMode(key); setError(''); setSuccess(''); }}
                  style={{
                    flex: 1, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    fontSize: 12, fontWeight: mode === key ? 700 : 400,
                    color: mode === key ? '#8A7600' : 'var(--color-muted)',
                    background: mode === key ? 'rgba(252,226,5,0.06)' : '#FAFAF8',
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    borderBottom: mode === key ? '2px solid #FCE205' : '2px solid transparent',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <Icon size={13} strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* MFA header */}
          {mode === 'mfa' && (
            <div style={{
              padding: '18px 28px',
              borderBottom: '1px solid var(--color-border)',
              background: 'rgba(252,226,5,0.04)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Shield size={16} color="#8A7600" strokeWidth={1.5} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700 }}>Two-Factor Verification</p>
                <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
            </div>
          )}

          <div style={{ padding: '28px' }}>

            {/* SUCCESS MESSAGE */}
            {success && (
              <div style={{
                padding: '12px 14px', borderRadius: 8, marginBottom: 20,
                background: 'var(--color-success-bg)',
                border: '1px solid #B2D9C0',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Shield size={13} color="var(--color-success)" strokeWidth={1.5} />
                <p style={{ fontSize: 12, color: 'var(--color-success)' }}>{success}</p>
              </div>
            )}

            {/* ── SIGN IN FORM ── */}
            {mode === 'signin' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input type="email" style={inputStyle} placeholder="you@company.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      onKeyDown={handleKeyDown} onFocus={focusInput} onBlur={blurInput} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
                    <button style={{ fontSize: 11, color: '#8A7600', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Forgot password?
                    </button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input type={showPass ? 'text' : 'password'} style={{ ...inputStyle, paddingRight: 42 }}
                      placeholder="••••••••" value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={handleKeyDown} onFocus={focusInput} onBlur={blurInput} />
                    <button onClick={() => setShowPass(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}>
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── SIGN UP FORM ── */}
            {mode === 'signup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <UserPlus size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input type="text" style={inputStyle} placeholder="John Doe"
                      value={fullName} onChange={e => setFullName(e.target.value)}
                      onKeyDown={handleKeyDown} onFocus={focusInput} onBlur={blurInput} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input type="email" style={inputStyle} placeholder="you@company.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      onKeyDown={handleKeyDown} onFocus={focusInput} onBlur={blurInput} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input type={showPass ? 'text' : 'password'} style={{ ...inputStyle, paddingRight: 42 }}
                      placeholder="Min. 8 characters" value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={handleKeyDown} onFocus={focusInput} onBlur={blurInput} />
                    <button onClick={() => setShowPass(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}>
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input type="password" style={inputStyle} placeholder="Repeat password"
                      value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                      onKeyDown={handleKeyDown} onFocus={focusInput} onBlur={blurInput} />
                  </div>
                </div>
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(252,226,5,0.06)',
                  border: '1px solid rgba(252,226,5,0.2)',
                }}>
                  <p style={{ fontSize: 11, color: '#8A7600' }}>
                    By creating an account you agree to the Combryx Terms of Service and Privacy Policy.
                  </p>
                </div>
              </div>
            )}

            {/* ── MFA FORM ── */}
            {mode === 'mfa' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>6-Digit Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    style={{
                      ...inputStyle,
                      paddingLeft: 14,
                      textAlign: 'center',
                      fontSize: 24,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      letterSpacing: '0.3em',
                    }}
                    placeholder="000000"
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={handleKeyDown}
                    onFocus={focusInput}
                    onBlur={blurInput}
                    autoFocus
                  />
                </div>
                <p style={{ fontSize: 11, color: 'var(--color-muted)', textAlign: 'center' }}>
                  Open Google Authenticator, Authy, or 1Password and enter the code for Combryx Forge
                </p>
                <button
                  style={{ fontSize: 12, color: '#8A7600', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center' }}
                  onClick={() => { setMode('signin'); setMfaCode(''); setError(''); }}
                >
                  ← Back to sign in
                </button>
              </div>
            )}

            {/* ERROR */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 8, marginTop: 16,
                background: 'var(--color-danger-bg)',
                border: '1px solid #DDB0B0',
              }}>
                <AlertTriangle size={13} color="var(--color-danger)" strokeWidth={1.5} />
                <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>
              </div>
            )}

            {/* SUBMIT */}
            <button
              className="forge-button forge-button--primary"
              onClick={mode === 'signin' ? handleSignIn : mode === 'signup' ? handleSignUp : handleMFA}
              disabled={loading}
              style={{ width: '100%', height: 44, fontSize: 13, fontWeight: 700, justifyContent: 'center', marginTop: 20, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Please wait...' :
               mode === 'signin' ? 'Sign In to Forge' :
               mode === 'signup' ? 'Create Account' :
               'Verify Code'}
            </button>

          </div>

          {/* Footer */}
          <div style={{
            padding: '14px 28px',
            borderTop: '1px solid var(--color-border)',
            background: '#FAFAF8',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Lock size={11} color="var(--color-muted)" />
            <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              Secured with Supabase Auth · MFA Available · RLS Enabled
            </p>
          </div>
        </div>

        {/* Demo hint */}
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: 'rgba(252,226,5,0.08)',
          border: '1px solid rgba(252,226,5,0.2)',
          borderRadius: 10, textAlign: 'center',
        }}>
          <p style={{ fontSize: 11, color: '#8A7600' }}>
            Demo: <strong>admin@combryxdemo.com</strong> / <strong>Combryx2024!</strong>
          </p>
        </div>

      </div>
    </div>
  );
}