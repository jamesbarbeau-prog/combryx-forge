import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Shield, CheckCircle2, AlertTriangle, ArrowLeft, Smartphone } from 'lucide-react';

export default function MFASetupPage() {
  const navigate = useNavigate();
  const [step, setStep]           = useState<'choice' | 'totp' | 'verify' | 'done'>('choice');
  const [qrCode, setQrCode]       = useState('');
  const [secret, setSecret]       = useState('');
  const [factorId, setFactorId]   = useState('');
  const [code, setCode]           = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  async function enrollTOTP() {
    setLoading(true); setError('');
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Builder Guardian',
    });
    if (enrollError) { setError(enrollError.message); setLoading(false); return; }
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setStep('totp');
    setLoading(false);
  }

  async function verifyTOTP() {
    if (code.length !== 6) { setError('Enter the 6-digit code'); return; }
    setLoading(true); setError('');

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) { setError(challengeError.message); setLoading(false); return; }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });

    if (verifyError) { setError('Invalid code — check your app and try again'); setLoading(false); return; }

    setStep('done');
    setLoading(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 52,
    padding: '0 14px',
    borderRadius: 10,
    border: '1px solid var(--color-border)',
    background: '#FAFAF8',
    color: 'var(--color-text)',
    fontSize: 28,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.3em',
    textAlign: 'center',
    outline: 'none',
    transition: 'all 0.15s',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F6F4EF 0%, #EDEAE3 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'var(--font-body)',
    }}>
      <div style={{ width: '100%', maxWidth: 460, position: 'relative', zIndex: 1 }}>

        {/* Back */}
        <button
          className="forge-button forge-button--ghost forge-button--sm"
          onClick={() => navigate('/forge/settings')}
          style={{ marginBottom: 20, gap: 6 }}
        >
          <ArrowLeft size={13} /> Back to Settings
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56,
            background: step === 'done' ? 'rgba(45,122,80,0.15)' : 'rgba(37,99,235,0.15)',
            border: `2px solid ${step === 'done' ? 'var(--color-success)' : '#2563EB'}`,
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            {step === 'done'
              ? <CheckCircle2 size={26} color="var(--color-success)" strokeWidth={1.5} />
              : <Shield size={26} color="#1D4ED8" strokeWidth={1.5} />
            }
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {step === 'done' ? 'MFA Enabled!' : 'Set Up Two-Factor Auth'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-sub)', marginTop: 6 }}>
            {step === 'done'
              ? 'Your account is now protected with two-factor authentication'
              : 'Protect your account with an authenticator app'}
          </p>
        </div>

        <div style={{
          background: '#FFFFFF', borderRadius: 16,
          border: '1px solid var(--color-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>

          {/* ── CHOICE STEP ── */}
          {step === 'choice' && (
            <div style={{ padding: '28px' }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-sub)', marginBottom: 20, lineHeight: 1.6 }}>
                Choose your second factor. We recommend an authenticator app — it works offline and is more secure than SMS.
              </p>

              {/* TOTP option */}
              <button
                onClick={enrollTOTP}
                disabled={loading}
                style={{
                  width: '100%', padding: '16px 18px', marginBottom: 12,
                  background: 'rgba(37,99,235,0.05)',
                  border: '1px solid rgba(37,99,235,0.25)',
                  borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 14,
                  textAlign: 'left', transition: 'all 0.12s',
                  fontFamily: 'var(--font-body)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.10)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.05)')}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(37,99,235,0.15)',
                  border: '1px solid rgba(37,99,235,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Smartphone size={18} color="#1D4ED8" strokeWidth={1.5} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 3 }}>
                    Authenticator App
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                    Microsoft Authenticator · Google Authenticator · Authy · 1Password
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100,
                      background: 'rgba(45,122,80,0.12)', color: 'var(--color-success)',
                      border: '1px solid rgba(45,122,80,0.2)', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>Recommended</span>
                    <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>Works offline · Most secure</span>
                  </div>
                </div>
              </button>

              {/* SMS option — coming soon */}
              <div style={{
                width: '100%', padding: '16px 18px',
                background: 'var(--color-mist)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                display: 'flex', alignItems: 'center', gap: 14,
                opacity: 0.6,
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(140,134,128,0.15)',
                  border: '1px solid var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Shield size={18} color="var(--color-muted)" strokeWidth={1.5} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 3 }}>
                    SMS Text Message
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    Receive a code via text to your phone number
                  </p>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100,
                    background: 'rgba(140,134,128,0.15)', color: 'var(--color-muted)',
                    border: '1px solid var(--color-border)', textTransform: 'uppercase', letterSpacing: '0.04em',
                    display: 'inline-block', marginTop: 4,
                  }}>Coming Soon</span>
                </div>
              </div>
            </div>
          )}

          {/* ── TOTP SETUP STEP ── */}
          {step === 'totp' && (
            <div style={{ padding: '28px' }}>
              <p className="forge-label" style={{ marginBottom: 16 }}>Step 1 — Scan QR Code</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 16, lineHeight: 1.6 }}>
                Open <strong>Microsoft Authenticator</strong>, <strong>Google Authenticator</strong>, or <strong>Authy</strong> on your phone and scan this QR code:
              </p>

              {/* QR Code */}
              <div style={{
                display: 'flex', justifyContent: 'center', marginBottom: 20,
              }}>
                <div style={{
                  padding: 16, background: '#FFFFFF',
                  border: '2px solid var(--color-border)',
                  borderRadius: 12,
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  {qrCode && (
                    <img src={qrCode} alt="MFA QR Code" style={{ width: 180, height: 180, display: 'block' }} />
                  )}
                </div>
              </div>

              {/* Manual entry */}
              <div style={{
                padding: '12px 14px', borderRadius: 8, marginBottom: 24,
                background: 'var(--color-mist)',
                border: '1px solid var(--color-border)',
              }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Can't scan? Enter this code manually:
                </p>
                <p style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text)', letterSpacing: '0.08em', wordBreak: 'break-all' }}>
                  {secret}
                </p>
              </div>

              <p className="forge-label" style={{ marginBottom: 10 }}>Step 2 — Enter the 6-digit code from your app</p>
              <input
                type="text"
                maxLength={6}
                style={inputStyle}
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && verifyTOTP()}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#2563EB';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)';
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                autoFocus
              />

              {error && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 8, marginTop: 12,
                  background: 'var(--color-danger-bg)', border: '1px solid #DDB0B0',
                }}>
                  <AlertTriangle size={13} color="var(--color-danger)" strokeWidth={1.5} />
                  <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button
                  className="forge-button forge-button--secondary"
                  onClick={() => setStep('choice')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Back
                </button>
                <button
                  className="forge-button forge-button--primary"
                  onClick={verifyTOTP}
                  disabled={loading || code.length !== 6}
                  style={{ flex: 2, justifyContent: 'center', opacity: code.length !== 6 ? 0.5 : 1 }}
                >
                  {loading ? 'Verifying...' : 'Verify & Enable MFA'}
                </button>
              </div>
            </div>
          )}

          {/* ── DONE STEP ── */}
          {step === 'done' && (
            <div style={{ padding: '28px', textAlign: 'center' }}>
              <CheckCircle2 size={48} color="var(--color-success)" strokeWidth={1.5} style={{ marginBottom: 16 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Two-Factor Authentication Enabled</h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-sub)', lineHeight: 1.6, marginBottom: 24 }}>
                Your account is now protected. You'll be asked for a 6-digit code each time you sign in from a new device.
              </p>
              <div style={{
                padding: '14px 16px', borderRadius: 8, marginBottom: 24,
                background: 'rgba(45,122,80,0.08)',
                border: '1px solid rgba(45,122,80,0.2)',
                textAlign: 'left',
              }}>
                <p style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600, marginBottom: 6 }}>
                  Keep your authenticator app safe
                </p>
                <p style={{ fontSize: 11, color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
                  If you lose access to your authenticator app, contact your Builder Guardian administrator to reset MFA on your account.
                </p>
              </div>
              <button
                className="forge-button forge-button--primary"
                onClick={() => navigate('/forge/dashboard')}
                style={{ width: '100%', justifyContent: 'center', height: 44 }}
              >
                Back to Dashboard
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}