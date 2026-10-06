import { expect } from "@playwright/test";
import { launchBrowser } from "./browser.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const output = path.resolve("test-results");
const browser = await launchBrowser({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
});
const page = await context.newPage();
await context.addInitScript(() =>
  localStorage.setItem("tavern-skip-entrance", "true"),
);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173/";

function wav(frequency) {
  const rate = 16000,
    count = rate * 30,
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
  for (let i = 0; i < count; i++)
    buffer.writeInt16LE(
      Math.round(Math.sin((i / rate) * frequency * Math.PI * 2) * 9000),
      44 + i * 2,
    );
  return buffer;
}

async function canvasPixels(selector = ".portrait-renderer canvas") {
  const png = await page.locator(selector).screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, 200, 220);
    return Array.from(ctx.getImageData(0, 0, 200, 220).data);
  }, png.toString("base64"));
}

async function assertCounterPixels(mobile = false) {
  const pixels = await canvasPixels(".counter-scene canvas");
  const point = await page.evaluate(async (mobile) => {
    const { getBarGeometry, arcPoint } = await import(
      "/src/scene/barGeometry.ts"
    );
    const bounds = document
      .querySelector(".counter-scene")
      .getBoundingClientRect();
    const p = arcPoint(
      getBarGeometry(bounds.width, bounds.height),
      mobile ? 0.27 : 0.24,
      0.96,
    );
    return { x: p.x / bounds.width, y: p.y / bounds.height };
  }, mobile);
  const x = Math.round(point.x * 200);
  const y = Math.round(point.y * 220);
  let warm = 0;
  for (let row = y - 2; row <= y + 2; row++)
    for (let col = x - 2; col <= x + 2; col++) {
      const offset = (row * 200 + col) * 4;
      const [r, g, b] = pixels.slice(offset, offset + 3);
      if (r > 45 && r > g * 1.06 && g > b * 1.2) warm++;
    }
  expect(warm).toBeGreaterThan(10);
}

