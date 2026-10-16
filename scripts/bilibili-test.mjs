// Bilibili on the bar, against stand-ins for Bilibili's API, its b23.tv short
// links and its embedded player (no network needed). Starts its own tavern
// server on the built page (run `npm run build` first):
//  - links: short link, single video, a video in a collection (and the whole
//    collection), a many-part video, a public favourites folder (two pages, a
//    dead video left out), a private folder, a refusal;
//  - playing: the screen loads Bilibili's player at the right second; pause,
//    resume and jumps reload it there; the length running out pours the next;
//  - the pages survive a reload;
//  - 同席: a friend's screen starts the same video near the host's second.

import { expect as baseExpect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchPersistent } from "./browser.mjs";

const expect = baseExpect.configure({ timeout: 30_000 });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(root, process.env.TAVERN_DIST || "dist");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tavern-bilibili-"));
const children = [];
const cleanup = () => {
  for (const child of children)
    try {
      child.kill("SIGTERM");
    } catch {
      /* gone */
    }
  fs.rmSync(tmp, { recursive: true, force: true });
};
process.on("exit", cleanup);

// --------------------------------------------------------------- stand-ins
const pic = (name) => `http://i0.hdslb.com/bfs/archive/${name}.jpg`;
const views = {
  BV1aaaaaaaaa: { title: "第一杯 · 琥珀", owner: "调酒师甲", pages: [{ page: 1, part: "第一杯 · 琥珀", duration: 9 }] },
  BV1bbbbbbbbb: { title: "第二杯 · 夜航", owner: "调酒师乙", pages: [{ page: 1, part: "第二杯 · 夜航", duration: 40 }] },
  BV1sssssssss: {
    title: "合集里的一杯",
    owner: "合集主",
    // long enough to still be playing when the friend arrives
    pages: [{ page: 1, part: "合集里的一杯", duration: 600 }],
    season: { id: 777, mid: 42, title: "测试合集", ep_count: 3 },
  },
  BV1mmmmmmmmm: {
    title: "三段式",
    owner: "分P主",
    pages: [
      { page: 1, part: "序曲", duration: 20 },
      { page: 2, part: "间奏", duration: 21 },
      { page: 3, part: "尾声", duration: 22 },
    ],
  },
};
const media = (bvid, title, duration, attr = 0) => ({
  type: 2,
  attr,
  bvid,
  title,
  duration,
  cover: pic(bvid),
  upper: { name: "收藏者", mid: 9 },
});
const favorites = Array.from({ length: 25 }, (_, i) =>
  media(`BV1f${String(i).padStart(8, "0")}`, i === 7 ? "已失效视频" : `收藏 ${i + 1}`, 30 + i, i === 7 ? 9 : 0),
);
const json = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const api = http.createServer((req, res) => {
  const url = new URL(req.url, "http://api");
  const q = url.searchParams;
  if (url.pathname === "/x/web-interface/wbi/view") {
    const bvid = q.get("bvid");
    if (bvid === "BV1zzzzzzzzz") return json(res, {}, 412);
    const v = views[bvid];
    if (!v) return json(res, { code: -404, message: "啥都木有" });
    return json(res, {
      code: 0,
      data: {
        bvid,
        title: v.title,
        pic: pic(bvid),
        duration: v.pages.reduce((sum, page) => sum + page.duration, 0),
        owner: { name: v.owner, mid: 1 },
        pages: v.pages,
        rights: {},
        ...(v.season ? { ugc_season: v.season } : {}),
      },
    });
  }
  if (url.pathname === "/x/space/fav/season/list" && q.get("season_id") === "777")
    return json(res, {
      code: 0,
      data: {
        info: { title: "测试合集", media_count: 3, upper: { name: "合集主", mid: 42 } },
        medias: [
          media("BV1sssssssss", "合集里的一杯", 600),
          media("BV1ttttttttt", "合集第二杯", 31),
          media("BV1uuuuuuuuu", "合集第三杯", 32),
        ],
      },
    });
  if (url.pathname === "/x/v3/fav/resource/list") {
    if (q.get("media_id") === "666") return json(res, { code: -403, message: "访问权限不足" });
    // a folder that isn't there: "OK", and nothing
    if (q.get("media_id") === "1") return json(res, { code: 0, message: "OK", data: null });
    const page = Number(q.get("pn"));
    return json(res, {
      code: 0,
      data: {
        info: { title: "公开收藏", upper: { name: "收藏者", mid: 9 } },
        medias: favorites.slice((page - 1) * 20, page * 20),
        has_more: page * 20 < favorites.length,
      },
    });
  }
  json(res, { code: -404, message: "?" });
});
const short = http.createServer((req, res) => {
  if (req.url === "/abc") {
    res.writeHead(302, { location: "https://www.bilibili.com/video/BV1aaaaaaaaa?share_source=copy_web" });
    return res.end();
  }
  res.writeHead(404);
  res.end();
});
await Promise.all([api, short].map((server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))));

