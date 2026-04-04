import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Building2, ChevronRight, Plus, Search, SlidersHorizontal } from 'lucide-react';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  property_type: string;
  status: string;
  created_at: string;
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone, city, property_type, status, created_at')
      .order('created_at', { ascending: false });
    if (data) setClients(data as Client[]);
    setLoading(false);
  }

  const filtered = clients.filter(c => {
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.city ?? '').toLowerCase().includes(search.toLowerCase());
  });

  const activeCount = clients.filter(c => c.status === 'active').length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p className="forge-label" style={{ marginBottom: 4 }}>CRM</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Clients</h1>
          <p className="forge-subtitle" style={{ marginTop: 2 }}>
            {clients.length} clients · {activeCount} active
          </p>
        </div>
        <button className="forge-button forge-button--primary">
          <Plus size={13} /> New Client
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input
            className="forge-input"
            placeholder="Search clients..."
            style={{ paddingLeft: 30 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="forge-icon-button"><SlidersHorizontal size={14} /></button>
      </div>

      <div className="forge-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
            Loading clients...
          </div>
        ) : (
          <table className="forge-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Location</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-muted)' }}>
                    {search ? 'No clients match your search' : 'No clients yet — add your first client'}
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <tr
                    key={c.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/forge/clients/${c.id}`)}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'rgba(252,226,5,0.15)',
                          border: '1px solid rgba(252,226,5,0.30)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#8A7600', flexShrink: 0,
                        }}>
                          {c.first_name[0]}{c.last_name[0]}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 13 }}>{c.first_name} {c.last_name}</p>
                          <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                            {new Date(c.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{c.email ?? '—'}</p>
                      <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{c.phone ?? '—'}</p>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{c.city ?? '—'}</td>
                    <td>
                      <span className="forge-badge forge-badge--neutral">{c.property_type}</span>
                    </td>
                    <td>
                      <span className={`forge-badge ${c.status === 'active' ? 'forge-badge--success' : 'forge-badge--neutral'}`}>
                        {c.status}
                      </span>
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