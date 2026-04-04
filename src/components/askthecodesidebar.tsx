import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  BookOpen, X, Send, Loader2, Copy, ClipboardList,
  FileText, ChevronDown, ChevronUp, AlertTriangle,
  Sparkles, HardHat,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { page: number; section: string | null; file: string }[];
  chunks_found?: number;
  timestamp: Date;
}

interface AskTheCodeSidebarProps {
  open: boolean;
  onClose: () => void;
}

const SUGGESTED_QUESTIONS = [
  'Minimum ceiling height for a basement?',
  'Fire separation between garage and house?',
  'Egress window size requirements?',
  'Smoke alarm placement rules?',
  'Deck guard height requirements?',
  'Minimum stair riser and tread dimensions?',
];

export default function AskTheCodeSidebar({ open, onClose }: AskTheCodeSidebarProps) {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const [copied, setCopied]         = useState<string | null>(null);
  const bottomRef                   = useRef<HTMLDivElement>(null);
  const inputRef                    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleAsk(question?: string) {
    const q = (question ?? input).trim();
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-the-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ question: q }),
        }
      );

      const data = await res.json();

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer ?? data.error ?? 'No response received.',
        sources: data.sources ?? [],
        chunks_found: data.chunks_found ?? 0,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Connection error — check your internet and try again.',
        timestamp: new Date(),
      }]);
    }

    setLoading(false);
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function addToLog(content: string) {
    const logText = `[OBC Reference — ${new Date().toLocaleDateString('en-CA')}]\n${content}`;
    navigator.clipboard.writeText(logText);
    alert('Copied to clipboard — paste into your Daily Log or Estimate notes.');
  }

  function clearChat() {
    setMessages([]);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Sidebar panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 440, zIndex: 91,
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
          background: 'linear-gradient(135deg, rgba(252,226,5,0.08) 0%, rgba(252,226,5,0.02) 100%)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'rgba(252,226,5,0.15)',
                border: '1px solid rgba(252,226,5,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <HardHat size={16} color="#8A7600" strokeWidth={1.5} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                  Ask The Code
                </p>
                <p style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                  OBC 2024 · Volumes 1 & 2
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  style={{
                    fontSize: 10, padding: '4px 8px', borderRadius: 6,
                    background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                    color: 'var(--color-muted)', cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={16} color="var(--color-muted)" />
              </button>
            </div>
          </div>

          {/* Status bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 6,
            background: 'rgba(45,122,80,0.08)',
            border: '1px solid rgba(45,122,80,0.15)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
            <p style={{ fontSize: 10, color: 'var(--color-success)', fontWeight: 600 }}>
              OBC knowledge base loaded · Powered by Gemini
            </p>
          </div>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div>
              <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
                <BookOpen size={32} color="var(--color-muted)" strokeWidth={1} style={{ marginBottom: 10 }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
                  35-year OBC veteran at your service
                </p>
                <p style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.6 }}>
                  Ask anything about the Ontario Building Code.<br />
                  Get cited answers in plain English.
                </p>
              </div>

              {/* Suggested questions */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>
                  Try asking
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SUGGESTED_QUESTIONS.map(q => (
                    <button
                      key={q}
                      onClick={() => handleAsk(q)}
                      style={{
                        padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                        background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                        fontSize: 12, color: 'var(--color-text-sub)', cursor: 'pointer',
                        fontFamily: 'var(--font-body)', transition: 'all 0.12s',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(252,226,5,0.08)';
                        e.currentTarget.style.borderColor = 'rgba(252,226,5,0.25)';
                        e.currentTarget.style.color = 'var(--color-text)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'var(--color-mist)';
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.color = 'var(--color-text-sub)';
                      }}
                    >
                      <BookOpen size={11} color="var(--color-muted)" strokeWidth={1.5} />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                marginBottom: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {/* User message */}
              {msg.role === 'user' && (
                <div style={{
                  maxWidth: '85%', padding: '10px 14px',
                  background: 'rgba(252,226,5,0.12)',
                  border: '1px solid rgba(252,226,5,0.25)',
                  borderRadius: '12px 12px 2px 12px',
                  fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5,
                }}>
                  {msg.content}
                </div>
              )}

              {/* Assistant message */}
              {msg.role === 'assistant' && (
                <div style={{ maxWidth: '95%', width: '100%' }}>
                  {/* Answer bubble */}
                  <div style={{
                    padding: '12px 14px',
                    background: 'var(--color-panel-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '2px 12px 12px 12px',
                    fontSize: 12, color: 'var(--color-text)', lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        background: 'rgba(252,226,5,0.12)',
                        border: '1px solid rgba(252,226,5,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <HardHat size={11} color="#8A7600" strokeWidth={1.5} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#8A7600', paddingTop: 4 }}>
                        OBC Expert
                      </span>
                    </div>
                    {msg.content}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => copyToClipboard(msg.content, msg.id + '-copy')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: copied === msg.id + '-copy' ? 'rgba(45,122,80,0.12)' : 'var(--color-mist)',
                        border: copied === msg.id + '-copy' ? '1px solid rgba(45,122,80,0.3)' : '1px solid var(--color-border)',
                        color: copied === msg.id + '-copy' ? 'var(--color-success)' : 'var(--color-muted)',
                        cursor: 'pointer', fontFamily: 'var(--font-body)',
                        transition: 'all 0.12s',
                      }}
                    >
                      <Copy size={10} strokeWidth={1.5} />
                      {copied === msg.id + '-copy' ? 'Copied!' : 'Copy Answer'}
                    </button>

                    <button
                      onClick={() => copyToClipboard(msg.content, msg.id + '-estimate')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: copied === msg.id + '-estimate' ? 'rgba(252,226,5,0.12)' : 'var(--color-mist)',
                        border: copied === msg.id + '-estimate' ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)',
                        color: copied === msg.id + '-estimate' ? '#8A7600' : 'var(--color-muted)',
                        cursor: 'pointer', fontFamily: 'var(--font-body)',
                        transition: 'all 0.12s',
                      }}
                    >
                      <FileText size={10} strokeWidth={1.5} />
                      {copied === msg.id + '-estimate' ? 'Copied!' : 'Copy to Estimate'}
                    </button>

                    <button
                      onClick={() => addToLog(msg.content)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: 'var(--color-mist)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-muted)',
                        cursor: 'pointer', fontFamily: 'var(--font-body)',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(30,95,164,0.08)';
                        e.currentTarget.style.borderColor = 'rgba(30,95,164,0.25)';
                        e.currentTarget.style.color = 'var(--color-info)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'var(--color-mist)';
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.color = 'var(--color-muted)';
                      }}
                    >
                      <ClipboardList size={10} strokeWidth={1.5} />
                      Add to Daily Log
                    </button>
                  </div>

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => setExpandedSources(expandedSources === msg.id ? null : msg.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: 10, color: 'var(--color-muted)',
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontFamily: 'var(--font-body)', padding: '2px 0',
                        }}
                      >
                        <BookOpen size={10} strokeWidth={1.5} />
                        {msg.chunks_found} OBC sections searched
                        {expandedSources === msg.id
                          ? <ChevronUp size={10} />
                          : <ChevronDown size={10} />}
                      </button>

                      {expandedSources === msg.id && (
                        <div style={{
                          marginTop: 6, padding: '8px 10px',
                          background: 'var(--color-mist)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 6,
                        }}>
                          {msg.sources.map((s, i) => (
                            <div key={i} style={{
                              fontSize: 10, color: 'var(--color-text-sub)',
                              display: 'flex', alignItems: 'center', gap: 6,
                              marginBottom: i < msg.sources!.length - 1 ? 4 : 0,
                            }}>
                              <span style={{ fontFamily: 'var(--font-mono)', color: '#8A7600' }}>
                                Pg {s.page}
                              </span>
                              <span style={{ color: 'var(--color-border-hard)' }}>·</span>
                              <span>{s.section ?? 'Section'}</span>
                              <span style={{ color: 'var(--color-border-hard)' }}>·</span>
                              <span style={{ color: 'var(--color-muted)' }}>{s.file}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <span style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 4 }}>
                {msg.timestamp.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}

          {/* Thinking spinner */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'rgba(252,226,5,0.12)',
                border: '1px solid rgba(252,226,5,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Loader2 size={14} color="#8A7600" strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <div style={{
                padding: '8px 12px', borderRadius: '2px 10px 10px 10px',
                background: 'var(--color-mist)', border: '1px solid var(--color-border)',
              }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--color-muted)',
                      animation: `bounce 1s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                  <span style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 6 }}>
                    Searching OBC...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Disclaimer */}
        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--color-border)',
          background: 'rgba(184,106,0,0.04)',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: 9, color: 'var(--color-muted)', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
            <AlertTriangle size={9} style={{ marginTop: 1, flexShrink: 0 }} color="var(--color-warning)" />
            Always verify with your local authority having jurisdiction (AHJ). This tool assists — it does not replace a qualified inspector or designer.
          </p>
        </div>

        {/* Input area */}
        <div style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-panel)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input
              ref={inputRef}
              style={{
                flex: 1, height: 40, padding: '0 12px',
                borderRadius: 8, border: '1px solid var(--color-border)',
                background: 'var(--color-panel-raised)',
                fontSize: 13, color: 'var(--color-text)',
                fontFamily: 'var(--font-body)', outline: 'none',
                transition: 'all 0.15s',
              }}
              placeholder="Ask the OBC anything..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAsk()}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#FCE205';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.12)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              disabled={loading}
            />
            <button
              onClick={() => handleAsk()}
              disabled={loading || !input.trim()}
              style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                background: input.trim() && !loading ? '#FCE205' : 'var(--color-mist)',
                border: input.trim() && !loading ? '1px solid #8A7600' : '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              {loading
                ? <Loader2 size={15} color="var(--color-muted)" style={{ animation: 'spin 1s linear infinite' }} />
                : <Send size={15} color={input.trim() ? '#1A1A1B' : 'var(--color-muted)'} strokeWidth={2} />
              }
            </button>
          </div>
          <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 6, textAlign: 'center' }}>
            Press Enter to send · Sources shown after each answer
          </p>
        </div>

      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0);    opacity: 0.4; }
          50%       { transform: translateY(-4px); opacity: 1;   }
        }
      `}</style>
    </>
  );
}