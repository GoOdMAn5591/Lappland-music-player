import { expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "./browser.mjs";

// 3D bar checks. `?manual` stops the render loop so every frame below is
// produced deterministically with window.__tavern.advance(seconds).
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const output = path.resolve("test-results");
await fs.mkdir(output, { recursive: true });

function wav(frequency, seconds = 20) {
  const rate = 16000,
    count = rate * seconds,
    buffer = Buffer.alloc(44 + count * 2);
  buffer.write("RIFF");
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
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const kick = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-((t * 2) % 1) * 9);
    buffer.writeInt16LE(
      Math.round(
        (Math.sin(t * frequency * Math.PI * 2) * 0.3 + kick * 0.6) * 20000,
      ),
      44 + i * 2,
    );
  }
  return buffer;
}

const names = ["午夜低语", "暗红帷幕", "最后一杯", "银色余温", "无序之夜"];
const files = names.map((name, index) => ({
  name: `${name}.wav`,
  mimeType: "audio/wav",
  buffer: wav(220 + index * 60),
}));

const browser = await launchBrowser({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const advance = (page, seconds, steps) =>
  page.evaluate(([s, n]) => window.__tavern.advance(s, n), [seconds, steps]);

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("tavern-skip-entrance", "true"),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${appUrl}?manual`);
  await page.waitForFunction(() => window.__tavern, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__tavern.character, null, {
    timeout: 30000,
  });
  await advance(page, 1);

  // The canvas is a lit scene, not a flat fill.
  const variance = await page.evaluate(async () => {
    const canvas = document.querySelector(".tavern-canvas");
    const copy = document.createElement("canvas");
    copy.width = 160;
    copy.height = 100;
    const ctx = copy.getContext("2d");
    window.__tavern.advance(0.05, 1);
    ctx.drawImage(canvas, 0, 0, 160, 100);
    const data = ctx.getImageData(0, 0, 160, 100).data;
    let sum = 0,
      sq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = data[i] * 0.3 + data[i + 1] * 0.6 + data[i + 2] * 0.1;
      sum += l;
      sq += l * l;
    }
    const n = data.length / 4;
    return Math.sqrt(sq / n - (sum / n) ** 2);
  });
  expect(variance).toBeGreaterThan(12);

  // Import five songs: five glasses on the ring, the front one largest and lowest.
  await page.locator('input[accept*="audio"]').setInputFiles(files);
  await expect(page.locator(".status-toast")).toContainText("已添加 5 只酒杯", {
    timeout: 30000,
  });
  await advance(page, 1.2);
  await expect(page.locator(".glass-hotspot")).toHaveCount(5);
  await advance(page, 2.5);
  const spots = await page.locator(".glass-hotspot").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.trackId,
        offset: Number(el.dataset.offset),
        x: r.x + r.width / 2,
        bottom: r.bottom,
        width: r.width,
      };
    }),
  );
  const byOffset = Object.fromEntries(spots.map((s) => [s.offset, s]));
  expect(Math.abs(byOffset[0].x - 720)).toBeLessThan(40);
  expect(byOffset[-2].bottom).toBeLessThan(byOffset[-1].bottom);
  expect(byOffset[-1].bottom).toBeLessThan(byOffset[0].bottom);
  expect(byOffset[2].bottom).toBeLessThan(byOffset[1].bottom);
  expect(byOffset[0].width).toBeGreaterThan(byOffset[2].width);

  // Every glass sits on the counter ring and the current one is in the spotlight.
  const ring = await page.evaluate(() => {
    const glasses = [...window.__tavern.carousel.glasses.values()];
    return glasses.map((g) => Math.hypot(g.root.position.x, g.root.position.z));
  });
  for (const r of ring) expect(Math.abs(r - 2.43)).toBeLessThan(0.01);

  // Next: the right glass slides to the front along the arc, its drink sloshing.
  const incoming = byOffset[1].id;
  await page.getByLabel("下一首", { exact: true }).click();
  await expect(
    page.locator(`.glass-hotspot[data-track-id="${incoming}"]`),
  ).toHaveClass(/is-current/);
  // pause straight away: software-rendered frames are slow and the song must not end mid-test
  await page.getByLabel("暂停", { exact: true }).click();
  const path3d = [];
  let maxTilt = 0;
  for (let i = 0; i < 8; i++) {
    const sample = await page.evaluate((id) => {
      window.__tavern.advance(0.08, 3);
      const g = window.__tavern.carousel.glasses.get(id);
      return {
        x: g.root.position.x,
        z: g.root.position.z,
        tilt: Math.hypot(g.tilt.x, g.tilt.y),
      };
    }, incoming);
    path3d.push(sample);
    maxTilt = Math.max(maxTilt, sample.tilt);
  }
  for (const p of path3d)
    expect(Math.abs(Math.hypot(p.x, p.z) - 2.43)).toBeLessThan(0.01);
  expect(path3d[0].x).toBeGreaterThan(path3d[path3d.length - 1].x);
  expect(maxTilt).toBeGreaterThan(0.02);
  await advance(page, 2);
  const settled = await page.evaluate(
    (id) => window.__tavern.carousel.glasses.get(id).root.position.x,
    incoming,
  );
  expect(Math.abs(settled)).toBeLessThan(0.02);

  // Playing pours the current drink colour from Lappland's bottle.
  await page.getByLabel("播放", { exact: true }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el) => !el.paused && el.currentTime > 0),
    )
    .toBe(true);
  await page.waitForTimeout(600);
  await advance(page, 1.5);
  expect(
    await page.evaluate(() => window.__tavern.character.pour),
  ).toBeGreaterThan(0.7);
  await page.getByLabel("暂停", { exact: true }).click();

  // Hovering a glass shows its drink card.
  const current = page.locator(".glass-hotspot.is-current");
  await current.hover();
  await advance(page, 0.3);
  await expect(page.locator(".glass-tooltip")).toHaveClass(/is-visible/);
  await expect(page.locator(".glass-tooltip strong")).toHaveText(names[1]);
  await page.screenshot({ path: path.join(output, "scene-desktop.png") });

  // Drag a glass along the bar to a new place in the menu.
  // after "next" the first song sits left of the front glass; drop it two places to the right
  const from = await page
    .locator('.glass-hotspot[data-offset="-1"]')
    .boundingBox();
  const to = await page
    .locator('.glass-hotspot[data-offset="2"]')
    .boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / 6 + from.width / 2,
      from.y + ((to.y - from.y) * i) / 6 + from.height / 2,
    );
    await advance(page, 0.05, 1);
  }
  await page.mouse.up();
  await advance(page, 1.5);
  await page.getByLabel("打开酒单", { exact: true }).click();
  const order = await page
    .locator(".drink-row .drink-line strong")
    .allTextContents();
  expect(order.indexOf(names[0])).toBeGreaterThan(order.indexOf(names[2]));
  await page.getByLabel("关闭酒单", { exact: true }).click();

  // Quality can be pinned from the overflow menu.
  await page.getByRole("button", { name: "更多选项", exact: true }).click();
  await page.locator(".quality-row button", { hasText: "低" }).click();
  expect(await page.evaluate(() => window.__tavern.quality)).toBe("low");
  await page.locator(".quality-row button", { hasText: "自动" }).click();
  expect(await page.evaluate(() => window.__tavern.quality)).toBe("high");
  await page.keyboard.press("Escape");

  // Phone layout: hero glass, plaque and transport all fit.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await advance(page, 1);
  await expect(page.getByLabel("播放", { exact: true })).toBeInViewport();
  await expect(page.locator(".plaque-title")).toBeInViewport();
  await expect(page.locator(".glass-hotspot.is-current")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: path.join(output, "scene-mobile.png") });
  await context.close();

  // Reduced motion keeps the scene still but working.
  const calm = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    reducedMotion: "reduce",
  });
  await calm.addInitScript(() =>
    localStorage.setItem("tavern-skip-entrance", "true"),
  );
  const calmPage = await calm.newPage();
  calmPage.on("pageerror", (error) => errors.push(error.message));
  await calmPage.goto(`${appUrl}?manual`);
  await calmPage.waitForFunction(() => window.__tavern, null, {
    timeout: 30000,
  });
  expect(await calmPage.evaluate(() => window.__tavern.reduced)).toBe(true);
  await calm.close();

  expect(errors).toEqual([]);
  console.log(
    "Scene passed: lit canvas, ring layout, arc pour with liquid inertia, pour stream, hover card, drag reorder, quality menu, phone fit, reduced motion.",
  );
} finally {
  await browser.close();
}
