import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ca.claridge.builderguardian',
  appName: 'Builder Guardian',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  plugins: { SystemBars: { insetsHandling: 'css' } },
};

export default config;
