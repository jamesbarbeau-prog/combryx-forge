import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Mail, Lock, User, AlertTriangle, Eye, EyeOff, MailCheck } from 'lucide-react';
import { BrandShield } from '@/components/identity';
import { CompanyMark } from '@/components/brand';
import { useLoginBrand } from '@/lib/branding';

type Mode = 'signin' | 'signup' | 'sent';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice ?? '';
  const [mode, setMode] = useState<Mode>('signin');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const brand = useLoginBrand(email);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Coming back from the confirmation email: the session is already in the link, so go straight into the app.
  const hashErr = (() => { const h = new URLSearchParams(window.location.hash.replace(/^#/, '')); return h.get('error_description') ?? ''; })();
  const [entering, setEntering] = useState(() => /access_token|[?&]code=/.test(window.location.hash + window.location.search));
  useEffect(() => {
    const go = () => navigate((location.state as { from?: string } | null)?.from ?? '/warranty/today', { replace: true });
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) go(); else setEntering(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((ev, session) => { if (session && (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION')) go(); });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (hashErr) setError(/expired|invalid/i.test(hashErr) ? 'That confirmation link has expired. Sign in, or create the account again to get a new link.' : hashErr.replace(/\+/g, ' ')); }, [hashErr]);

  function switchMode(m: Mode) { setMode(m); setError(''); }

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) { setError('Enter your email and password.'); return; }
    setError(''); setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (authError) { setError('That email and password do not match.'); setLoading(false); return; }
      navigate((location.state as { from?: string } | null)?.from ?? '/warranty/today', { replace: true });
    } catch { setError('Something went wrong. Please try again.'); setLoading(false); }
  }

  async function handleSignUp() {
    const addr = email.trim().toLowerCase();
    if (!first.trim() || !last.trim()) { setError('Enter your first and last name.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(addr)) { setError('Enter your work email address.'); return; }
    if (password.length < 10) { setError('Choose a password of at least 10 characters.'); return; }
    setError(''); setLoading(true);
    try {
      const { data: ok } = await supabase.rpc('signup_allowed', { p_email: addr });
      if (!ok) {
        setError('Accounts are only for staff of a company that uses Builder Guardian. Use your work email, or ask your administrator to invite you.');
        setLoading(false); return;
      }
      const { error: upErr } = await supabase.auth.signUp({
        email: addr, password,
        options: { data: { first_name: first.trim(), last_name: last.trim() }, emailRedirectTo: `${window.location.origin}/warranty/today` },
      });
      if (upErr) {
        setError(/already|registered/i.test(upErr.message) ? 'An account with this email already exists. Sign in instead.' : 'We could not create the account. Check your work email and try again.');
        setLoading(false); return;
      }
      setLoading(false); setMode('sent');
    } catch { setError('Something went wrong. Please try again.'); setLoading(false); }
  }

  const submit = () => (mode === 'signup' ? handleSignUp() : handleSignIn());
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit(); };

  if (entering) return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg,#1B2A41,#16233A)', color: '#fff', fontFamily: 'var(--font-body)', textAlign: 'center', padding: 24 }}>
      <div><BrandShield size={64} /><div style={{ fontWeight: 800, fontSize: 20, marginTop: 14 }}>Email confirmed</div><div style={{ color: '#D9CFB8', marginTop: 6 }}>Signing you in…</div></div>
    </div>
  );

  return (
    <div className="lg">
      <style>{CSS}</style>

      <aside className="lg-side" aria-hidden="true">
        <div className="lg-brand">
          <CompanyMark size={brand.logo ? 76 : 52} brand={brand} />
          {brand.logo
            ? <div className="lg-name"><b style={{ fontSize: 17 }}>{brand.name ?? 'Warranty'}</b><span>Warranty Control Centre</span></div>
            : <div className="lg-name"><b>Builder<br />Guardian<sup>™</sup></b><span>Warranty Control Centre</span></div>}
        </div>
        <p className="lg-line">Every claim, every lot, every defence, kept in one place.</p>
        <div className="lg-art" />
      </aside>

      <main className="lg-main">
        <div className="lg-card">
          <div className="lg-mobile-brand"><CompanyMark size={brand.logo ? 56 : 40} brand={brand} /><b>{brand.logo ? (brand.name ?? 'Warranty') : 'Builder Guardian'}</b></div>

          {mode === 'sent' ? (
            <div className="lg-body" style={{ textAlign: 'center' }}>
              <MailCheck size={34} color="#3F6A8F" strokeWidth={1.6} style={{ margin: '4px auto 12px' }} />
              <h1>Check your inbox</h1>
              <p className="lg-sub">We sent a link to <b>{email.trim().toLowerCase()}</b>. Open it to confirm you work here, then sign in. Until then your account has no access.</p>
              <button className="lg-btn" onClick={() => switchMode('signin')}>Back to sign in</button>
            </div>
          ) : (
            <div className="lg-body">
              <h1>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
              <p className="lg-sub">{mode === 'signin' ? 'Use your work email and password.' : 'For staff only. We email your work address to confirm it.'}</p>

              {notice && mode === 'signin' && <div className="lg-note">{notice}</div>}

              {mode === 'signup' && (
                <div className="lg-row">
                  <div><label>First name</label><div className="lg-in"><User size={14} /><input value={first} onChange={e => setFirst(e.target.value)} onKeyDown={onKey} autoComplete="given-name" /></div></div>
                  <div><label>Last name</label><div className="lg-in"><User size={14} /><input value={last} onChange={e => setLast(e.target.value)} onKeyDown={onKey} autoComplete="family-name" /></div></div>
                </div>
              )}

              <div>
                <label>Work email</label>
                <div className="lg-in"><Mail size={14} />
                  <input type="email" placeholder="you@claridgehomes.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey} autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                </div>
              </div>

              <div>
                <label>Password</label>
                <div className="lg-in"><Lock size={14} />
                  <input type={showPass ? 'text' : 'password'} placeholder={mode === 'signup' ? 'At least 10 characters' : ''} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} style={{ paddingRight: 42 }} />
                  <button type="button" className="lg-eye" onClick={() => setShowPass(s => !s)} aria-label={showPass ? 'Hide password' : 'Show password'}>{showPass ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
              </div>

              {error && <div className="lg-err"><AlertTriangle size={13} /><p>{error}</p></div>}

              <button className="lg-btn" onClick={submit} disabled={loading}>
                {loading ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : (mode === 'signup' ? 'Create account' : 'Sign in')}
              </button>

              <p className="lg-switch">
                {mode === 'signin'
                  ? <>New to your team? <button onClick={() => switchMode('signup')}>Create an account</button></>
                  : <>Already have an account? <button onClick={() => switchMode('signin')}>Sign in</button></>}
              </p>
            </div>
          )}
        </div>
        <p className="lg-foot">{brand.logo && brand.name ? `${brand.name}. ` : 'Builder Guardian. '}Private to company staff.</p>
      </main>
    </div>
  );
}

const CSS = `
.lg{display:flex;min-height:100vh;font-family:var(--font-body);color:#1F2A3C}
.lg-side{position:relative;flex:0 0 46%;max-width:620px;overflow:hidden;display:flex;flex-direction:column;padding:40px 44px;
  background-color:#1B2A41;background-image:var(--texture),linear-gradient(180deg,#22334D 0%,#1A2840 55%,#15223A 100%);border-right:1px solid #101B2E;color:#C8D0DC}
.lg-brand{position:relative;z-index:2;display:flex;align-items:center;gap:14px}
.lg-name{display:flex;flex-direction:column;line-height:1.05}
.lg-name b{font:800 22px var(--font-body);letter-spacing:.03em;color:#F6F2E9;text-transform:uppercase}.lg-name b sup{font-size:10px;vertical-align:top;margin-left:1px}
.lg-name span{font:800 10px var(--font-body);letter-spacing:.1em;color:#C9A96A;margin-top:7px;text-transform:uppercase}
.lg-line{position:relative;z-index:2;margin:34px 0 0;max-width:340px;font:600 19px/1.35 var(--font-body);color:#E4E8EF;letter-spacing:-.01em}
.lg-art{position:absolute;left:0;right:0;bottom:0;height:62%;z-index:1;pointer-events:none;background:url('/brand/house.jpg') 18% 62%/auto 112% no-repeat;
  -webkit-mask-image:linear-gradient(180deg,transparent 0,rgba(0,0,0,.55) 22%,#000 50%);mask-image:linear-gradient(180deg,transparent 0,rgba(0,0,0,.55) 22%,#000 50%)}
.lg-art::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(27,42,65,.35) 0,rgba(27,42,65,0) 40%,rgba(21,34,58,.25) 100%)}
.lg-main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px;background-color:#E8E3DA;background-image:var(--texture),linear-gradient(180deg,#ECE8DF 0%,#E4DFD5 100%)}
.lg-card{width:100%;max-width:420px;background:#F8F6F1;border:1px solid #D9D2C5;border-radius:10px;box-shadow:0 14px 34px rgba(40,32,18,.14);overflow:hidden}
.lg-card::before{content:'';display:block;height:3px;background:linear-gradient(90deg,#8D7140 0%,#B8975A 55%,#A58545 100%)}
.lg-mobile-brand{display:none;align-items:center;gap:10px;padding:18px 28px 0;color:#1B2A41}
.lg-body{padding:26px 28px 28px;display:flex;flex-direction:column;gap:15px}
.lg-body h1{font:800 21px var(--font-body);letter-spacing:-.02em;color:#1B2A41;margin:0}
.lg-sub{font-size:13px;color:#5B6577;line-height:1.5;margin:-8px 0 2px}
.lg-body label{display:block;font:700 11px var(--font-body);letter-spacing:.05em;text-transform:uppercase;color:#6C7280;margin-bottom:7px}
.lg-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.lg-in{position:relative}
.lg-in>svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#8A8F9B;pointer-events:none}
.lg-in input{width:100%;height:44px;box-sizing:border-box;padding:0 14px 0 38px;border-radius:7px;border:1px solid #C6BDAC;background:#FFFFFF;color:#1F2A3C;font:14px var(--font-body);outline:none;transition:border-color .12s,box-shadow .12s}
.lg-in input:focus{border-color:#3F6A8F;box-shadow:0 0 0 3px rgba(63,106,143,.18)}
.lg-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;color:#8A8F9B;padding:8px;display:flex}
.lg-btn{width:100%;height:46px;border-radius:7px;border:1px solid #1B2A41;background:linear-gradient(180deg,#2F5576 0%,#264763 100%);color:#fff;font:700 14px var(--font-body);cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
.lg-btn:hover{background:linear-gradient(180deg,#34607F 0%,#2A506D 100%)}.lg-btn:disabled{opacity:.7;cursor:default}
.lg-btn:focus-visible,.lg-switch button:focus-visible,.lg-eye:focus-visible{outline:2px solid #B08D4F;outline-offset:2px}
.lg-err{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:7px;background:rgba(165,64,47,.08);border:1px solid rgba(165,64,47,.25);color:#A5402F}.lg-err svg{flex-shrink:0;margin-top:2px}.lg-err p{font-size:12.5px;line-height:1.45;margin:0}
.lg-note{padding:10px 12px;border-radius:7px;background:rgba(154,106,22,.1);border:1px solid rgba(154,106,22,.28);color:#7A5410;font-size:12.5px;line-height:1.45}
.lg-switch{font-size:13px;color:#5B6577;text-align:center;margin:2px 0 0}.lg-switch button{background:none;border:0;padding:0;color:#2F5576;font:700 13px var(--font-body);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.lg-foot{font-size:11.5px;color:#7A7F8C;margin-top:18px}
@media (max-width:860px){.lg-side{display:none}.lg-mobile-brand{display:flex}}
`;
