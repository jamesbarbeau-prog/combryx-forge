import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface Features {
  dispatch: boolean;
  opportunities: boolean;
  quotes: boolean;
  procurement: boolean;
  permits: boolean;
  defense_vault: boolean;
  phase_invoicing: boolean;
  service_calls: boolean;
  maintenance_contracts: boolean;
  crew_tracking: boolean;
  obc_ask_the_code: boolean;
  reports: boolean;
  automations: boolean;
}

const DEFAULTS: Features = {
  dispatch: true,
  opportunities: true,
  quotes: true,
  procurement: true,
  permits: true,
  defense_vault: true,
  phase_invoicing: true,
  service_calls: false,
  maintenance_contracts: false,
  crew_tracking: true,
  obc_ask_the_code: true,
  reports: true,
  automations: false,
};

interface FeatureStore {
  features: Features;
  loading: boolean;
  fetchFeatures: () => Promise<void>;
  setFeature: (key: keyof Features, value: boolean) => Promise<void>;
  saveFeatures: (features: Features) => Promise<void>;
}

export const useFeatureStore = create<FeatureStore>((set, get) => ({
  features: DEFAULTS,
  loading: true,

  fetchFeatures: async () => {
    const { data } = await supabase
      .from('company_settings')
      .select('features')
      .eq('company_id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (data?.features) {
      set({ features: { ...DEFAULTS, ...data.features }, loading: false });
    } else {
      set({ loading: false });
    }
  },

  setFeature: async (key, value) => {
    const updated = { ...get().features, [key]: value };
    set({ features: updated });
    await supabase
      .from('company_settings')
      .update({ features: updated, updated_at: new Date().toISOString() })
      .eq('company_id', '00000000-0000-0000-0000-000000000001');
  },

  saveFeatures: async (features) => {
    set({ features });
    await supabase
      .from('company_settings')
      .update({ features, updated_at: new Date().toISOString() })
      .eq('company_id', '00000000-0000-0000-0000-000000000001');
  },
}));