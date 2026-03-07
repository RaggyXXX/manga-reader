import { isNative } from "./platform";

let backgroundTaskRegistered = false;

export async function registerBackgroundSync(): Promise<void> {
  if (!isNative() || backgroundTaskRegistered) return;
  backgroundTaskRegistered = true;

  const { BackgroundRunner } = await import("@capacitor/background-runner");

  // Register a listener for when the app goes to background
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;

    void BackgroundRunner.dispatchEvent({
      label: "com.mangablast.sync",
      event: "checkForUpdates",
      details: {},
    }).catch(() => {
      // Background runner not available — ignore
    });
  });
}
