// Builder Guardian brand mark + wordmark.
import { GuardianSignatureIcon } from '@/components/icons/GuardianSignatureIcons';
import { BrandShield } from '@/components/identity';
import { useBrand, type Brand } from '@/lib/branding';

/** The shield sits on a white tile so it reads on navy and on white alike. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28), background: '#FFFFFF',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, 0 2px 8px rgba(0,0,0,0.25)',
    }}>
      <GuardianSignatureIcon name="guardian-core" size={Math.round(size * 0.78)} />
    </div>
  );
}

export function Wordmark({ dark = false, size = 15 }: { dark?: boolean; size?: number }) {
  return (
    <div style={{ lineHeight: 1.05 }}>
      <div style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', color: dark ? '#1F2A3C' : '#FFFFFF' }}>Builder Guardian</div>
      <div style={{ fontSize: Math.max(10, size - 4), fontWeight: 600, color: dark ? '#6C7280' : '#8FA3CC', marginTop: 2 }}>Warranty management</div>
    </div>
  );
}

/** The company's own logo on a white tile; the Builder Guardian shield until they upload one. */
export function CompanyMark({ size = 44, brand }: { size?: number; brand?: Brand }) {
  const own = useBrand(); const b = brand ?? own;
  if (!b.logo) return <BrandShield size={size} />;
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.2), background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: Math.round(size * 0.06), boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
      <img src={b.logo} alt={b.name ?? 'Company logo'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    </div>
  );
}
