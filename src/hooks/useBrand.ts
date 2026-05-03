import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';

export interface Brand {
  primary:  string;
  dark:     string;
  accent:   string;
  name:     string;
  email:    string;
  phone:    string;
  hst:      string;
  address:  string;
  logo_url: string;
}

const DEFAULT_BRAND: Brand = {
  primary:  '#FCE205',
  dark:     '#111010',
  accent:   '#1E5FA4',
  name:     '',
  email:    '',
  phone:    '',
  hst:      '',
  address:  '',
  logo_url: '',
};

export function useBrand() {
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('company_settings')
        .select('settings')
        .eq('company_id', COMPANY_ID)
        .single();
      if (data?.settings) {
        setBrand({
          primary:  data.settings.brand_primary ?? DEFAULT_BRAND.primary,
          dark:     data.settings.brand_dark    ?? DEFAULT_BRAND.dark,
          accent:   data.settings.brand_accent  ?? DEFAULT_BRAND.accent,
          name:     data.settings.name          ?? '',
          email:    data.settings.email         ?? '',
          phone:    data.settings.phone         ?? '',
          hst:      data.settings.hst           ?? '',
          address:  data.settings.address       ?? '',
          logo_url: data.settings.logo_url      ?? '',
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  return { brand, loading };
}