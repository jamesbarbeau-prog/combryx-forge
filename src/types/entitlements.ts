export interface Plan {
  id: string;
  name: string;
  displayName: string;
  monthlyPrice?: number | null;
  annualPrice?: number | null;
  description?: string | null;
  active: boolean;
  createdAt?: string;
}

export interface TenantEntitlement {
  id: string;
  tenantId: string;
  planId?: string | null;
  featureKey: string;
  enabled?: boolean | null;
  limitOverride?: number | null;
  source: 'plan' | 'override' | 'trial' | 'promo' | string;
  expiresAt?: string | null;
  createdAt?: string;
}

export interface FeatureFlag {
  key: string;
  label?: string | null;
  description?: string | null;
  defaultValue: boolean;
  requiresPlan?: string | null;
  createdAt?: string;
}