// a stand-in cloudflared for opening the room
const tools = path.join(tmp, "tools");
fs.mkdirSync(tools);
fs.writeFileSync(
  path.join(tools, "cloudflared"),
  '#!/bin/sh\necho "INF |  https://bilibili-check.trycloudflare.com  |" >&2\nwhile true; do sleep 1; done\n',
  { mode: 0o755 },
);

const port = 5700 + Math.floor(Math.random() * 200);
const server = spawn(
  process.execPath,
  [path.join(root, "server/tavern-server.mjs"), "--port", String(port), "--dist", dist, "--tools", tools],
  {
    env: {
      ...process.env,
      TAVERN_BILI_API: `http://127.0.0.1:${api.address().port}`,
      TAVERN_BILI_SHORT: `http://127.0.0.1:${short.address().port}`,
      TAVERN_CLOUDFLARED_LOCAL_ONLY: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
children.push(server);
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));
const base = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 50; i++) {
  if (await fetch(base).then((r) => r.ok).catch(() => false)) break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/** Bilibili's embedded player, stood in for: an empty page that loads at once. */
async function fakeEmbed(context) {
  await context.route("https://player.bilibili.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>fake bilibili player</title><body style='background:#123'>" }),
  );
  await context.route("https://i0.hdslb.com/**", (route) => route.fulfill({ status: 204, body: "" }));
}
const embeds = (page) =>
  page
    .frames()
    .map((frame) => frame.url())
    .filter((url) => url.startsWith("https://player.bilibili.com/player.html"))
    .map((url) => Object.fromEntries(new URL(url).searchParams));

