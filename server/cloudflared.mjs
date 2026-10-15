// Finding / fetching Cloudflare's official cloudflared program for 同席.
// It comes from the cloudflare/cloudflared GitHub releases, once, into the
// project's tools folder. Windows and Linux builds are plain programs; the
// macOS builds come packed in a .tgz, unpacked here without any extra tools.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

/** Test hooks: another download location / a fixed asset name. */
const RELEASES =
  process.env.TAVERN_CLOUDFLARED_URL || "https://github.com/cloudflare/cloudflared/releases/latest/download";
const FORCED_ASSET = process.env.TAVERN_CLOUDFLARED_ASSET || "";

export const exeName = (platform = process.platform) =>
  platform === "win32" ? "cloudflared.exe" : "cloudflared";

/** cloudflared in the tools folder, or anywhere on PATH (e.g. installed with Homebrew). */
export function findCloudflared(tools, platform = process.platform) {
  const name = exeName(platform);
  const local = path.join(tools, name);
  if (fs.existsSync(local)) return local;
  if (process.env.TAVERN_CLOUDFLARED_LOCAL_ONLY === "1") return ""; // tests: only the tools folder
  const extra =
    platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin"] : [];
  for (const dir of [...(process.env.PATH || "").split(path.delimiter), ...extra]) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* not here */
    }
  }
  return "";
}

/** The official build for this computer (empty: no build for it). */
export function releaseAsset(platform = process.platform, arch = process.arch) {
  if (FORCED_ASSET) return FORCED_ASSET;
  if (platform === "win32")
    return arch === "ia32" ? "cloudflared-windows-386.exe" : "cloudflared-windows-amd64.exe";
  if (platform === "darwin")
    // Apple silicon gets its own build; Intel Macs (and Node under Rosetta) the amd64 one
    return arch === "arm64" ? "cloudflared-darwin-arm64.tgz" : "cloudflared-darwin-amd64.tgz";
  if (platform === "linux")
    return arch === "arm64"
      ? "cloudflared-linux-arm64"
      : arch === "arm"
        ? "cloudflared-linux-arm"
        : arch === "ia32"
          ? "cloudflared-linux-386"
          : "cloudflared-linux-amd64";
  return "";
}

const cString = (block, start, length) => {
  const end = block.indexOf(0, start);
  return block.toString("utf8", start, end >= 0 && end < start + length ? end : start + length);
};

/** The cloudflared program inside a .tgz (null if there is none). */
export function unpackCloudflared(tgz) {
  const tar = zlib.gunzipSync(tgz);
  let longName = "";
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const sizeField = cString(header, 124, 12).trim();
    const size = sizeField ? parseInt(sizeField, 8) : 0;
    if (!Number.isFinite(size) || size < 0) return null;
    const type = header[156] ? String.fromCharCode(header[156]) : "0";
    const start = offset + 512;
    const body = tar.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
    if (type === "x") {
      // pax header: may carry the next entry's real path
      const found = body.toString("utf8").match(/(?:^|\n)\d+ path=([^\n]*)\n/);
      longName = found ? found[1] : "";
      continue;
    }
    if (type === "L") {
      // GNU long name
      longName = body.toString("utf8").replace(/\0.*$/s, "");
      continue;
    }
    const prefix = header.toString("utf8", 257, 262) === "ustar" ? cString(header, 345, 155) : "";
    const name = longName || (prefix ? `${prefix}/${cString(header, 0, 100)}` : cString(header, 0, 100));
    longName = "";
    if ((type === "0" || type === "7") && path.posix.basename(name) === "cloudflared") return body;
  }
  return null;
}

/**
 * Download cloudflared into `tools` (once). `onProgress` gets 0–100.
 * Returns the program's path.
 */
export async function downloadCloudflared(tools, { onProgress = () => {}, log = () => {} } = {}) {
  const asset = releaseAsset();
  if (!asset) throw new Error("这台电脑的系统没有现成的 cloudflared，可以自己装一个再试");
  const url = `${RELEASES.replace(/\/$/, "")}/${asset}`;
  await fsp.mkdir(tools, { recursive: true });
  const target = path.join(tools, exeName());
  const part = `${target}.part`;
  log("正在下载 Cloudflare 隧道工具：", url);
  onProgress(0);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`下载失败（HTTP ${response.status}）`);
  const total = Number(response.headers.get("content-length") || 0);
  const out = fs.createWriteStream(part);
  let received = 0;
  let lastReport = 0;
  try {
    for await (const chunk of response.body) {
      received += chunk.length;
      if (!out.write(chunk)) await new Promise((resolve) => out.once("drain", resolve));
      if (total && Date.now() - lastReport > 400) {
        lastReport = Date.now();
        onProgress(Math.round((received / total) * 100));
      }
    }
  } finally {
    await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())));
  }
  if (received < 1_000_000) throw new Error("下载的文件不完整");
  if (asset.endsWith(".tgz")) {
    let program;
    try {
      program = unpackCloudflared(await fsp.readFile(part));
    } catch {
      program = null;
    }
    await fsp.rm(part, { force: true });
    if (!program || program.length < 1_000_000) throw new Error("下载的压缩包里没有找到 cloudflared");
    await fsp.writeFile(part, program);
  }
  await fsp.rename(part, target);
  if (process.platform !== "win32") await fsp.chmod(target, 0o755);
  log("cloudflared 已下载到", target);
  return target;
}

/** Clean up a half-finished download. */
export function forgetPartialDownload(tools) {
  return fsp.rm(path.join(tools, `${exeName()}.part`), { force: true }).catch(() => {});
}
