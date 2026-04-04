import { supabase } from '@/lib/supabase';
import type { Plan, TenantEntitlement } from '@/types/entitlements';

function mapPlan(row: any): Plan {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    monthlyPrice: row.monthly_price != null ? Number(row.monthly_price) : undefined,
    annualPrice: row.annual_price != null ? Number(row.annual_price) : undefined,
    description: row.description ?? undefined,
    active: Boolean(row.active),
    createdAt: row.created_at ?? undefined,
  };
}

function mapTenantEntitlement(row: any): TenantEntitlement {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planId: row.plan_id ?? undefined,
    featureKey: row.feature_key,
    enabled: row.enabled ?? undefined,
    limitOverride: row.limit_override ?? undefined,
    source: row.source ?? 'plan',
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

export const entitlementsService = {
  async getPlan(planId: string): Promise<Plan | null> {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return mapPlan(data);
  },

  async getTenantEntitlements(tenantId: string): Promise<TenantEntitlement[]> {
    const { data, error } = await supabase
      .from('tenant_entitlements')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return (data ?? []).map(mapTenantEntitlement);
  },
};