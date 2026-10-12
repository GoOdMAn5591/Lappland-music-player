import { expect } from "@playwright/test";
import { launchBrowser } from "./browser.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const url = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const output = path.resolve("test-results");
await fs.mkdir(output, { recursive: true });
const browser = await launchBrowser();
const errors = [];
const monitor = (page) =>
  page.on("pageerror", (error) => errors.push(error.message));

function wav(frequency, artwork = false) {
  const rate = 16000,
    count = rate * 40,
    buffer = Buffer.alloc(44 + count * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
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
      Math.round(Math.sin((i / rate) * frequency * Math.PI * 2) * 5000),
      44 + i * 2,
    );
  if (!artwork) return buffer;
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  );
  const content = Buffer.concat([
    Buffer.from([0]),
    Buffer.from("image/png\0"),
    Buffer.from([3, 0]),
    image,
  ]);
  const frame = Buffer.alloc(10);
  frame.write("APIC");
  frame.writeUInt32BE(content.length, 4);
  const header = Buffer.from([73, 68, 51, 3, 0, 0, 0, 0, 0, 0]);
  let length = content.length + 10;
  for (let i = 9; i >= 6; i--) {
    header[i] = length & 127;
    length >>= 7;
  }
  const tag = Buffer.concat([header, frame, content]);
  const chunk = Buffer.alloc(8);
  chunk.write("id3 ");
  chunk.writeUInt32LE(tag.length, 4);
  const result = Buffer.concat([
    buffer,
    chunk,
    tag,
    ...(tag.length % 2 ? [Buffer.alloc(1)] : []),
  ]);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}
