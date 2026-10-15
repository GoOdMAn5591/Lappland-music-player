// 无序酒馆 · 一键启动（Mac 由「启动酒馆.command」调用；Windows 用 scripts/launch.ps1）
// 1. 酒馆已经开着 → 直接打开浏览器
// 2. 检查 Node.js 版本
// 3. 第一次运行 / package.json 有更新 / 依赖是在别的系统上装的 → 自动安装依赖
// 4. 代码有更新 → 重新构建页面（dist/）
// 5. 用 server/tavern-server.mjs 固定在 127.0.0.1:5173 开门，并打开浏览器
//
// `node scripts/launch.mjs --dry-run` 只说明会做什么（测试用）。

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const PORT = Number(process.env.TAVERN_PORT) || 5173;
const ADDRESS = `http://127.0.0.1:${PORT}/`;
const DRY = process.argv.includes("--dry-run");
const NO_OPEN = process.env.TAVERN_NO_OPEN === "1";
const WIN = process.platform === "win32";

const paint = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const yellow = paint("33");
const green = paint("32");
const red = paint("31");
const say = (text, color = yellow) => console.log(color(text));
function fail(text) {
  say("");
  say(text, red);
  say("  把这个窗口截图发给 Claude 就行。", red);
  process.exit(1);
}

function openBrowser(url) {
  if (NO_OPEN) return;
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : WIN
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(command, args, { stdio: "ignore", detached: true, windowsHide: true }).unref();
  } catch {
    /* the address is printed anyway */
  }
}

/** free | tavern (already open) | other (some other program has the port) */
async function portState() {
  const busy = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (error) => resolve(error.code === "EADDRINUSE" || error.code === "EACCES"));
    probe.once("listening", () => probe.close(() => resolve(false)));
    probe.listen(PORT, "127.0.0.1");
  });
  if (!busy) return "free";
  try {
    const response = await fetch(`${ADDRESS}room/info`, { signal: AbortSignal.timeout(2500) });
    const body = await response.json();
    return body?.server === "tavern" ? "tavern" : "other";
  } catch {
    return "other";
  }
}

const exists = (file) => fs.existsSync(path.join(root, file));
const mtime = (file) => {
  try {
    return fs.statSync(path.join(root, file)).mtimeMs;
  } catch {
    return 0;
  }
};

/** The build tools have a native part per system: was node_modules installed on this one? */
function builtForThisComputer() {
  const { platform, arch } = process;
  const esbuild = exists(`node_modules/@esbuild/${platform}-${arch}`);
  let rollup = false;
  try {
    rollup = fs
      .readdirSync(path.join(root, "node_modules/@rollup"))
      .some((name) => name.startsWith(`rollup-${platform}-${arch}`));
  } catch {
    rollup = false;
  }
  return esbuild && rollup;
}

/** ok | install | reinstall */
function dependencyPlan() {
  const needed = ["node_modules/vite/package.json", "node_modules/three/package.json", "node_modules/@fontsource/noto-serif-sc/package.json"];
  if (!exists("node_modules")) return "install";
  if (!builtForThisComputer()) return "reinstall";
  if (needed.some((file) => !exists(file))) return "install";
  const marker = mtime("node_modules/.package-lock.json");
  if (!marker || mtime("package.json") > marker) return "install";
  return "ok";
}

function newestIn(dir, after) {
  const stack = [path.join(root, dir)];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (fs.statSync(full).mtimeMs > after) return full;
    }
  }
  return "";
}

/** Does dist/ need building again? */
function needsBuild() {
  const builtAt = mtime("dist/index.html");
  if (!builtAt) return true;
  if (newestIn("src", builtAt) || newestIn("public", builtAt)) return true;
  return ["index.html", "package.json", "vite.config.ts", "vite.config.js"].some((file) => mtime(file) > builtAt);
}

function npm(args) {
  const result = spawnSync(WIN ? "npm.cmd" : "npm", args, { stdio: "inherit", shell: WIN });
  if (result.error && result.error.code === "ENOENT")
    fail("  找不到 npm。重新安装 Node.js（nodejs.org 的 LTS 版，自带 npm）后再试。");
  return result.status === 0;
}

async function main() {
  const major = Number(process.versions.node.split(".")[0]);
  const port = await portState();
  const deps = dependencyPlan();
  if (DRY) {
    console.log(
      JSON.stringify({ node: process.versions.node, platform: process.platform, arch: process.arch, port, deps, build: deps !== "ok" || needsBuild() }),
    );
    return;
  }

  say("");
  say("  无序酒馆 · LAPPLAND AFTER HOURS");
  say("  ----------------------------------");

  // 1. 已经在营业？
  if (port === "tavern") {
    say(`  酒馆已经开着了，直接帮你打开：${ADDRESS}`, green);
    openBrowser(ADDRESS);
    return;
  }
  if (port === "other")
    fail(`  端口 ${PORT} 被别的程序占用了，酒馆开不了门。关掉占用它的程序（或者重启电脑）再试。`);

  // 2. Node.js
  if (major < 18) {
    openBrowser("https://nodejs.org/zh-cn/download");
    fail(`  你的 Node.js 版本是 ${process.versions.node}，太旧了。已经帮你打开下载页：装 LTS 版本，装完再双击「启动酒馆」。`);
  }
  if (major < 22) say(`  提示：你的 Node.js 版本是 ${process.versions.node}，有点旧，建议升级到 22 以上。`);

  // 3. 依赖
  if (deps === "reinstall") {
    say("  这里的依赖是在别的电脑系统上装的，正在为这台电脑重新备酒（重新安装依赖），大约一两分钟……");
    if (!npm(["ci"]) && !npm(["install"])) fail("  安装依赖失败了（npm ci）。检查网络后再双击一次。");
  } else if (deps === "install") {
    say("  正在备酒（安装依赖），第一次大约一两分钟，之后就快了……");
    if (!npm(["install"])) fail("  安装依赖失败了（npm install）。检查网络后再双击一次。");
  }

  // 4. 构建（只在代码比上次构建新的时候）
  if (deps !== "ok" || needsBuild()) {
    say("  正在调酒（构建页面），大约半分钟，只有更新后的第一次需要……");
    const build = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--logLevel", "warn"], {
      stdio: "inherit",
    });
    if (build.status !== 0) fail("  页面构建失败了（vite build）。");
  }

  // 5. 开门
  say("");
  say(`  酒馆开门：${ADDRESS}`, green);
  say("  浏览器会自动打开。听歌的时候别关这个窗口——关掉窗口 = 打烊（同席房间也会一起关闭）。", green);
  say("  想和朋友一起听：页面右上角「…」→「同席 · 一起听」。", green);
  say("");
  const server = spawn(
    process.execPath,
    ["server/tavern-server.mjs", "--port", String(PORT), ...(NO_OPEN ? [] : ["--open"])],
    { stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(signal, () => {
      server.kill(signal);
    });
  server.on("exit", (code, signal) => {
    if (code && !signal) fail("  酒馆没能开门（服务器启动出错）。");
    process.exit(code ?? 0);
  });
}

main().catch((error) => fail(`  启动出错：${String(error?.message || error)}`));
