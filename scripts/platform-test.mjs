// Mac / Windows / Linux plumbing, without a browser:
//  - the Mac launchers are valid shell scripts with Unix line endings and the
//    executable bit (so a double-click in Finder runs them),
//  - the right cloudflared build is chosen for every system, and the packed
//    macOS build is unpacked correctly,
//  - the tavern server downloads + unpacks + starts cloudflared for 同席 by
//    itself (against a stand-in release server),
//  - the launcher knows what to do (dry run).
// On a real Mac (macOS CI) it also downloads the real cloudflared from GitHub
// and starts the tavern with the real 「启动酒馆.command」.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tavern-platform-"));
const onMac = process.platform === "darwin";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = [];
process.on("exit", () => {
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* gone */
      }
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ------------------------------------------------------------ launcher files
const launchers = ["启动酒馆.command", "创建桌面快捷方式.command"];
for (const name of launchers) {
  const file = path.join(root, name);
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.startsWith("#!/bin/bash\n"), `${name}: starts with #!/bin/bash`);
  assert.ok(!text.includes("\r"), `${name}: Unix line endings only`);
  const syntax = spawnSync("bash", ["-n", file], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `${name}: bash syntax ${syntax.stderr}`);
  // what git hands to a Mac: mode 100755 = double-clickable
  const staged = execFileSync("git", ["ls-files", "-s", "--", name], { cwd: root, encoding: "utf8" });
  if (staged) assert.ok(staged.startsWith("100755"), `${name}: executable in git (${staged.trim()})`);
  if (process.platform !== "win32") assert.ok(fs.statSync(file).mode & 0o111, `${name}: executable here`);
}
const attributes = fs.readFileSync(path.join(root, ".gitattributes"), "utf8");
assert.match(attributes, /\*\.command\s+text\s+eol=lf/, ".gitattributes keeps .command files LF");
assert.ok(fs.existsSync(path.join(root, "scripts/tavern.png")), "desktop icon for the Mac shortcut");
console.log("✓ Mac launcher files");

// ------------------------------------------------------- cloudflared builds
const cf = await import("../server/cloudflared.mjs");
const assets = {
  "darwin arm64": "cloudflared-darwin-arm64.tgz",
  "darwin x64": "cloudflared-darwin-amd64.tgz",
  "win32 x64": "cloudflared-windows-amd64.exe",
  "win32 ia32": "cloudflared-windows-386.exe",
  "win32 arm64": "cloudflared-windows-amd64.exe",
  "linux x64": "cloudflared-linux-amd64",
  "linux arm64": "cloudflared-linux-arm64",
};
for (const [key, asset] of Object.entries(assets)) {
  const [platform, arch] = key.split(" ");
  assert.equal(cf.releaseAsset(platform, arch), asset, key);
}
assert.equal(cf.exeName("win32"), "cloudflared.exe");
assert.equal(cf.exeName("darwin"), "cloudflared");

/** A minimal tar (ustar) archive with the given files, gzipped. */
function tgz(files) {
  const blocks = [];
  for (const [name, body] of files) {
    const header = Buffer.alloc(512);
    header.write(name.slice(0, 99), 0);
    header.write("0000755\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, "0")}\0`, 136);
    header.write("        ", 148);
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
}

// a stand-in cloudflared: prints a quick-tunnel address and stays up
const fakeProgram = Buffer.concat([
  Buffer.from(
    '#!/bin/sh\necho "INF |  https://platform-check-tunnel.trycloudflare.com  |" >&2\nwhile true; do sleep 1; done\n#',
  ),
  crypto.randomBytes(1_200_000), // big (and incompressible) enough to pass the size checks
]);
const archive = tgz([
  ["._cloudflared", Buffer.from("AppleDouble")], // what a Mac's tar adds
  ["cloudflared", fakeProgram],
]);
assert.equal(Buffer.compare(cf.unpackCloudflared(archive), fakeProgram), 0, "unpacks the program");
assert.equal(cf.unpackCloudflared(tgz([["README", Buffer.from("hi")]])), null, "no program → null");

// the system's own tar, too (on a Mac that's bsdtar, with its own header style)
const systemTar = spawnSync("tar", ["--version"], { encoding: "utf8" });
if (systemTar.status === 0) {
  const dir = path.join(tmp, "tar");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "cloudflared"), fakeProgram, { mode: 0o755 });
  const made = spawnSync("tar", ["-czf", path.join(tmp, "system.tgz"), "-C", dir, "cloudflared"]);
  assert.equal(made.status, 0, "system tar works");
  const unpacked = cf.unpackCloudflared(fs.readFileSync(path.join(tmp, "system.tgz")));
  assert.equal(Buffer.compare(unpacked, fakeProgram), 0, `unpacks ${systemTar.stdout.split("\n")[0]}`);
}
console.log("✓ cloudflared builds for every system, macOS .tgz unpacked");

