import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const outputDir = path.resolve("test-results");

function createWavBuffer(frequency, seconds = 2, sampleRate = 44100) {
  const samples = Math.floor(sampleRate * seconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
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
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 1200, (samples - index) / 1200);
    const value =
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) * envelope;
    buffer.writeInt16LE(Math.floor(value * 26000), 44 + index * 2);
  }
  return buffer;
}

async function launchBrowser() {
  const options = {
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  };
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ ...options, channel });
    } catch {
      // Try the next locally installed browser.
    }
  }
  return chromium.launch(options);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const audioDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "lappland-player-audio-"),
  );
  const files = [
    ["midnight-lowball.wav", 220],
    ["curtain-ember.wav", 330],
    ["private-cellar.wav", 440],
  ];
  const audioPaths = [];
  for (const [name, frequency] of files) {
    const filePath = path.join(audioDir, name);
    await fs.writeFile(filePath, createWavBuffer(frequency));
    audioPaths.push(filePath);
  }

  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error(`[browser] ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    throw error;
  });

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "跳过入场动画" }).click();
  await page.getByText("这页菜单还没写字").waitFor();
  await page
    .locator('input[type="file"][accept*="audio"]')
    .setInputFiles(audioPaths);
  await page
    .getByText(/已添加 3 (杯新饮品|只酒杯)/)
    .waitFor({ timeout: 15000 });
  await page.locator(".drink-row").first().click();
  await page.waitForTimeout(450);

  const firstSource = await page
    .locator("audio")
    .evaluate((audio) => audio.getAttribute("src"));
  if (!firstSource?.startsWith("blob:")) {
    throw new Error(
      "Audio element did not receive a blob source after import.",
    );
  }

  await page.getByLabel("下一首").click();
  await page.waitForTimeout(300);
  await page.getByPlaceholder("新菜单名").fill("烈酒试饮");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /烈酒试饮/ }).waitFor();
  await page.getByRole("button", { name: /今日特调/ }).click();

  const rows = page.locator(".drink-row");
  await rows.first().locator('button[aria-label="编辑歌曲信息"]').click();
  await page.getByText("调酒笔记").waitFor();
  await page.getByLabel("饮品别名").fill("午夜试饮");
  await page.getByLabel("口味标签").fill("烈酒, 低语, 烛光");
  await page
    .getByText("烈酒试饮")
    .locator("..")
    .locator('input[type="checkbox"]')
    .check();
  await page.getByLabel("关闭编辑").click();
  await page.waitForTimeout(300);

  await rows.nth(0).dragTo(rows.nth(1));
  await page.locator(".drink-row").first().hover();
  await page
    .getByLabel("播放")
    .hover()
    .catch(async () => {
      await page.getByLabel("暂停").hover();
    });

  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("导出菜单配置").click(),
  ]).then(([downloadEvent]) => downloadEvent);
  const exportedPath = path.join(outputDir, "exported-menu.json");
  await download.saveAs(exportedPath);
  await page
    .locator('input[type="file"][accept*="application/json"]')
    .setInputFiles(exportedPath);
  await page.getByText(/菜单配置导入成功/).waitFor();

  await page.screenshot({
    path: path.join(outputDir, "desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  if (hasHorizontalOverflow) {
    throw new Error("Mobile viewport has horizontal overflow.");
  }
  await page.screenshot({
    path: path.join(outputDir, "mobile.png"),
    fullPage: true,
  });

  await browser.close();
  console.log("Smoke test passed.");
  console.log(
    `Screenshots: ${path.join(outputDir, "desktop.png")} and ${path.join(outputDir, "mobile.png")}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
