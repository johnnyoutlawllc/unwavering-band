import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://unwavering.band';

const config: CapacitorConfig = {
  appId: 'com.johnnyoutlaw.unwaveringband',
  appName: 'Unwavering Band',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https',
    allowNavigation: [
      'unwavering.band',
      'www.unwavering.band',
      'auth.outlawapps.online',
      '*.supabase.co',
      'accounts.google.com',
      'appleid.apple.com',
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Google OAuth blocks embedded WebViews (disallowed_useragent).
    // Same workaround as shutterfield-mobile until Custom Tabs land.
    overrideUserAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  },
  ios: {
    scheme: 'unwaveringband',
    contentInset: 'automatic',
    scrollEnabled: true,
  },
  plugins: {
    BackgroundLocation: {},
  },
};

export default config;
