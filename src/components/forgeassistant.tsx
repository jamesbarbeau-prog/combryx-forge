import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  X, Send, Loader2, Copy, FileText,
  ClipboardList, Sparkles, ChevronDown,
  ChevronUp, Zap, RotateCcw,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  draft?: string | null;
  actions?: string[];
  timestamp: Date;
}

interface ForgeAssistantProps {
  open: boolean;
  onClose: () => void;
}

const SUGGESTED = [
  "What's my total outstanding balance?",
  "Which projects are currently active?",
  "Any overdue invoices?",
  "What work orders are scheduled this week?",
  "Draft a follow-up email to my most recent client",
  "Which project has the highest value?",
];

export default function ForgeAssistant({ open, onClose }: ForgeAssistantProps) {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const [copied, setCopied]             = useState<string | null>(null);
  const bottomRef                       = useRef<HTMLDivElement>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(message?: string) {
    const q = (message ?? input).trim();
    if (!q || loading) return;
    setInput('');
    setLoading(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: q,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forge-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            message: q,
            context: `Current page: ${window.location.pathname}`,
          }),
        }
      );

      const data = await res.json();

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer ?? data.error ?? 'No response.',
        draft: data.draft ?? null,
        actions: data.actions ?? [],
        timestamp: new Date(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Connection error — please try again.',
        timestamp: new Date(),
      }]);
    }

    setLoading(false);
  }

  async function copyText(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!open) return null;

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 460, zIndex: 91,
        background: 'var(--color-panel)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.25s ease',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--color-border)',
          background: 'linear-gradient(135deg, rgba(30,95,164,0.06) 0%, rgba(30,95,164,0.02) 100%)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'rgba(30,95,164,0.12)',
                border: '1px solid rgba(30,95,164,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={16} color="#1E5FA4" strokeWidth={1.5} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                  Forge Assistant
                </p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                  Your CRM AI — live data · drafts · actions
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--color-mist)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <RotateCcw size={9} /> Clear
                </button>
              )}
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={16} color="var(--color-muted)" />
              </button>
            </div>
          </div>

          {/* Status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 6,
            background: 'rgba(30,95,164,0.06)',
            border: '1px solid rgba(30,95,164,0.15)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
            <p style={{ fontSize: 10, color: '#1E5FA4', fontWeight: 600 }}>
              Connected to your live CRM · Clients · Projects · Invoices · Dispatch
            </p>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div>
              <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
                <Sparkles size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 10 }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
                  Ask me anything about your business
                </p>
                <p style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.6 }}>
                  I can read your live data, draft emails,<br />and suggest next steps.
                </p>
              </div>

              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>
                Try asking
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SUGGESTED.map(q => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    style={{
                      padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                      background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                      fontSize: 12, color: 'var(--color-text-sub)', cursor: 'pointer',
                      fontFamily: 'var(--font-body)', transition: 'all 0.12s',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(30,95,164,0.06)'; e.currentTarget.style.borderColor = 'rgba(30,95,164,0.2)'; e.currentTarget.style.color = 'var(--color-text)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-mist)'; e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-sub)'; }}
                  >
                    <Zap size={11} color="var(--color-muted)" strokeWidth={1.5} />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map(msg => (
            <div key={msg.id} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>

              {msg.role === 'user' && (
                <div style={{
                  maxWidth: '85%', padding: '10px 14px',
                  background: 'rgba(30,95,164,0.10)',
                  border: '1px solid rgba(30,95,164,0.2)',
                  borderRadius: '12px 12px 2px 12px',
                  fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5,
                }}>
                  {msg.content}
                </div>
              )}

              {msg.role === 'assistant' && (
                <div style={{ maxWidth: '95%', width: '100%' }}>

                  {/* Main answer */}
                  {msg.content && (
                    <div style={{
                      padding: '12px 14px',
                      background: 'var(--color-panel-raised)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '2px 12px 12px 12px',
                      fontSize: 12, color: 'var(--color-text)', lineHeight: 1.7,
                      whiteSpace: 'pre-wrap', marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(30,95,164,0.10)', border: '1px solid rgba(30,95,164,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Sparkles size={11} color="#1E5FA4" strokeWidth={1.5} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#1E5FA4' }}>Forge Assistant</span>
                      </div>
                      {msg.content}
                    </div>
                  )}

                  {/* Draft */}
                  {msg.draft && (
                    <div style={{
                      borderRadius: 10, overflow: 'hidden',
                      border: '1px solid rgba(45,122,80,0.25)',
                      marginBottom: 8,
                    }}>
                      <button
                        onClick={() => setExpandedDraft(expandedDraft === msg.id ? null : msg.id)}
                        style={{
                          width: '100%', padding: '10px 14px',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: 'rgba(45,122,80,0.08)', border: 'none', cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FileText size={12} color="var(--color-success)" strokeWidth={1.5} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)' }}>Draft Generated</span>
                        </div>
                        {expandedDraft === msg.id ? <ChevronUp size={12} color="var(--color-muted)" /> : <ChevronDown size={12} color="var(--color-muted)" />}
                      </button>
                      {expandedDraft === msg.id && (
                        <div style={{ padding: '12px 14px', background: 'var(--color-panel)', borderTop: '1px solid rgba(45,122,80,0.15)' }}>
                          <p style={{ fontSize: 12, color: 'var(--color-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 10, fontFamily: 'var(--font-body)' }}>
                            {msg.draft}
                          </p>
                          <button
                            onClick={() => copyText(msg.draft!, msg.id + '-draft')}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: copied === msg.id + '-draft' ? 'rgba(45,122,80,0.12)' : 'var(--color-mist)',
                              border: copied === msg.id + '-draft' ? '1px solid rgba(45,122,80,0.3)' : '1px solid var(--color-border)',
                              color: copied === msg.id + '-draft' ? 'var(--color-success)' : 'var(--color-muted)',
                              cursor: 'pointer', fontFamily: 'var(--font-body)',
                            }}
                          >
                            <Copy size={10} strokeWidth={1.5} />
                            {copied === msg.id + '-draft' ? 'Copied!' : 'Copy Draft'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                      {msg.actions.map((action, i) => (
                        <div key={i} style={{
                          padding: '10px 14px', borderRadius: 8,
                          background: 'rgba(252,226,5,0.06)',
                          border: '1px solid rgba(252,226,5,0.2)',
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                        }}>
                          <Zap size={12} color="#8A7600" strokeWidth={1.5} style={{ marginTop: 1, flexShrink: 0 }} />
                          <p style={{ fontSize: 11, color: '#8A7600', lineHeight: 1.5 }}>{action}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Copy button */}
                  <button
                    onClick={() => copyText(msg.content, msg.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                      background: copied === msg.id ? 'rgba(45,122,80,0.12)' : 'var(--color-mist)',
                      border: copied === msg.id ? '1px solid rgba(45,122,80,0.3)' : '1px solid var(--color-border)',
                      color: copied === msg.id ? 'var(--color-success)' : 'var(--color-muted)',
                      cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.12s',
                    }}
                  >
                    <Copy size={10} strokeWidth={1.5} />
                    {copied === msg.id ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}

              <span style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 4 }}>
                {msg.timestamp.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}

          {/* Thinking */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(30,95,164,0.10)', border: '1px solid rgba(30,95,164,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Loader2 size={14} color="#1E5FA4" strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '2px 10px 10px 10px', background: 'var(--color-mist)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-muted)', animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                  <span style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 6 }}>Reading your CRM...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--color-border)', background: 'var(--color-panel)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input
              ref={inputRef}
              style={{
                flex: 1, height: 40, padding: '0 12px',
                borderRadius: 8, border: '1px solid var(--color-border)',
                background: 'var(--color-panel-raised)',
                fontSize: 13, color: 'var(--color-text)',
                fontFamily: 'var(--font-body)', outline: 'none', transition: 'all 0.15s',
              }}
              placeholder="Ask about your business..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              onFocus={e => { e.currentTarget.style.borderColor = '#1E5FA4'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(30,95,164,0.10)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
              disabled={loading}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                background: input.trim() && !loading ? '#1E5FA4' : 'var(--color-mist)',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              {loading
                ? <Loader2 size={15} color="var(--color-muted)" style={{ animation: 'spin 1s linear infinite' }} />
                : <Send size={15} color={input.trim() ? '#FFFFFF' : 'var(--color-muted)'} strokeWidth={2} />
              }
            </button>
          </div>
          <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 6, textAlign: 'center' }}>
            Reads live data · Drafts emails · Suggests actions
          </p>
        </div>

        <style>{`
          @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes bounce { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-4px); opacity: 1; } }
        `}</style>
      </div>
    </>
  );
}