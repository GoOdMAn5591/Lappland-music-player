import { expect as baseExpect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { launchBrowser } from "./browser.mjs";

// Without a graphics card (CI) the 3D bar draws in software: allow for slow steps.
const expect = baseExpect.configure({ timeout: 30_000 });

// End-to-end pass over the everyday flow: import, play, pour the next glass,
// menu sections, bartender's notes, reorder, JSON round trip and phone layout.
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const outputDir = path.resolve("test-results");

function createWavBuffer(frequency, seconds = 30, sampleRate = 22050) {
  const samples = Math.floor(sampleRate * seconds);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / 1200, (samples - i) / 1200);
    const value =
      Math.sin((2 * Math.PI * frequency * i) / sampleRate) * envelope;
    buffer.writeInt16LE(Math.floor(value * 26000), 44 + i * 2);
  }
  return buffer;
}

await fs.mkdir(outputDir, { recursive: true });
const audioDir = await fs.mkdtemp(
  path.join(os.tmpdir(), "lappland-player-audio-"),
);
const audioPaths = [];
for (const [name, frequency] of [
  ["midnight-lowball.wav", 220],
  ["curtain-ember.wav", 330],
  ["private-cellar.wav", 440],
]) {
  const filePath = path.join(audioDir, name);
  await fs.writeFile(filePath, createWavBuffer(frequency));
  audioPaths.push(filePath);
}

const browser = await launchBrowser({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "跳过入场动画" }).click();
  await expect(page.locator(".plaque-title")).toHaveText("吧台还空着");
  await expect(page.locator(".tavern-app")).toHaveAttribute(
    "data-scene",
    "ready",
    { timeout: 60_000 },
  );

  await page
    .locator('input[type="file"][accept*="audio"]')
    .setInputFiles(audioPaths);
  await expect(page.locator(".status-toast")).toContainText(/已添加 3 只酒杯/, {
    timeout: 90_000,
  });
  await expect(page.locator(".glass-hotspot")).toHaveCount(3, {
    timeout: 30_000,
  });

  // the glass to the right of the front one is the next drink
  await page.locator('.glass-hotspot[data-offset="1"]').click();
  await expect(page.getByLabel("暂停", { exact: true })).toBeVisible();
  const firstSource = await page
    .locator("audio")
    .evaluate((audio) => audio.getAttribute("src"));
  if (!firstSource?.startsWith("blob:"))
    throw new Error("Audio element did not receive a blob source.");
  await page.getByLabel("下一首", { exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByLabel("暂停", { exact: true }).click();

  // menu: new section, notes, membership, reorder
  await page.getByLabel("打开酒单", { exact: true }).click();
  await expect(page.locator(".menu-drawer")).toHaveClass(/is-open/);
  await page.getByLabel("新建歌单", { exact: true }).click();
  await page.getByPlaceholder("新菜单名").fill("烈酒试饮");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /烈酒试饮/ })).toBeVisible();
  await page.getByRole("button", { name: /今日特调/ }).click();
  const rows = page.locator(".drink-row");
  await expect(rows).toHaveCount(3);
  await rows.first().getByLabel("编辑歌曲信息").click();
  await expect(page.getByText("调酒笔记")).toBeVisible();
  await page.getByLabel("饮品别名", { exact: true }).fill("午夜试饮");
  await page.getByLabel("口味标签", { exact: true }).fill("烈酒, 低语, 烛光");
  await page.getByLabel("马天尼杯", { exact: true }).click();
  await page.getByLabel("烈酒试饮", { exact: true }).check();
  await page.getByLabel("关闭编辑", { exact: true }).click();
  await expect(rows.first()).toContainText("午夜试饮");
  await rows.nth(0).dragTo(rows.nth(2));
  await page.waitForTimeout(300);
  await page.locator(".menu-search input").fill("午夜试饮");
  await expect(rows).toHaveCount(1);
  await page.locator(".menu-search input").fill("");
  await page.getByLabel("关闭酒单", { exact: true }).click();

  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("导出菜单配置", { exact: true }).click(),
  ]).then(([event]) => event);
  const exportedPath = path.join(outputDir, "exported-menu.json");
  await download.saveAs(exportedPath);
  const exported = JSON.parse(await fs.readFile(exportedPath, "utf8"));
  const edited = exported.tracks.find((track) => track.alias === "午夜试饮");
  if (!edited || edited.glass !== "martini")
    throw new Error("Glass choice was not exported.");
  await page
    .locator('input[type="file"][accept*="application/json"]')
    .setInputFiles(exportedPath);
  await expect(page.locator(".status-toast")).toContainText("菜单配置导入成功");

  await page.screenshot({ path: path.join(outputDir, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  if (overflow) throw new Error("Mobile viewport has horizontal overflow.");
  await expect(page.getByLabel("播放", { exact: true })).toBeInViewport();
  await page.screenshot({ path: path.join(outputDir, "mobile.png") });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Smoke test passed. Screenshots in test-results/desktop.png and mobile.png",
  );
} finally {
  await browser.close();
}
