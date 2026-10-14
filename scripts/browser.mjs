import { chromium } from "@playwright/test";
// SwiftShader is only a fallback: machines with a GPU keep hardware WebGL.
const webgl = ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
export async function launchBrowser(options = {}) {
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
