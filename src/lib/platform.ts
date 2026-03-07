// Detect if running inside a Capacitor native app (Android/iOS)
// Returns false for web/PWA — only true when wrapped in native shell

let _isNative: boolean | null = null;

export function isNative(): boolean {
  if (_isNative !== null) return _isNative;
  try {
    // Capacitor injects this on the window object in native apps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    _isNative = !!(win.Capacitor?.isNativePlatform?.());
  } catch {
    _isNative = false;
  }
  return _isNative;
}