const files = [];
for (const [index, name] of [
  "amber-test",
  "midnight-test",
  "ribbon-test",
].entries()) {
  const file = path.join(output, `${name}.wav`);
  await fs.writeFile(file, wav(220 + index * 100, index === 0));
  files.push(file);
}
const readStore = (page, store = "library", key = "state") =>
  page.evaluate(
    async ({ store, key }) => {
      const { openDB } = await import("/node_modules/.vite/deps/idb.js");
      const db = await openDB("lappland-tavern-player", 2);
      const value =
        store === "audio"
          ? (await db.getAll(store)).map((item) => ({
              size: item.audio.size,
              cover: item.cover?.size ?? 0,
            }))
          : await db.get(store, key);
      db.close();
      return value;
    },
    { store, key },
  );

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
  });
  await context.addInitScript(() => {
    window.__bellStarts = 0;
    window.__persistCalls = 0;
    window.__gains = [];
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = createOscillator.call(this);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (...args) => {
        window.__bellStarts++;
        start(...args);
      };
      return oscillator;
    };
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = createGain.call(this);
      window.__gains.push(gain);
      return gain;
    };
    const persist = navigator.storage.persist.bind(navigator.storage);
    navigator.storage.persist = () => {
      window.__persistCalls++;
      return persist();
    };
  });
  const page = await context.newPage();
  monitor(page);
  await page.goto(url);
  await expect(
    page.getByRole("button", { name: "进入酒馆", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".door-scene canvas")).toBeVisible();
  expect(await page.evaluate(() => window.__bellStarts)).toBe(0);
  expect(await page.locator(".tavern-app").evaluate((el) => el.inert)).toBe(
    true,
  );
  await page.screenshot({ path: path.join(output, "entrance-desktop.png") });
  const before = await page.locator(".door-scene canvas").screenshot();
  await page.keyboard.press("k");
  await expect(page.locator(".tavern-entrance")).toHaveAttribute(
    "data-phase",
    "opening",
  );
  expect(await page.evaluate(() => window.__bellStarts)).toBe(4);
  await page.waitForTimeout(1450);
  expect(
    Buffer.compare(
      before,
      await page.locator(".door-scene canvas").screenshot(),
    ),
  ).not.toBe(0);
  await page.screenshot({ path: path.join(output, "entrance-opening.png") });
  await expect(page.locator(".tavern-entrance")).toHaveCount(0, {
    timeout: 6000,
  });
  expect(await page.locator("audio").evaluate((a) => a.paused)).toBe(true);
  await page.locator('input[accept*="audio"]').setInputFiles(files);
  await expect(page.locator(".status-toast")).toContainText(
    "音频与封面已存入本地酒窖",
  );
  await expect(page.locator(".drink-row")).toHaveCount(3);
  expect(await page.evaluate(() => window.__persistCalls)).toBeGreaterThan(0);
  const blobs = await readStore(page, "audio");
  expect(blobs).toHaveLength(3);
  expect(blobs[0].cover).toBeGreaterThan(50);
  await page.getByLabel("打开酒单", { exact: true }).click();
  await page.locator(".drink-row .drink-main").first().click();
  await expect(page.getByLabel("暂停", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(0.05);
  await page.getByLabel("暂停", { exact: true }).click();
  await page.locator(".drink-row").first().getByLabel("编辑歌曲信息").click();
  await page.getByLabel("饮品别名", { exact: true }).fill("琥珀夜航");
  await page.getByLabel("口味标签", { exact: true }).fill("午夜, 柔和");
  await page.getByLabel("关闭编辑", { exact: true }).click();
  await page.getByLabel("新建歌单", { exact: true }).click();
  await page.getByPlaceholder("新菜单名").fill("持久珍藏");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /今日特调/ }).click();
  await page.locator(".drink-row").first().getByLabel("编辑歌曲信息").click();
  await page.getByLabel("持久珍藏", { exact: true }).check();
  await page.getByLabel("关闭编辑", { exact: true }).click();
  await page
    .locator(".drink-row")
    .first()
    .dragTo(page.locator(".drink-row").last());
  await page.waitForTimeout(400);
  const stored = await readStore(page);
  const ids = stored.playlists[0].trackIds;
  const edited = stored.tracks.find((t) => t.alias === "琥珀夜航");
  expect(edited.tags).toEqual(["午夜", "柔和"]);
  expect(
    stored.playlists.find((p) => p.name === "持久珍藏").trackIds,
  ).toContain(edited.id);
  const downloadPromise = page.waitForEvent("download");
  await page.getByLabel("导出菜单配置", { exact: true }).click();
  const download = await downloadPromise;
  const exportPath = path.join(output, "persistent-menu.json");
  await download.saveAs(exportPath);
  const exported = JSON.parse(await fs.readFile(exportPath, "utf8"));
  expect(JSON.stringify(exported)).not.toContain("blob:");
  expect(JSON.stringify(exported)).not.toContain("objectUrl");

  await page.reload();
  await expect(
    page.getByRole("button", { name: "进入酒馆", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => window.__bellStarts)).toBe(0);
  expect(await page.locator("audio").evaluate((a) => a.paused)).toBe(true);
  await page.getByRole("button", { name: "进入酒馆", exact: true }).click();
  await page.waitForTimeout(450);
  const earlyGain = await page.evaluate(() => window.__gains[0].gain.value);
  expect(earlyGain).toBeGreaterThan(0);
  expect(earlyGain).toBeLessThan(0.7);
  await expect(page.locator(".tavern-entrance")).toHaveCount(0, {
    timeout: 6000,
  });
  expect(
    await page.evaluate(() => window.__gains[0].gain.value),
  ).toBeGreaterThan(0.95);
  expect(await page.locator("audio").evaluate((a) => a.paused)).toBe(false);
  await page.getByLabel("暂停", { exact: true }).click();
  await expect(page.locator(".drink-row")).toHaveCount(3);
  expect((await readStore(page)).playlists[0].trackIds).toEqual(ids);
  expect(await page.locator("audio").getAttribute("src")).toMatch(/^blob:/);
  const restored = await page.evaluate(async () => {
    const s = await import("/src/storage/index.ts");
    const library = await s.loadLibrary();
    const track = await s.reviveTrack(
      library.tracks.find((t) => t.alias === "琥珀夜航"),
    );
    const image = track.coverUrl
      ? await fetch(track.coverUrl).then((r) => r.blob())
      : undefined;
    const result = { ready: track.status, cover: image?.size ?? 0 };
    s.releaseTrack(track);
    return result;
  });
  expect(restored).toEqual({ ready: "ready", cover: blobs[0].cover });
  await page
    .locator('input[accept*="application/json"]')
    .setInputFiles(exportPath);
  await expect(page.locator(".status-toast")).toContainText("菜单配置导入成功");
  expect(await page.locator("audio").getAttribute("src")).toMatch(/^blob:/);
  await page.getByLabel("本地酒窖与入场设置", { exact: true }).click();
  await expect(page.getByTestId("library-bytes")).not.toHaveText("0.00 MB");
  await page.screenshot({ path: path.join(output, "cellar-desktop.png") });
  await page.getByRole("button", { name: "重播入场", exact: true }).click();
  await expect(page.locator(".tavern-entrance")).toHaveAttribute(
    "data-phase",
    "closed",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, "entrance-mobile.png") });
  await page.getByRole("button", { name: "跳过入场动画" }).click();
  await page.reload();
  await expect(page.locator(".tavern-entrance")).toHaveCount(0);
  await expect(page.locator(".drink-row")).toHaveCount(3);
  expect(await page.locator("audio").evaluate((a) => a.paused)).toBe(true);
  await page.screenshot({ path: path.join(output, "persistent-mobile.png") });
  await page.getByLabel("本地酒窖与入场设置", { exact: true }).click();
  await page.screenshot({ path: path.join(output, "cellar-mobile.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "清空本地酒窖", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await readStore(page, "audio")).toHaveLength(3);
  await page.getByRole("button", { name: "清空本地酒窖", exact: true }).click();
  await page
    .getByRole("button", { name: "确认清空音乐库", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "酒窖已清空",
  );
  await page.getByLabel("关闭酒窖管理").click();
  await page.reload();
  await expect(page.locator(".drink-row")).toHaveCount(0);
  expect(await readStore(page, "audio")).toHaveLength(0);
  await expect(page.locator(".tavern-canvas")).toBeVisible();
  const alpha = await page.evaluate(async () => {
    const im = new Image();
    im.src = "/assets/lappland/lappland-cutout-transparent.png";
    await im.decode();
    const c = document.createElement("canvas");
    c.width = 910;
    c.height = 1200;
    const x = c.getContext("2d");
    x.drawImage(im, 0, 0);
    return [
      x.getImageData(150, 300, 1, 1).data[3],
      x.getImageData(540, 340, 1, 1).data[3],
    ];
  });
  expect(alpha).toEqual([0, 255]);
  await context.close();

  const legacyContext = await browser.newContext();
  const legacy = await legacyContext.newPage();
  monitor(legacy);
  await legacy.route("**/seed", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Migration fixture</title>",
    }),
  );
  await legacy.goto(new URL("seed", url).href);
  await legacy.evaluate(async () => {
    const { openDB } = await import("/node_modules/.vite/deps/idb.js");
    const { createDefaultLibrary } = await import("/src/storage/index.ts");
    const { lapplandRig } = await import("/src/character/lapplandRig.ts");
    const db = await openDB("lappland-tavern-player", 1, {
      upgrade(db) {
        db.createObjectStore("library");
      },
    });
    const state = createDefaultLibrary();
    state.tracks = [
      {
        id: "legacy",
        fingerprint: "legacy",
        fileName: "legacy.wav",
        fileSize: 44,
        lastModified: 0,
        mimeType: "audio/wav",
        title: "旧酒",
        alias: "保留的别名",
        artist: "调酒师",
        album: "珍藏",
        duration: 4,
        tags: ["烈"],
        addedAt: 1,
      },
    ];
    state.playlists[0].trackIds = ["legacy"];
    state.currentTrackId = "legacy";
    await db.put("library", state, "state");
    db.close();
    const portrait = await openDB("tavern-character", 1, {
      upgrade(db) {
        db.createObjectStore("portrait");
      },
    });
    const blob = await fetch(
      "/assets/lappland/lappland-cutout-transparent.png",
    ).then((r) => r.blob());
    await portrait.put(
      "portrait",
      {
        name: "136884763_p0_master1200.jpg",
        blob,
        rig: { ...lapplandRig, motion: 0.4 },
      },
      "lappland",
    );
    portrait.close();
    localStorage.setItem("tavern-skip-entrance", "true");
  });
  await legacy.goto(url);
  await expect(legacy.locator(".drink-row")).toHaveCount(1);
  await expect(legacy.locator(".drink-row")).toContainText("保留的别名");
  await expect(legacy.locator(".drink-tags .warn").first()).toContainText(
    "需重新导入",
  );
  await expect(legacy.locator(".tavern-canvas")).toBeVisible();
  await legacy.waitForTimeout(450);
  // The old version kept the composition next to an imported picture in
  // IndexedDB; only the composition carries over (the picture is fixed now).
  const migrated = await legacy.evaluate(() =>
    JSON.parse(localStorage.getItem("tavern-character-rig") ?? "null"),
  );
  expect(migrated).toEqual({
    version: 3,
    zoom: 1.02,
    x: -8,
    y: -2,
    motion: 0.4,
  });
  expect(await readStore(legacy, "audio")).toHaveLength(0);
  await legacy.locator('input[accept*="application/json"]').setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"tracks":[{"id":"bad","tags":[]}],"playlists":[]}'),
  });
  await expect(legacy.locator(".status-toast")).toContainText(
    "不是有效的酒馆菜单配置",
  );
  await expect(legacy.locator(".drink-row")).toHaveCount(1);
  await legacyContext.close();

  for (const failure of ["quota", "unsupported"]) {
    const c = await browser.newContext({
      viewport: { width: 1200, height: 900 },
    });
    await c.addInitScript((mode) => {
      localStorage.setItem("tavern-skip-entrance", "true");
      if (mode === "unsupported")
        indexedDB.open = () => {
          throw new DOMException("Blocked", "SecurityError");
        };
      else {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === "audio")
            throw new DOMException("Full", "QuotaExceededError");
          return put.apply(this, args);
        };
      }
      navigator.storage.persist = async () => false;
    }, failure);
    const p = await c.newPage();
    monitor(p);
    await p.goto(url);
    await expect(p.locator(".plaque-title")).toHaveText("吧台还空着");
    await p.locator('input[accept*="audio"]').setInputFiles(files[0]);
    await expect(p.locator(".status-toast")).toContainText("仅本次可播");
    await p.getByLabel("播放", { exact: true }).click();
    await expect
      .poll(() => p.locator("audio").evaluate((a) => a.currentTime))
      .toBeGreaterThan(0.05);
    await p.waitForTimeout(350);
    await p.reload();
    await expect(p.locator(".drink-row")).toHaveCount(1);
    await expect(p.locator(".drink-tags .warn").first()).toContainText(
      "需重新导入",
    );
    await expect(p.locator(".tavern-canvas")).toBeVisible();
    await c.close();
  }
  const reduced = await browser.newContext({
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
    hasTouch: true,
    isMobile: true,
  });
  const rp = await reduced.newPage();
  monitor(rp);
  await rp.goto(url);
  await expect(
    rp.getByRole("button", { name: "进入酒馆", exact: true }),
  ).toBeEnabled();
  await rp.getByRole("button", { name: "进入酒馆", exact: true }).tap();
  await expect(rp.locator(".tavern-entrance")).toHaveCount(0, {
    timeout: 1000,
  });
  expect(
    await rp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await rp.locator('input[accept*="audio"]').setInputFiles(files.slice(0, 2));
  await expect(rp.locator(".drink-row")).toHaveCount(2);
  await rp.locator(".glass-hotspot").last().tap();
  await expect(rp.getByLabel("暂停", { exact: true })).toBeVisible();
  await rp.getByLabel("暂停", { exact: true }).tap();
  await reduced.close();
  expect(errors).toEqual([]);
  console.log(
    "Persistence/entrance passed: gesture-only bell, animated door, music fade, skip/replay, PNG alpha, audio+cover reload, tags/alias/order, JSON restore, usage, clear/cancel, quota and unavailable-IDB fallback, mobile and reduced motion.",
  );
} finally {
  await browser.close();
}
