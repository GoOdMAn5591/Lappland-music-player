// The everyday path in Safari's engine (run with TAVERN_BROWSER=webkit on a
// Mac): the page loads without script errors, songs import into the cellar,
// play, show up in the menu, survive a reload, and the panels open. The 3D bar
// may or may not get a GPU on a build machine, so it accepts both a running
// scene and the "3D unavailable" fallback — but never a broken page.

import { expect as baseExpect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { browserName, launchPersistent } from "./browser.mjs";

const expect = baseExpect.configure({ timeout: 45_000 });
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const output = path.resolve("test-results");
await fs.mkdir(output, { recursive: true });

function wav(frequency, seconds = 20, rate = 22050) {
  const count = rate * seconds;
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + count * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    buffer.writeInt16LE(Math.round(Math.sin((i / rate) * frequency * Math.PI * 2) * 6000), 44 + i * 2);
  return buffer;
}
const files = [];
for (const [index, name] of ["safari-amber", "safari-violet"].entries()) {
  const file = path.join(output, `${name}.wav`);
  await fs.writeFile(file, wav(330 + index * 110));
  files.push(file);
}

// an everyday (not private) profile, so IndexedDB keeps the audio as in Safari
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "tavern-webkit-"));
const context = await launchPersistent(profile, { viewport: { width: 1440, height: 900 } });
const errors = [];
try {
  await context.addInitScript(() => localStorage.setItem("tavern-skip-entrance", "true"));
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(APP_URL);
  await expect(page.locator(".tavern-app")).toHaveAttribute("data-scene", /^(ready|failed)$/, {
    timeout: 90_000,
  });
  const scene = await page.locator(".tavern-app").getAttribute("data-scene");
  const gl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    if (!context) return "no WebGL2";
    const info = context.getExtension("WEBGL_debug_renderer_info");
    return String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER));
  });

  // import into the cellar
  await page.locator('input[type="file"][accept*="audio"]').setInputFiles(files);
  await expect(page.locator(".status-toast")).toContainText(/已添加 2 只酒杯/, { timeout: 90_000 });
  const imported = await page.locator(".status-toast").textContent();
  console.log(`import: ${imported}`);
  expect(imported).toContain("音频与封面已存入本地酒窖");

  // play from the transport (works with or without the 3D bar)
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator("audio").evaluate((audio) => audio.currentTime), { timeout: 30_000 })
    .toBeGreaterThan(0.3);
  await page.getByRole("button", { name: "暂停", exact: true }).click();

  // the menu lists both
  await page.getByLabel("打开酒单", { exact: true }).click();
  await expect(page.locator(".drink-row")).toHaveCount(2);
  await page.getByLabel("关闭酒单", { exact: true }).click();

  // the cellar keeps the songs across a reload (IndexedDB blobs in Safari)
  await page.reload();
  await expect(page.locator(".tavern-app")).toHaveAttribute("data-scene", /^(ready|failed)$/, {
    timeout: 90_000,
  });
  await page.getByLabel("打开酒单", { exact: true }).click();
  await expect(page.locator(".drink-row")).toHaveCount(2);
  await page.getByLabel("关闭酒单", { exact: true }).click();
  await expect.poll(() => page.locator("audio").getAttribute("src")).toMatch(/^blob:/);

  // the panels open and close
  for (const item of [/YouTube/, /Spotify/, /同席/]) {
    await page.getByRole("button", { name: "更多选项", exact: true }).click();
    await page.getByRole("menuitem", { name: item }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }

  // Cmd/Ctrl+O opens the file picker
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
  await page.keyboard.press(browserName === "webkit" ? "Meta+o" : "Control+o");
  await chooser;

  await page.screenshot({ path: path.join(output, `${browserName}-desktop.png`) });
  expect(errors).toEqual([]);
  console.log(`${browserName} passed: scene ${scene} (${gl}), import, play, menu, reload, panels, shortcut.`);
} finally {
  await context.close();
  await fs.rm(profile, { recursive: true, force: true });
}
