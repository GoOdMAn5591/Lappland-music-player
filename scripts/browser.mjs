import { chromium, webkit } from "@playwright/test";
// SwiftShader is only a fallback: machines with a GPU keep hardware WebGL.
const webgl = ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
/** TAVERN_BROWSER=webkit runs the same checks in Safari's engine (macOS CI). */
export const browserName = process.env.TAVERN_BROWSER === "webkit" ? "webkit" : "chromium";
export async function launchBrowser(options = {}) {
  if (browserName === "webkit") {
    // Chromium-only switches mean nothing to WebKit
    const { args: _args, ...rest } = options;
    return patient(await webkit.launch({ headless: true, ...rest }));
  }
  options = { ...options, args: [...webgl, ...(options.args ?? [])] };
  if (process.platform === "win32" && !process.env.CI) {
    for (const channel of ["msedge", "chrome"]) {
      try {
        return patient(await chromium.launch({ headless: true, ...options, channel }));
      } catch {
        /* Fall back to Playwright Chromium. */
      }
    }
  }
  return patient(await chromium.launch({ headless: true, ...options }));
}

/**
 * A browser profile kept on disk, like everyday Safari / Chrome. (Fresh
 * contexts are private-browsing-like: WebKit won't keep audio files in
 * IndexedDB there, just as Safari's private windows don't.)
 */
export async function launchPersistent(dir, options = {}) {
  const type = browserName === "webkit" ? webkit : chromium;
  const args = browserName === "webkit" ? undefined : webgl;
  const context = await type.launchPersistentContext(dir, { headless: true, ...(args ? { args } : {}), ...options });
  context.setDefaultTimeout(60_000);
  return context;
}

/**
 * CI machines have no graphics card: the 3D bar draws in software and every
 * step takes longer than on a real computer. Give each action a minute.
 */
function patient(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await newContext(...args);
    context.setDefaultTimeout(60_000);
    return context;
  };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await newPage(...args);
    page.setDefaultTimeout(60_000);
    return page;
  };
  return browser;
}