const errors = [];
const hostDir = path.join(tmp, "host");
const host = await launchPersistent(hostDir, { viewport: { width: 1440, height: 900 } });
try {
  await fakeEmbed(host);
  await host.addInitScript(() => localStorage.setItem("tavern-skip-entrance", "true"));
  const page = host.pages()[0] ?? (await host.newPage());
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await expect(page.locator(".tavern-app")).toHaveAttribute("data-scene", /^(ready|failed)$/, { timeout: 90_000 });

  const panel = page.getByRole("dialog");
  const openPanel = async () => {
    await page.getByRole("button", { name: "更多选项", exact: true }).click();
    await page.getByRole("menuitem", { name: /B站歌单/ }).click();
    await expect(panel).toBeVisible();
  };
  const paste = async (text) => {
    await panel.getByLabel("B站链接").fill(text);
    await panel.getByRole("button", { name: "放上吧台" }).click();
  };
  const rows = page.locator(".drink-row");
  const openMenu = () => page.getByLabel("打开酒单", { exact: true }).click();
  const closeMenu = () => page.getByLabel("关闭酒单", { exact: true }).click();

  // a b23.tv share text → 「B站点歌」
  await openPanel();
  await paste("【第一杯 · 琥珀】 https://b23.tv/abc 快来看");
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".status-toast")).toContainText("加进了 B站点歌");
  await openMenu();
  await expect(page.getByRole("button", { name: /B站点歌/ })).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("第一杯 · 琥珀");
  await closeMenu();

  // a video in a collection: added, and the whole collection offered
  await openPanel();
  await paste("https://www.bilibili.com/video/BV1sssssssss/?spm_id_from=333");
  await expect(panel).toContainText("测试合集");
  fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
  await page.screenshot({ path: path.join(root, "test-results/bilibili-panel.png") });
  await panel.getByRole("button", { name: "整个合集放上吧台" }).click();
  await expect(panel).toHaveCount(0);
  await openMenu();
  await expect(page.getByRole("button", { name: /测试合集/ })).toBeVisible();
  await expect(rows).toHaveCount(3);
  await closeMenu();

  // many parts → their own page; one part (?p=2) → picks
  await openPanel();
  await paste("https://www.bilibili.com/video/BV1mmmmmmmmm");
  await expect(panel).toHaveCount(0);
  await openMenu();
  await expect(page.getByRole("button", { name: /三段式/ })).toBeVisible();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("间奏");
  await closeMenu();
  await openPanel();
  await paste("https://www.bilibili.com/video/BV1mmmmmmmmm?p=2");
  await expect(panel).toHaveCount(0);

  // a public favourites folder (two pages; the dead video is left out)
  await openPanel();
  await paste("https://space.bilibili.com/9/favlist?fid=555&ftype=create");
  await expect(panel).toHaveCount(0);
  await openMenu();
  await expect(page.getByRole("button", { name: /公开收藏/ })).toBeVisible();
  await expect(rows).toHaveCount(24);
  await closeMenu();

  // problems are explained
  await openPanel();
  await paste("https://www.bilibili.com/medialist/detail/ml666");
  await expect(panel.locator(".spotify-error")).toContainText("私密");
  await paste("https://space.bilibili.com/9/favlist?fid=1");
  await expect(panel.locator(".spotify-error")).toContainText("不存在");
  await paste("BV1zzzzzzzzz");
  await expect(panel.locator(".spotify-error")).toContainText("访问太频繁");
  await paste("BV1xxxxxxxxx");
  await expect(panel.locator(".spotify-error")).toContainText("不存在");
  await paste("https://example.com/hello");
  await expect(panel.locator(".spotify-error")).toContainText("认不出");
  await expect(panel.locator(".spotify-list li")).toHaveCount(4); // picks, collection, parts, favourites
  await page.keyboard.press("Escape");

  // ---- playing: the picks page, first glass (9 s long)
  await openMenu();
  await page.getByRole("button", { name: /B站点歌/ }).click();
  await expect(rows).toHaveCount(3); // 第一杯, 合集里的一杯, 间奏
  await rows.first().locator(".drink-main").click();
  await closeMenu();
  const screen = page.locator(".bilibili-screen");
  await expect(screen).toBeVisible();
  await expect(screen.locator(".bilibili-title")).toHaveText("第一杯 · 琥珀");
  await expect.poll(() => embeds(page).at(-1)?.bvid).toBe("BV1aaaaaaaaa");
  expect(embeds(page).at(-1)).toMatchObject({ autoplay: "1", p: "1", danmaku: "0" });
  await expect(screen.locator(".bilibili-shield")).toHaveCount(1);
  await page.screenshot({ path: path.join(root, "test-results/bilibili-screen.png") });
  // the clock starts once the player is up
  const progress = (on) => on.getByRole("slider", { name: "播放进度" }).inputValue().then(Number);
  await expect.poll(() => progress(page), { timeout: 10_000 }).toBeGreaterThan(1);

  // pause: reload paused at the second it reached; resume from there
  await page.getByLabel("暂停", { exact: true }).click();
  await expect.poll(() => embeds(page).at(-1)?.autoplay).toBe("0");
  const pausedAt = Number(embeds(page).at(-1).t ?? 0);
  expect(pausedAt).toBeGreaterThan(0.4);
  await page.getByLabel("播放", { exact: true }).click();
  await expect.poll(() => embeds(page).at(-1)?.autoplay).toBe("1");
  expect(Math.abs(Number(embeds(page).at(-1).t ?? 0) - pausedAt)).toBeLessThan(0.6);

  // the shield sends a click on the picture to the bar's own play / pause
  await screen.locator(".bilibili-shield").click();
  await expect(page.getByLabel("播放", { exact: true })).toBeVisible();
  await screen.locator(".bilibili-shield").click();
  await expect(page.getByLabel("暂停", { exact: true })).toBeVisible();
  // unlocking takes the shield away
  await screen.getByRole("button", { name: /解锁/ }).click();
  await expect(screen.locator(".bilibili-shield")).toHaveCount(0);
  await screen.getByRole("button", { name: /锁回去/ }).click();
  await expect(screen.locator(".bilibili-shield")).toHaveCount(1);

  // the length running out pours the next glass
  await expect(screen.locator(".bilibili-title")).toHaveText("合集里的一杯", { timeout: 25_000 });
  await expect.poll(() => embeds(page).at(-1)?.bvid).toBe("BV1sssssssss");

  // a jump (→ key: +5 s) reloads at the new second
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  const before = embeds(page).at(-1)?._;
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => embeds(page).at(-1)?._ ?? before).not.toBe(before);
  await expect.poll(() => Number(embeds(page).at(-1)?.t ?? 0)).toBeGreaterThan(4);

  // the open-on-Bilibili link carries the second
  const href = await screen.getByRole("link", { name: /在 B站打开/ }).getAttribute("href");
  expect(href).toContain("https://www.bilibili.com/video/BV1sssssssss");

  // pages survive a reload
  await page.reload();
  await expect(page.locator(".tavern-app")).toHaveAttribute("data-scene", /^(ready|failed)$/, { timeout: 90_000 });
  await openMenu();
  for (const name of [/B站点歌/, /测试合集/, /三段式/, /公开收藏/])
    await expect(page.getByRole("button", { name })).toBeVisible();
  await page.getByRole("button", { name: /公开收藏/ }).click();
  await expect(rows).toHaveCount(24);
  await closeMenu();

  // ---- 同席: a friend's screen follows
  await page.getByRole("button", { name: "更多选项", exact: true }).click();
  await page.getByRole("menuitem", { name: /同席/ }).click();
  await panel.getByRole("button", { name: /开放同席/ }).click();
  const inviteField = panel.getByLabel("邀请链接", { exact: true });
  await expect(inviteField).toHaveValue(/\?room=/, { timeout: 30_000 });
  const invite = new URL(await inviteField.inputValue()).search;
  await page.keyboard.press("Escape");
  // after the reload the bar waits for a press of play
  const playButton = page.getByLabel("播放", { exact: true });
  if (await playButton.isVisible()) await playButton.click();
  await expect(page.getByLabel("暂停", { exact: true })).toBeVisible();
  await expect.poll(() => embeds(page).at(-1)?.autoplay).toBe("1");

  const guest = await launchPersistent(path.join(tmp, "guest"), {
    viewport: { width: 1280, height: 800 },
    locale: "zh-CN",
  });
  try {
    await fakeEmbed(guest);
    await guest.addInitScript(() => localStorage.setItem("tavern-skip-entrance", "true"));
    const friend = guest.pages()[0] ?? (await guest.newPage());
    friend.on("pageerror", (error) => errors.push(`guest: ${error.message}`));
    await friend.goto(`${base}${invite}`);
    // the 3D bar's first frames can hold the page for a while in software rendering
    await expect(friend.locator(".tavern-app")).toHaveAttribute("data-scene", /^(ready|failed)$/, { timeout: 90_000 });
    await friend.getByRole("button", { name: "入座" }).click();
    await expect(friend.locator(".bilibili-screen")).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => embeds(friend).at(-1)?.bvid, { timeout: 30_000 }).toBe("BV1sssssssss");
    const hostAt = await progress(page);
    expect(embeds(page).at(-1)?.bvid).toBe("BV1sssssssss");
    const guestFrom = Number(embeds(friend).at(-1).t ?? 0);
    expect(Math.abs(guestFrom - hostAt)).toBeLessThan(6);
    // the host pauses: the friend's screen pauses too
    await page.getByLabel("暂停", { exact: true }).click();
    await expect(page.getByLabel("播放", { exact: true })).toBeVisible();
    await expect.poll(() => embeds(page).at(-1)?.autoplay).toBe("0");
    await expect.poll(() => embeds(friend).at(-1)?.autoplay, { timeout: 20_000 }).toBe("0");
  } finally {
    await guest.close();
  }

  expect(errors).toEqual([]);
  console.log(
    "Bilibili passed: short link, video, collection, parts, favourites, problems, play/pause/resume, shield, next on length, jump, reload, 同席.",
  );
} catch (error) {
  console.error(serverLog.slice(-3000));
  throw error;
} finally {
  await host.close();
  api.close();
  short.close();
}
process.exit(0);
