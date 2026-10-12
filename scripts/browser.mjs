import { chromium } from "@playwright/test";
// SwiftShader is only a fallback: machines with a GPU keep hardware WebGL.
const webgl = ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
export async function launchBrowser(options = {}) {
  options = { ...options, args: [...webgl, ...(options.args ?? [])] };
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
