import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mangablast.app",
  appName: "MangaBlast",
  webDir: "out",
  server: {
    // Load UI from Netlify — updates via git push, no app store release needed
    url: "https://delicate-cactus-5e5fe3.netlify.app",
    cleartext: false,
  },
  plugins: {
    CapacitorHttp: {
      // Patches global fetch() on native — all requests bypass CORS
      enabled: true,
    },
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
