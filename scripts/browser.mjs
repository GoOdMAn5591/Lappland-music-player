import { chromium } from "@playwright/test";
export async function launchBrowser(options = {}) {
  if (process.platform === "win32" && !process.env.CI) {
    for (const channel of ["msedge", "chrome"]) {
      try {
        return await chromium.launch({ headless: true, ...options, channel });
      } catch {
        /* Fall back to Playwright Chromium. */
      }
    }
  }
  return chromium.launch({ headless: true, ...options });
}
