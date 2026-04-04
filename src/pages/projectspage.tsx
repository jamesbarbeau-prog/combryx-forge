import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Plus, Search, FolderOpen, ChevronRight,
  X, Check, DollarSign, Calendar, User, MapPin,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  status: string;
  stage: string | null;
  value: number | null;
  client_id: string | null;
  created_at: string;
  clients?: { first_name: string; last_name: string } | null;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
}

const STAGE_CONFIG: Record<string, { color: string; bg: string }> = {
  DEFINE: { color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
  PLAN:   { color: '#1E5FA4', bg: 'rgba(30,95,164,0.10)'   },
  BUY:    { color: '#D97706', bg: 'rgba(217,119,6,0.10)'   },
  BUILD:  { color: '#8A7600', bg: 'rgba(252,226,5,0.12)'   },
  BILL:   { color: '#16A34A', bg: 'rgba(22,163,74,0.10)'   },
  DONE:   { color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
};

const STATUS_CONFIG: Record<string, { badge: string; label: string }> = {
  active:    { badge: 'forge-badge--success', label: 'Active'    },
  'on-hold': { badge: 'forge-badge--warning', label: 'On Hold'   },
  completed: { badge: 'forge-badge--neutral', label: 'Completed' },
  cancelled: { badge: 'forge-badge--danger',  label: 'Cancelled' },
};

const TRADE_CATEGORIES = [
  { id: 'renovation',  label: 'Renovation'   },
  { id: 'electrical',  label: 'Electrical'   },
  { id: 'plumbing',    label: 'Plumbing'     },
  { id: 'hvac',        label: 'HVAC'         },
  { id: 'painting',    label: 'Painting'     },
  { id: 'masonry',     label: 'Masonry'      },
  { id: 'framing',     label: 'Framing'      },
  { id: 'roofing',     label: 'Roofing'      },
  { id: 'concrete',    label: 'Concrete'     },
  { id: 'drywall',     label: 'Drywall'      },
  { id: 'other',       label: 'Other'        },
];

const PROJECT_TYPES_BY_TRADE: Record<string, string[]> = {
  renovation:  ['Kitchen Renovation', 'Bathroom Renovation', 'Basement Finish', 'Full Renovation', 'Addition', 'New Build', 'Commercial Renovation', 'Condo Renovation'],
  electrical:  ['Rough-In — New Build', 'Rough-In — Renovation', 'Fixture Installation', 'Panel Upgrade', 'EV Charger', 'Generator', 'Service Call', 'Commercial Electrical'],
  plumbing:    ['Rough-In — New Build', 'Rough-In — Renovation', 'Fixture Installation', 'Tub & Shower', 'Drain & Sewer', 'Water Heater', 'Backflow Prevention', 'Service Call', 'Commercial Plumbing'],
  hvac:        ['Furnace Installation', 'Air Conditioning', 'Heat Pump', 'Ductwork', 'Gas Line', 'HRV & Ventilation', 'Service Call', 'Commercial HVAC'],
  painting:    ['Interior Painting', 'Exterior Painting', 'Commercial Building', 'Apartment Block', 'Cabinet Refinishing', 'Epoxy Flooring', 'Service Call'],
  masonry:     ['Brick Repair', 'Stone Work', 'Tuckpointing', 'Chimney', 'Retaining Wall', 'Interlock', 'Foundation Parging', 'Commercial Masonry'],
  framing:     ['New Build', 'Addition', 'Garage', 'Deck & Pergola', 'Basement', 'Commercial Framing'],
  roofing:     ['Full Replacement', 'Repair', 'Flat Roof', 'Shingles', 'Metal Roof', 'Commercial Roofing'],
  concrete:    ['Foundation', 'Driveway', 'Flatwork & Slab', 'Steps & Walkway', 'Retaining Wall', 'Commercial Concrete'],
  drywall:     ['New Build', 'Renovation', 'Patch & Repair', 'Ceiling', 'Commercial Drywall'],
  other:       ['Consultation', 'Service Call', 'Inspection', 'Other'],
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects]         = useState<Project[]>([]);
  const [clients, setClients]           = useState<Client[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [stageFilter, setStageFilter]   = useState('All');
  const [showModal, setShowModal]       = useState(false);

  /* Form */
  const [projectName, setProjectName]   = useState('');
  const [clientId, setClientId]         = useState('');
  const [trade, setTrade]               = useState('');
  const [projectType, setProjectType]   = useState('');
  const [typeSearch, setTypeSearch]     = useState('');
  const [typeOpen, setTypeOpen]         = useState(false);
  const [value, setValue]               = useState('');
  const [address, setAddress]           = useState('');
  const [city, setCity]                 = useState('');
  const [startDate, setStartDate]       = useState('');
  const [endDate, setEndDate]           = useState('');
  const [description, setDescription]   = useState('');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchAll(); }, []);
  
  /* Pre-fill from quote conversion */
  useEffect(() => {
    const fromQuote = searchParams.get('fromQuote');
    const title     = searchParams.get('title');
    const value     = searchParams.get('value');
    if (fromQuote && title) {
      setProjectName(decodeURIComponent(title));
      if (value) setValue(value);
      setShowModal(true);
    }
  }, [searchParams]);

  /* Close type dropdown on outside click */
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) {
        setTypeOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [projRes, clientRes] = await Promise.all([
      supabase.from('projects')
        .select('*, clients(first_name, last_name)')
        .eq('company_id', '00000000-0000-0000-0000-000000000001')
        .order('created_at', { ascending: false }),
      supabase.from('clients')
        .select('id, first_name, last_name')
        .eq('company_id', '00000000-0000-0000-0000-000000000001'),
    ]);
    if (projRes.data)   setProjects(projRes.data as Project[]);
    if (clientRes.data) setClients(clientRes.data as Client[]);
    setLoading(false);
  }

  function resetForm() {
    setProjectName(''); setClientId(''); setTrade('');
    setProjectType(''); setTypeSearch(''); setValue('');
    setAddress(''); setCity(''); setStartDate('');
    setEndDate(''); setDescription(''); setError('');
  }

  /* Filtered type suggestions */
  const allTypes: string[] = trade
    ? (PROJECT_TYPES_BY_TRADE[trade] ?? [])
    : Object.values(PROJECT_TYPES_BY_TRADE).flat();

  const typeOptions = allTypes.filter(t =>
    t.toLowerCase().includes(typeSearch.toLowerCase())
  );

  function selectType(t: string) {
    setProjectType(t);
    setTypeSearch(t);
    setTypeOpen(false);
  }

  async function handleSave() {
    if (!projectName.trim()) { setError('Project name is required'); return; }
    if (!projectType)        { setError('Project type is required'); return; }
    setError(''); setSaving(true);
    const projNum = `P-${String(Date.now()).slice(-3)}`;
    const { error: err } = await supabase.from('projects').insert({
      company_id:     '00000000-0000-0000-0000-000000000001',
      name:           projectName.trim(),
      project_number: projNum,
      client_id:      clientId || null,
      project_type:   projectType,
      value:          value ? parseFloat(value) : null,
      address:        address.trim() || null,
      city:           city.trim() || null,
      start_date:     startDate || null,
      end_date:       endDate || null,
      description:    description.trim() || null,
      status:         'active',
      stage:          'DEFINE',
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowModal(false);
    resetForm();
    fetchAll();
  }

  const stages = ['All', 'DEFINE', 'PLAN', 'BUY', 'BUILD', 'BILL', 'DONE'];

  const filtered = projects.filter(p => {
    const matchStage  = stageFilter === 'All' || p.stage === stageFilter;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.clients ? `${p.clients.first_name} ${p.clients.last_name}`.toLowerCase().includes(search.toLowerCase()) : false);
    return matchStage && matchSearch;
  });

  const inp: React.CSSProperties = {
    height: 38, padding: '0 12px', borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: 'var(--color-panel-raised)',
    color: 'var(--color-text)', fontSize: 13,
    fontFamily: 'var(--font-body)', width: '100%', outline: 'none',
    transition: 'all 0.15s',
  };
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
    textTransform: 'uppercase', color: 'var(--color-muted)',
    marginBottom: 6, display: 'block',
  };
  function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = '#FCE205';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(252,226,5,0.12)';
  }
  function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = 'var(--color-border)';
    e.currentTarget.style.boxShadow = 'none';
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm(); } }}
        >
          <div style={{ background: 'var(--color-panel)', borderRadius: 14, width: '100%', maxWidth: 620, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>

            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(252,226,5,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FolderOpen size={15} color="#FCE205" strokeWidth={1.5} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>New Project</span>
              </div>
              <button onClick={() => { setShowModal(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={16} color="var(--color-muted)" />
              </button>
            </div>

            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Trade + Project Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Trade</label>
                  <select
                    style={inp}
                    value={trade}
                    onChange={e => {
                      setTrade(e.target.value);
                      setProjectType('');
                      setTypeSearch('');
                    }}
                    onFocus={focus} onBlur={blur}
                  >
                    <option value="">All trades...</option>
                    {TRADE_CATEGORIES.map(t => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div ref={typeRef} style={{ position: 'relative' }}>
                  <label style={lbl}>Project Type *</label>
                  <input
                    style={{
                      ...inp,
                      borderColor: typeOpen ? '#FCE205' : 'var(--color-border)',
                      boxShadow: typeOpen ? '0 0 0 3px rgba(252,226,5,0.12)' : 'none',
                    }}
                    placeholder={trade ? `Search ${TRADE_CATEGORIES.find(t => t.id === trade)?.label ?? ''} types...` : 'Search all types...'}
                    value={typeSearch}
                    onChange={e => { setTypeSearch(e.target.value); setProjectType(''); setTypeOpen(true); }}
                    onFocus={() => setTypeOpen(true)}
                  />
                  {typeOpen && typeOptions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                      background: 'var(--color-panel)', border: '1px solid var(--color-border)',
                      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      marginTop: 4, maxHeight: 220, overflowY: 'auto',
                    }}>
                      {typeOptions.map(t => (
                        <div
                          key={t}
                          onMouseDown={() => selectType(t)}
                          style={{
                            padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                            color: t === projectType ? '#8A7600' : 'var(--color-text)',
                            background: t === projectType ? 'rgba(252,226,5,0.08)' : 'transparent',
                            borderBottom: '1px solid var(--color-border)',
                            transition: 'all 0.08s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(252,226,5,0.06)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = t === projectType ? 'rgba(252,226,5,0.08)' : 'transparent'; }}
                        >
                          {t}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Project Name */}
              <div>
                <label style={lbl}>Project Name *</label>
                <input
                  style={inp}
                  placeholder="Henderson Kitchen Renovation"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  onFocus={focus} onBlur={blur}
                />
              </div>

              {/* Client + Value */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Client</label>
                  <div style={{ position: 'relative' }}>
                    <User size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <select style={{ ...inp, paddingLeft: 30 }} value={clientId} onChange={e => setClientId(e.target.value)} onFocus={focus} onBlur={blur}>
                      <option value="">Select client...</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={lbl}>Contract Value</label>
                  <div style={{ position: 'relative' }}>
                    <DollarSign size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input style={{ ...inp, paddingLeft: 30, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="100" placeholder="0.00" value={value} onChange={e => setValue(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Job Site Address</label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input style={{ ...inp, paddingLeft: 30 }} placeholder="123 Main Street" value={address} onChange={e => setAddress(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>City</label>
                  <input style={inp} placeholder="Toronto" value={city} onChange={e => setCity(e.target.value)} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Start Date</label>
                  <div style={{ position: 'relative' }}>
                    <Calendar size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input type="date" style={{ ...inp, paddingLeft: 30 }} value={startDate} onChange={e => setStartDate(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Target End Date</label>
                  <div style={{ position: 'relative' }}>
                    <Calendar size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input type="date" style={{ ...inp, paddingLeft: 30 }} value={endDate} onChange={e => setEndDate(e.target.value)} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={lbl}>Project Description</label>
                <textarea style={{ ...inp, height: 72, padding: '10px 12px', resize: 'none', lineHeight: 1.6 }} placeholder="Brief description of the scope of work..." value={description} onChange={e => setDescription(e.target.value)} onFocus={focus} onBlur={blur} />
              </div>

              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(252,226,5,0.05)', border: '1px solid rgba(252,226,5,0.15)' }}>
                <p style={{ fontSize: 11, color: '#8A7600' }}>Starts at <strong>DEFINE</strong> stage — move through PLAN → BUY → BUILD → BILL → DONE as work progresses.</p>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger-bg)', border: '1px solid #DDB0B0' }}>
                  <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--color-panel-raised)' }}>
              <button className="forge-button forge-button--secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
              <button className="forge-button forge-button--primary" onClick={handleSave} disabled={saving} style={{ gap: 6 }}>
                {saving ? 'Creating...' : <><Check size={13} /> Create Project</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p className="forge-label" style={{ marginBottom: 4 }}>Projects</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>All Projects</h1>
          <p className="forge-subtitle" style={{ marginTop: 2 }}>{projects.length} projects total</p>
        </div>
        <button className="forge-button forge-button--primary" onClick={() => setShowModal(true)}>
          <Plus size={13} /> New Project
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input className="forge-input" placeholder="Search projects..." style={{ paddingLeft: 30 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {stages.map(s => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: stageFilter === s ? 700 : 400,
              borderRadius: 6, cursor: 'pointer',
              background: stageFilter === s ? 'rgba(252,226,5,0.12)' : 'transparent',
              border: stageFilter === s ? '1px solid rgba(252,226,5,0.3)' : '1px solid var(--color-border)',
              color: stageFilter === s ? '#8A7600' : 'var(--color-muted)',
              transition: 'all 0.12s',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="forge-card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)' }}>Loading projects...</div>
        ) : (
          <table className="forge-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Value</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-muted)' }}>
                    {search || stageFilter !== 'All' ? 'No projects match your filter' : 'No projects yet — create your first project'}
                  </td>
                </tr>
              ) : (
                filtered.map(project => (
                  <tr key={project.id} onClick={() => navigate(`/forge/projects/${project.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(252,226,5,0.10)', border: '1px solid rgba(252,226,5,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FolderOpen size={12} color="#8A7600" strokeWidth={1.5} />
                        </div>
                        <p style={{ fontWeight: 600, fontSize: 13 }}>{project.name}</p>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                      {project.clients ? `${project.clients.first_name} ${project.clients.last_name}` : '—'}
                    </td>
                    <td>
                      {project.stage && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100, color: STAGE_CONFIG[project.stage]?.color ?? '#6B7280', background: STAGE_CONFIG[project.stage]?.bg ?? 'rgba(107,114,128,0.10)', letterSpacing: '0.04em' }}>
                          {project.stage}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`forge-badge ${STATUS_CONFIG[project.status]?.badge ?? 'forge-badge--neutral'}`}>
                        {STATUS_CONFIG[project.status]?.label ?? project.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>
                      {project.value ? `$${project.value.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      {new Date(project.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </td>
                    <td><ChevronRight size={13} color="var(--color-muted)" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}