try {
  await fs.mkdir(output, { recursive: true });
  await page.goto(appUrl);
  await expect(page.locator(".portrait-renderer canvas")).toBeVisible();
  await expect(page.locator(".portrait-renderer")).toHaveAttribute(
    "data-fallback",
    "false",
  );
  await page.waitForTimeout(650);
  const first = await canvasPixels();
  const bright = first.filter(
    (channel, index) => index % 4 === 0 && channel > 130,
  ).length;
  expect(bright).toBeGreaterThan(900);
  await page.mouse.move(820, 370);
  await page.waitForTimeout(550);
  const second = await canvasPixels();
  const changed = second.filter(
    (channel, index) => index % 4 !== 3 && Math.abs(channel - first[index]) > 7,
  ).length;
  expect(changed).toBeGreaterThan(300);

  const names = ["午夜低语", "暗红帷幕", "最后一杯", "银色余温", "无序之夜"];
  const audioFiles = [];
  for (const [index, name] of names.entries()) {
    const file = path.join(output, `${name}.wav`);
    await fs.writeFile(file, wav(220 + index * 60));
    audioFiles.push(file);
  }
  await page.locator('input[accept*="audio"]').setInputFiles(audioFiles);
  await expect(page.locator(".bar-glass")).toHaveCount(5);
  await page.getByLabel("播放", { exact: true }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el) => !el.paused && el.currentTime > 0),
    )
    .toBe(true);
  await page.getByLabel("暂停", { exact: true }).click();
  await page.waitForTimeout(800);

  const oldId = await page
    .locator(".bar-glass.is-current")
    .getAttribute("data-track-id");
  const right = page.locator('.bar-glass[data-slot="1"]');
  const rightId = await right.getAttribute("data-track-id");
  const before = await right.boundingBox();
  const beforeArc = await right.evaluate((el) => ({
    x: Number(el.dataset.arcX),
    y: Number(el.dataset.arcY),
  }));
  await page.getByLabel("下一首", { exact: true }).click();
  const incoming = page.locator(`.bar-glass[data-track-id="${rightId}"]`);
  await expect(incoming).toHaveClass(/is-current/);
  await page.waitForTimeout(140);
  const during = await incoming.boundingBox();
  const inertia = await page
    .locator(".liquid-inertia")
    .evaluateAll((nodes) =>
      nodes.some((node) => node.getAnimations().length > 0),
    );
  expect(inertia).toBe(true);
  await page.waitForTimeout(250);
  const midwayArc = await incoming.evaluate((el) => ({
    x: Number(el.dataset.arcX),
    y: Number(el.dataset.arcY),
  }));
  await page.waitForTimeout(600);
  const after = await incoming.boundingBox();
  const afterArc = await incoming.evaluate((el) => ({
    x: Number(el.dataset.arcX),
    y: Number(el.dataset.arcY),
  }));
  const fraction = (midwayArc.x - beforeArc.x) / (afterArc.x - beforeArc.x);
  const chordY = beforeArc.y + (afterArc.y - beforeArc.y) * fraction;
  expect(midwayArc.y - chordY).toBeGreaterThan(1.5);
  expect(before.x).toBeGreaterThan(during.x);
  expect(during.x).toBeGreaterThan(after.x);
  await expect(
    page.locator(`.bar-glass[data-track-id="${oldId}"]`),
  ).toHaveAttribute("data-slot", "-1");
  await page.getByLabel("暂停", { exact: true }).click();

  // Loop across both playlist boundaries while preserving the incoming glass.
  await page.getByLabel("切换播放模式").click();
  await page.getByLabel("切换播放模式").click();
  for (let i = 0; i < 4; i++) {
    await page.getByLabel("下一首", { exact: true }).click();
    await page.waitForTimeout(80);
  }
  await expect(page.locator(".bar-glass.is-current")).toHaveAttribute(
    "data-track-id",
    oldId,
  );
  await page.getByLabel("上一首", { exact: true }).click();
  await expect(page.locator(".bill-card h2")).toHaveText(names[4]);
  await page.getByLabel("暂停", { exact: true }).click();

  await page.getByLabel("角色构图与动画", { exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("角色动作幅度", { exact: true }).press("Home");
  for (let i = 0; i < 8; i++)
    await page.getByLabel("角色动作幅度", { exact: true }).press("ArrowRight");
  await page.getByLabel("关闭角色设置").click();
  await page.waitForTimeout(500);
  // Simulate the previous release's rig, preserving the user's motion setting.
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("tavern-character", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("portrait", "readwrite");
          const store = tx.objectStore("portrait");
          const read = store.get("lappland");
          read.onsuccess = () => {
            const asset = read.result;
            asset.rig.version = 1;
            asset.rig.zoom = 1.06;
            asset.rig.x = -6;
            asset.rig.y = 3;
            asset.rig.anchors = Object.fromEntries(
              Object.entries(asset.rig.anchors).filter(([key]) =>
                [
                  "head",
                  "leftHair",
                  "rightHair",
                  "leftEye",
                  "rightEye",
                ].includes(key),
              ),
            );
            store.put(asset, "lappland");
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
  await page.reload();
  await expect(page.locator(".portrait-renderer canvas")).toBeVisible();
  await page.getByLabel("角色构图与动画", { exact: true }).click();
  await expect(page.getByLabel("角色动作幅度", { exact: true })).toHaveValue(
    "0.4",
  );
  await expect(page.getByLabel("角色缩放", { exact: true })).toHaveValue(
    "1.02",
  );
  await page.getByLabel("重置角色构图").click();
  await page.getByLabel("关闭角色设置").click();
  await expect(page.locator(".drink-row")).toHaveCount(5);
  await expect(page.locator(".status-strip")).toContainText("酒窖已恢复 5 首");
  await page.waitForTimeout(900);
  await page.mouse.move(15, 10);
  await page.screenshot({ path: path.join(output, "scene-desktop.png") });
  await expect(page.locator(".shelf-bottle")).toHaveCount(72);
  await expect(page.locator(".hanging-glass")).toHaveCount(20);
  await expect(page.locator(".counter-scene canvas")).toBeVisible();
  await assertCounterPixels();

  const waistVisible = async () =>
    page.evaluate(async () => {
      const stage = document
        .querySelector(".center-stage")
        .getBoundingClientRect();
      const portrait = document
        .querySelector(".portrait-renderer")
        .getBoundingClientRect();
      const { getBarGeometry, arcPoint } = await import(
        "/src/scene/barGeometry.ts"
      );
      const bar = getBarGeometry(stage.width, stage.height);
      const imageScale =
        Math.min(portrait.width / 910, portrait.height / 1200) * 1.02 * 0.96;
      const x =
        portrait.x +
        (portrait.width - imageScale * 910) / 2 -
        portrait.width * 0.08 +
        imageScale * 910 * 0.65 -
        stage.x;
      const y =
        portrait.y +
        (portrait.height - imageScale * 1200) / 2 -
        portrait.height * 0.02 +
        imageScale * 1200 * 0.89 -
        stage.y;
      const edge = arcPoint(
        bar,
        Math.asin((x - bar.cx) / (bar.rx * bar.inner)),
        bar.inner,
      );
      return y < edge.y - 6;
    });
  expect(await waistVisible()).toBe(true);

  // Hover feedback does not resize or rearrange the menu or controls.
  const cup = page.locator(".bar-glass.is-current");
  await cup.hover();
  await expect(cup.locator(".glass-tooltip")).toHaveCSS("opacity", "1");
  await page.mouse.move(10, 10);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(900);
  await page.screenshot({
    path: path.join(output, "scene-mobile.png"),
    fullPage: true,
  });
  const overflow = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          el.getBoundingClientRect().right > innerWidth + 1 &&
          getComputedStyle(el).position !== "absolute",
      )
      .map((el) => ({
        tag: el.tagName,
        cls: el.className,
        right: el.getBoundingClientRect().right,
      })),
  }));
  if (overflow.scroll > overflow.width)
    console.log("Overflow:", JSON.stringify(overflow));
  expect(overflow.scroll <= overflow.width).toBe(true);
  const mobileCup = await cup.boundingBox();
  const controls = await page.locator(".stage-controls").boundingBox();
  expect(mobileCup.y + mobileCup.height).toBeLessThan(controls.y);
  await expect(page.getByLabel("播放", { exact: true })).toBeInViewport();
  await page.screenshot({
    path: path.join(output, "scene-mobile.png"),
    fullPage: true,
  });
  const mobilePixels = await canvasPixels();
  await assertCounterPixels(true);
  expect(await waistVisible()).toBe(true);
  expect(
    mobilePixels.filter((c, i) => i % 4 === 0 && c > 130).length,
  ).toBeGreaterThan(700);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(300);
  expect(
    await page
      .locator(".drink-liquid")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(output, "scene-tablet.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const tabletControls = await page.locator(".stage-controls").boundingBox();
  const tabletMenu = await page.locator(".menu-page").boundingBox();
  expect(tabletControls.x + tabletControls.width).toBeLessThan(tabletMenu.x);
  for (const width of [320, 768, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByLabel("下一首", { exact: true })).toBeInViewport();
  }

  const fallbackPage = await context.newPage();
  await fallbackPage.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type.startsWith("webgl")) return null;
      return getContext.call(this, type, ...args);
    };
  });
  await fallbackPage.goto(appUrl);
  await expect(fallbackPage.locator(".portrait-renderer")).toHaveAttribute(
    "data-fallback",
    "true",
  );
  await expect(fallbackPage.locator(".portrait-fallback")).toBeVisible();
  expect(
    await fallbackPage
      .locator(".portrait-fallback")
      .evaluate((img) => img.naturalWidth),
  ).toBe(910);
  await fallbackPage.screenshot({
    path: path.join(output, "scene-fallback.png"),
  });
  await fallbackPage.close();
  expect(errors).toEqual([]);
  console.log(
    `Scene checks passed: supplied PNG, nonblank canvas (${bright} bright pixels), animation (${changed} changed channels), curved orbit (${(midwayArc.y - chordY).toFixed(2)}px away from a straight chord), waist clearance, 72 bottles, glass inertia, boundary loops, saved rig, persisted audio, hover, mobile framing and reduced motion.`,
  );
} finally {
  await browser.close();
}