// ------------------------------------- the server fetches cloudflared itself
if (process.platform !== "win32") {
  const releases = http.createServer((req, res) => {
    if (req.url === "/cloudflared-darwin-arm64.tgz") {
      res.writeHead(200, { "content-type": "application/gzip", "content-length": archive.length });
      res.end(archive);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => releases.listen(0, "127.0.0.1", resolve));
  const tools = path.join(tmp, "tools");
  const port = 5600 + Math.floor(Math.random() * 300);
  const server = spawn(
    process.execPath,
    [path.join(root, "server/tavern-server.mjs"), "--port", String(port), "--tools", tools],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin", // no cloudflared installed anywhere
        TAVERN_CLOUDFLARED_URL: `http://127.0.0.1:${releases.address().port}`,
        TAVERN_CLOUDFLARED_ASSET: "cloudflared-darwin-arm64.tgz",
        TAVERN_CLOUDFLARED_LOCAL_ONLY: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  children.push(server);
  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk));
  server.stderr.on("data", (chunk) => (output += chunk));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${base}/room/info`);
      break;
    } catch {
      await sleep(200);
    }
  }
  const opened = await fetch(`${base}/room/open`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tavern": "1" },
    body: JSON.stringify({ name: "platform" }),
  });
  assert.equal(opened.status, 200, "room opens");
  let info;
  for (let i = 0; i < 60; i++) {
    info = await fetch(`${base}/room/info`).then((r) => r.json());
    if (info.tunnel?.status === "ready" || info.tunnel?.status === "missing" || info.tunnel?.status === "error") break;
    await sleep(250);
  }
  assert.equal(info.tunnel?.status, "ready", `tunnel ready (${JSON.stringify(info.tunnel)})\n${output}`);
  assert.equal(info.tunnel.url, "https://platform-check-tunnel.trycloudflare.com");
  const program = path.join(tools, "cloudflared");
  assert.equal(Buffer.compare(fs.readFileSync(program), fakeProgram), 0, "the unpacked program is in tools/");
  assert.ok(fs.statSync(program).mode & 0o100, "and it is executable");
  assert.ok(!fs.existsSync(`${program}.part`), "no leftovers");
  process.kill(-server.pid, "SIGTERM");
  releases.close();
  console.log("✓ the tavern downloads, unpacks and starts cloudflared for 同席");
}

// ------------------------------------------------------------ launcher plan
const plan = JSON.parse(
  execFileSync(process.execPath, [path.join(root, "scripts/launch.mjs"), "--dry-run"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, TAVERN_PORT: "5999" },
  }),
);
assert.equal(plan.platform, process.platform);
assert.equal(plan.port, "free");
assert.ok(["ok", "install", "reinstall"].includes(plan.deps), `deps plan ${plan.deps}`);
if (fs.existsSync(path.join(root, "node_modules/vite"))) assert.equal(plan.deps, "ok", "node_modules fits this computer");
console.log(`✓ launcher plan: ${JSON.stringify(plan)}`);

// ------------------------------------------------------------ on a real Mac
if (onMac) {
  // the real cloudflared from GitHub, unpacked, runs
  const tools = path.join(tmp, "real-tools");
  const env = { ...process.env };
  delete env.TAVERN_CLOUDFLARED_URL;
  delete env.TAVERN_CLOUDFLARED_ASSET;
  const download = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const cf = await import(${JSON.stringify(path.join(root, "server/cloudflared.mjs"))});
       console.log(await cf.downloadCloudflared(${JSON.stringify(tools)}));`,
    ],
    { encoding: "utf8", env, timeout: 180_000 },
  );
  assert.equal(download.status, 0, `real download: ${download.stderr}`);
  const version = spawnSync(path.join(tools, "cloudflared"), ["--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, `cloudflared runs: ${version.stderr}`);
  console.log(`✓ real macOS cloudflared: ${version.stdout.trim()}`);

  // the real double-click file brings the tavern up
  const launcher = spawn("/bin/bash", [path.join(root, "启动酒馆.command")], {
    cwd: os.homedir(), // Finder starts it from elsewhere; the script finds its own folder
    env: { ...process.env, TAVERN_NO_OPEN: "1", TAVERN_PORT: "5173" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  children.push(launcher);
  let said = "";
  launcher.stdout.on("data", (chunk) => (said += chunk));
  launcher.stderr.on("data", (chunk) => (said += chunk));
  let page = "";
  for (let i = 0; i < 300 && !page.includes("<div id=\"root\""); i++) {
    await sleep(1000);
    page = await fetch("http://127.0.0.1:5173/").then((r) => r.text()).catch(() => "");
  }
  assert.ok(page.includes('<div id="root"'), `启动酒馆.command serves the tavern\n${said}`);
  assert.match(said, /酒馆开门/, "it greets in Chinese");
  // a second double-click while it runs just opens the browser
  const again = spawnSync("/bin/bash", [path.join(root, "启动酒馆.command")], {
    env: { ...process.env, TAVERN_NO_OPEN: "1" },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(again.status, 0, `second launch: ${again.stdout}${again.stderr}`);
  assert.match(again.stdout, /已经开着/, "second launch sees the open tavern");
  process.kill(-launcher.pid, "SIGHUP"); // closing the Terminal window
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (!(await fetch("http://127.0.0.1:5173/").then(() => true).catch(() => false))) break;
  }
  assert.ok(
    !(await fetch("http://127.0.0.1:5173/").then(() => true).catch(() => false)),
    "closing the window closes the tavern",
  );
  console.log("✓ 启动酒馆.command opens the tavern on macOS and closes with the window");
}

console.log("Platform checks passed.");
process.exit(0);
