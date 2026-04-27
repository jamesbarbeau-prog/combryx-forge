/**
 * COMBRYX — QDEF API Client
 * ============================================================
 * Single source of truth for all QDEF API calls.
 * Every read from QDEF is silently synced to Supabase.
 * When DATA_SOURCE = 'supabase', reads from Supabase instead.
 * Flip the switch to cancel QDEF.
 *
 * Usage:
 *   import { qdef } from '@/lib/qdefclient';
 *   const sites = await qdef.getSites();
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────────
const QDEF_BASE     = 'https://web.qdef.ca/qdefapi';
const QDEF_CLIENT_ID = 'qdefmobileapp';

// Flip this to 'supabase' when you cancel QDEF
const DATA_SOURCE: 'qdef' | 'supabase' = 'qdef';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Storage keys ──────────────────────────────────────────────────────────────
const QDEF_TOKEN_KEY    = 'qdef_token';
const QDEF_EXPIRY_KEY   = 'qdef_expiry';
const QDEF_USERNAME_KEY = 'qdef_username';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface QDEFSite {
  projectId: string;
  name: string;
}

export interface QDEFLot {
  purchaseId: string;
  label: string;
}

export interface QDEFTrade {
  tradeId: string;
  name: string;
}

export interface QDEFDeficiency {
  projectDeficiencyId: string;
  purchaseId: string;
  projectId: string;
  tradeId?: string;
  description: string;
  comment?: string;
  locItem?: string;
  isActive: boolean;
  dateInString?: string;
}

export interface QDEFInspection {
  inspectionId: string;
  purchaseId: string;
  projectId: string;
  inspectionCategoryName?: string;
  createdDate?: string;
}

export interface QDEFBootstrap {
  sites: QDEFSite[];
  lots: QDEFLot[];
  trades: QDEFTrade[];
  tradeTypes: Array<{ tradeTypeId: string; name: string }>;
  inspectionCategories: Array<{ id: string; name: string }>;
  locationMatrix: any[];
}

export interface QDEFPDIResult {
  email: string;
  cc?: string;
  pdfUrl?: string;
  inspectorName?: string;
}

// ── Supabase client (service role for background writes) ──────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── UUID helper (deterministic from QDEF IDs) ─────────────────────────────────
async function stableUUID(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('MD5' as any, data).catch(() => {
    // Fallback for browsers without MD5 support
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    const h = Math.abs(hash).toString(16).padStart(8, '0');
    return { hex: `${h}${h}-${h.slice(0,4)}-${h.slice(4,8)}-${h.slice(0,4)}-${h}${h.slice(0,8)}` };
  });
  // Simple deterministic UUID from string
  const h = Array.from(input).reduce((a, c) => {
    const code = c.charCodeAt(0);
    return ((a << 5) - a + code) | 0;
  }, 0);
  const hex = Math.abs(h).toString(16).padStart(8, '0').repeat(5);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

// ── Token management ──────────────────────────────────────────────────────────
function getToken(): string | null {
  const token  = localStorage.getItem(QDEF_TOKEN_KEY);
  const expiry = localStorage.getItem(QDEF_EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > parseInt(expiry)) {
    localStorage.removeItem(QDEF_TOKEN_KEY);
    localStorage.removeItem(QDEF_EXPIRY_KEY);
    return null;
  }
  return token;
}

function saveToken(token: string, expiresIn: number) {
  localStorage.setItem(QDEF_TOKEN_KEY, token);
  localStorage.setItem(QDEF_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
}

function clearToken() {
  localStorage.removeItem(QDEF_TOKEN_KEY);
  localStorage.removeItem(QDEF_EXPIRY_KEY);
  localStorage.removeItem(QDEF_USERNAME_KEY);
}

// ── Core QDEF fetch wrapper ───────────────────────────────────────────────────
async function qdefFetch(
  endpoint: string,
  options: { method?: string; body?: any } = {}
): Promise<any> {
  const token = getToken();
  if (!token) throw new Error('QDEF session expired. Please sign in again.');

  const url = `${QDEF_BASE}${endpoint}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`QDEF API error ${res.status}: ${endpoint}`);
  }

  const json = await res.json();
  if (json.statusCode === 401) throw new Error('QDEF session expired. Please sign in again.');
  return json.data ?? json;
}

// ── Background sync to Supabase ───────────────────────────────────────────────
async function syncToSupabase(table: string, rows: any[], conflictColumn = 'id') {
  if (!rows.length) return;
  try {
    await supabase.from(table).upsert(rows, { onConflict: conflictColumn, ignoreDuplicates: false });
  } catch (e) {
    // Silent fail — sync is best effort
    console.debug(`[QDEF→Supabase] sync failed for ${table}:`, e);
  }
}

function uid(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, '0');
  const full = (hex + hex + hex + hex + hex).slice(0, 32);
  return `${full.slice(0,8)}-${full.slice(8,12)}-${full.slice(12,16)}-${full.slice(16,20)}-${full.slice(20,32)}`;
}

// ── QDEF API methods ──────────────────────────────────────────────────────────
export const qdef = {

  // ── AUTH ────────────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id:  QDEF_CLIENT_ID,
      username,
      password,
    });

    const res = await fetch(`${QDEF_BASE}/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!res.ok) throw new Error('Invalid QDEF credentials');

    const json = await res.json();
    if (!json.access_token) throw new Error('Invalid QDEF credentials');

    saveToken(json.access_token, json.expires_in || 31535999);
    localStorage.setItem(QDEF_USERNAME_KEY, username);
  },

  logout() {
    clearToken();
  },

  isAuthenticated(): boolean {
    return getToken() !== null;
  },

  getUsername(): string {
    return localStorage.getItem(QDEF_USERNAME_KEY) || '';
  },

  // ── BOOTSTRAP — all sites, lots, trades ─────────────────────────────────────

  async getBootstrap(): Promise<QDEFBootstrap> {
    if (DATA_SOURCE === 'supabase') {
      const [{ data: comms }, { data: lots }, { data: trades }] = await Promise.all([
        supabase.from('communities').select('*'),
        supabase.from('lots').select('*'),
        supabase.from('trades').select('*'),
      ]);
      return {
        sites: (comms || []).map((c: any) => ({ projectId: c.metadata?.qdef_project_id || c.id, name: c.name })),
        lots:  (lots  || []).map((l: any) => ({ purchaseId: l.qdef_purchase_id || l.id, label: l.lot_number })),
        trades: (trades || []).map((t: any) => ({ tradeId: t.qdef_trade_id || t.id, name: t.company_name })),
        tradeTypes: [],
        inspectionCategories: [],
        locationMatrix: [],
      };
    }

    const data = await qdefFetch(
      '/api/project/getProjectInitials?lastSyncDate=2000-01-01T00:00:00',
      { method: 'POST', body: {} }
    );

    const result: QDEFBootstrap = {
      sites:  (data.userAssignedProject || []).map((s: any) => ({
        projectId: s.value || s.projectId,
        name: s.text || s.name,
      })),
      lots: (data.projectPurchaseList || []).map((l: any) => ({
        purchaseId: l.value,
        label: l.text,
      })),
      trades: (data.projectTradeList || []).map((t: any) => ({
        tradeId: t.value,
        name: t.text,
      })),
      tradeTypes: data.projectTradeTypeList || [],
      inspectionCategories: data.projectInspectionCategoryList || [],
      locationMatrix: data.inspectionLocationGroupData || [],
    };

    // Sync communities to Supabase
    syncToSupabase('communities', result.sites.map(s => ({
      id: uid(s.projectId),
      name: s.name,
      status: 'building',
      metadata: { qdef_project_id: s.projectId },
    })));

    // Sync trades
    syncToSupabase('trades', result.trades.map(t => ({
      id: uid(t.tradeId),
      company_name: t.name,
      qdef_trade_id: t.tradeId,
      active: true,
    })));

    // Sync lots
    syncToSupabase('lots', result.lots.map(l => ({
      id: uid(l.purchaseId),
      lot_number: l.label,
      qdef_purchase_id: l.purchaseId,
      status: 'occupied',
    })));

    return result;
  },

  // ── DEFICIENCIES ────────────────────────────────────────────────────────────

  async getDeficiencies(since = '2000-01-01T00:00:00'): Promise<QDEFDeficiency[]> {
    if (DATA_SOURCE === 'supabase') {
      const { data } = await supabase.from('pdi_items').select('*');
      return (data || []) as any;
    }

    const all: QDEFDeficiency[] = [];
    for (let page = 1; page <= 30; page++) {
      const data = await qdefFetch(
        `/api/project/getProjectDeficiency?lastSyncDate=${since}&pageNumber=${page}`
      );
      const arr = Array.isArray(data) ? data : [];
      if (!arr.length) break;
      all.push(...arr);
      if (arr.length < 500) break;
    }

    // Sync to Supabase
    if (all.length) {
      const forms = [...new Set(all.map(d => d.purchaseId).filter(Boolean))].map(pid => ({
        id: uid('form' + pid),
        lot_id: uid(pid),
        buyer_signed: false,
        builder_signed: false,
      }));
      syncToSupabase('pdi_forms', forms);

      const items = all.map((d, i) => ({
        id: uid(d.projectDeficiencyId || String(i)),
        pdi_form_id: uid('form' + d.purchaseId),
        room: String(d.locItem || d.comment || '').slice(0, 100),
        description: String(d.description || '').slice(0, 500),
        location: String(d.comment || '').slice(0, 200),
        status: d.isActive ? 'noted' : 'complete',
        assigned_trade_id: d.tradeId ? uid(d.tradeId) : null,
      }));
      syncToSupabase('pdi_items', items);
    }

    return all;
  },

  // ── DEFICIENCIES BY LOT ──────────────────────────────────────────────────────

  async getDeficienciesByLot(purchaseId: string): Promise<QDEFDeficiency[]> {
    if (DATA_SOURCE === 'supabase') {
      const lotId = uid(purchaseId);
      const { data } = await supabase
        .from('pdi_items')
        .select('*')
        .eq('pdi_form_id', uid('form' + purchaseId));
      return (data || []) as any;
    }

    const all = await this.getDeficiencies();
    return all.filter(d => d.purchaseId === purchaseId);
  },

  // ── INSPECTIONS ─────────────────────────────────────────────────────────────

  async getInspections(since = '2000-01-01T00:00:00'): Promise<QDEFInspection[]> {
    if (DATA_SOURCE === 'supabase') {
      const { data } = await supabase.from('inspections').select('*');
      return (data || []) as any;
    }

    const data = await qdefFetch(
      `/api/project/getProjectInspection?lastSyncDate=${since}`
    );
    const arr: QDEFInspection[] = Array.isArray(data) ? data : [];

    // Sync
    if (arr.length) {
      syncToSupabase('inspections', arr.map((ins, i) => ({
        id: uid(ins.inspectionId || String(i)),
        lot_id: uid(ins.purchaseId),
        type: 'internal_qa',
        name: String(ins.inspectionCategoryName || 'Inspection').slice(0, 100),
        completed_date: ins.createdDate ? ins.createdDate.slice(0, 10) : null,
        result: 'pass',
      })));
    }

    return arr;
  },

  // ── PDI / HOMEOWNER INFO ─────────────────────────────────────────────────────

  async getPDIInfo(projectId: string, purchaseId: string): Promise<QDEFPDIResult | null> {
    if (DATA_SOURCE === 'supabase') {
      const { data } = await supabase
        .from('buyers')
        .select('*')
        .eq('qdef_purchase_id', purchaseId)
        .single();
      if (!data) return null;
      return { email: data.email, cc: data.cc_email };
    }

    try {
      const data = await qdefFetch('/api/project/ViewInspectionPDI', {
        method: 'POST',
        body: { projectId, purchaseId },
      });

      if (!data?.to) return null;

      const result: QDEFPDIResult = {
        email: data.to,
        cc: data.cc,
        pdfUrl: data.inspectionPDIFile,
        inspectorName: data.designateName,
      };

      // Sync homeowner to Supabase
      syncToSupabase('buyers', [{
        id: uid('buyer' + purchaseId),
        email: data.to.split(';')[0].trim(),
        cc_email: data.cc || null,
        qdef_purchase_id: purchaseId,
      }]);

      return result;
    } catch {
      return null;
    }
  },

  // ── SAVE DEFICIENCY ──────────────────────────────────────────────────────────

  async saveDeficiency(deficiency: {
    mobileDeficiencyId: string;
    projectId: string;
    purchaseId: string;
    inspectorId: string;
    inspectionId: string;
    tradeId: string;
    tradeTypeId: string;
    description: string;
    comment: string;
    dateInString: string;
    isActive: boolean;
    deficiencyImage?: string;
  }): Promise<void> {
    // Write to QDEF
    if (DATA_SOURCE === 'qdef' || DATA_SOURCE === 'supabase') {
      if (getToken()) {
        await qdefFetch('/api/project/SaveDeficiencies', {
          method: 'POST',
          body: [deficiency],
        });
      }
    }

    // Always write to Supabase
    await supabase.from('pdi_items').upsert({
      id: uid(deficiency.mobileDeficiencyId),
      pdi_form_id: uid('form' + deficiency.purchaseId),
      description: deficiency.description,
      location: deficiency.comment,
      status: deficiency.isActive ? 'noted' : 'complete',
      assigned_trade_id: deficiency.tradeId ? uid(deficiency.tradeId) : null,
    });
  },

  // ── SEND PDI EMAIL ───────────────────────────────────────────────────────────

  async sendPDIEmail(projectId: string, purchaseId: string): Promise<void> {
    await qdefFetch('/api/project/SendInspectionPDI', {
      method: 'POST',
      body: { projectId, purchaseId },
    });
  },
};

// ── Export DATA_SOURCE for UI to show migration status ────────────────────────
export { DATA_SOURCE };