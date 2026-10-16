#!/usr/bin/env node
// 无序酒馆 · 本地服务器
//
// 1. 把构建好的页面（dist/）放在 http://127.0.0.1:5173 上（和以前同一个地址，
//    浏览器里存的歌和歌单都还在）。
// 2. 「同席」：房主在页面里点「开放同席」后，这里会开一个 Cloudflare 临时隧道
//    （trycloudflare.com），朋友用邀请链接在任何地方的浏览器里入座。房主正在放
//    的那首歌由这台电脑转给大家，所有人按同一个时钟对齐播放进度。
//
// 只用 Node 自带模块，不需要额外安装依赖。只监听 127.0.0.1：外网只能经过隧道、
// 并且必须带上邀请链接里的房间密钥才能进来。

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BilibiliError, readBilibili } from "./bilibili.mjs";
import {
  downloadCloudflared,
  exeName,
  findCloudflared,
  forgetPartialDownload,
  releaseAsset,
} from "./cloudflared.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")
    ? args[i + 1]
    : fallback;
};
const PORT = Number(arg("port", process.env.PORT || 5173));
const HOST = arg("host", "127.0.0.1");
const DIST = path.resolve(root, arg("dist", "dist"));
const OPEN_BROWSER = args.includes("--open");
const TOOLS = path.resolve(root, arg("tools", "tools"));

const MAX_JSON = 4 * 1024 * 1024;
const MAX_AUDIO = 400 * 1024 * 1024;
const MAX_COVER = 6 * 1024 * 1024;
const KEEP_AUDIO = 4;
const HOST_GRACE_MS = 90_000;

// ---------------------------------------------------------------------------
// helpers

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest)|image\/svg)/;

const log = (...parts) =>
  console.log(
    `  [${new Date().toLocaleTimeString("zh-CN", { hour12: false })}]`,
    ...parts,
  );

function send(res, status, body, headers = {}) {
  const data =
    typeof body === "string" || Buffer.isBuffer(body)
      ? body
      : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type":
      typeof body === "string" || Buffer.isBuffer(body)
        ? "text/plain; charset=utf-8"
        : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > limit) {
      reject(Object.assign(new Error("too large"), { status: 413 }));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, MAX_JSON);
  try {
    return JSON.parse(buf.toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("bad json"), { status: 400 });
  }
}

const loopback = (address = "") =>
  address === "127.0.0.1" ||
  address === "::1" ||
  address === "::ffff:127.0.0.1";

/**
 * A request counts as "this computer" only if it came over loopback, was not
 * forwarded by the tunnel (cloudflared always adds Cf-Connecting-Ip) and is
 * addressed to 127.0.0.1/localhost (blocks DNS-rebinding tricks).
 */
function isLocal(req) {
  if (!loopback(req.socket.remoteAddress)) return false;
  if (req.headers["cf-connecting-ip"] || req.headers["cf-ray"]) return false;
  if (req.headers["x-forwarded-for"]) return false;
  const host = String(req.headers.host || "").replace(/:\d+$/, "");
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}

/**
 * Writes must come from our own page: a custom header forces a CORS preflight
 * that we never approve. Guests coming through the tunnel are additionally
 * checked against the room key; local writes must also match our own origin.
 */
function sameOriginWrite(req) {
  if (req.headers["x-tavern"] !== "1") return false;
  const origin = req.headers.origin;
  if (!origin || !isLocal(req)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const cleanName = (value, fallback) => {
  const name = String(value || "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .slice(0, 16);
  return name || fallback;
};

const cleanId = (value) =>
  /^[A-Za-z0-9_-]{6,40}$/.test(String(value || "")) ? String(value) : "";

// ---------------------------------------------------------------------------
// room state

const room = {
  open: false,
  key: "",
  hostName: "房主",
  rev: 0,
  snapshot: null,
  library: null,
  members: new Map(), // id -> { id, name, role, streams:Set<res>, joinedAt, lastCommand: number[] }
  audio: new Map(), // trackId -> { buf, type, at }
  audioWaiters: new Map(), // trackId -> Set<fn>
  covers: new Map(),
  hostGone: null,
};

const tunnel = {
  status: "off", // off | downloading | starting | ready | missing | error
  url: "",
  error: "",
  progress: 0,
  proc: null,
};

const POLL_HOLD_MS = 25_000;
const POLL_GONE_MS = 35_000;
const STREAM_GONE_MS = 4_000;
const QUEUE_LIMIT = 300;

/**
 * Every member has a small numbered event queue. Live SSE streams get each
 * event immediately; members that fell back to long-polling (some tunnels
 * hold back event streams) pick them up on their next /room/poll.
 */
function newMember(id, name, role) {
  return {
    id,
    name,
    role,
    streams: new Set(),
    queue: [],
    seq: 0,
    waiters: new Set(),
    polls: 0,
    polling: false,
    lastSeen: Date.now(),
    joinedAt: Date.now(),
    lastCommand: [],
  };
}

const present = (m) =>
  m.streams.size > 0 ||
  m.polls > 0 ||
  Date.now() - m.lastSeen < (m.polling ? POLL_GONE_MS : STREAM_GONE_MS);

function memberList() {
  return [...room.members.values()]
    .filter(present)
    .map((m) => ({ id: m.id, name: m.name, role: m.role }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "host" ? -1 : 1));
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function deliver(member, event, data) {
  const item = { s: ++member.seq, e: event, d: data };
  member.queue.push(item);
  if (member.queue.length > QUEUE_LIMIT) member.queue.splice(0, member.queue.length - QUEUE_LIMIT);
  for (const res of member.streams) sse(res, event, data);
  for (const wake of member.waiters) wake();
}

function broadcast(event, data, filter = () => true) {
  for (const member of room.members.values()) if (filter(member)) deliver(member, event, data);
}

const toHost = (event, data) => broadcast(event, data, (m) => m.role === "host");
// `text` is the Chinese line; `name` lets each page phrase it in its own language.
const notice = (text, kind = "info", name) =>
  broadcast("notice", { text, kind, name, at: Date.now() });

function tunnelInfo() {
  return {
    status: tunnel.status,
    url: tunnel.url,
    error: tunnel.error,
    progress: tunnel.progress,
  };
}

function inviteUrl() {
  return tunnel.url && room.key ? `${tunnel.url}/?room=${room.key}` : "";
}

function setTunnel(patch) {
  Object.assign(tunnel, patch);
  toHost("tunnel", { ...tunnelInfo(), invite: inviteUrl() });
}

function closeRoom(reason = "房主打烊了") {
  if (!room.open) return;
  broadcast("closed", { reason }, (m) => m.role !== "host");
  for (const member of room.members.values())
    if (member.role !== "host") {
      for (const res of member.streams) res.end();
      for (const wake of member.waiters) wake();
    }
  room.open = false;
  room.key = "";
  room.snapshot = null;
  room.library = null;
  room.audio.clear();
  room.covers.clear();
  for (const waiters of room.audioWaiters.values())
    for (const done of waiters) done();
  room.audioWaiters.clear();
  for (const [id, member] of room.members)
    if (member.role !== "host") room.members.delete(id);
  clearTimeout(room.hostGone);
  stopTunnel();
  log("同席已关闭");
}

// ---------------------------------------------------------------------------
// cloudflared quick tunnel

async function startTunnel() {
  if (tunnel.proc || tunnel.status === "downloading") return;
  let bin = findCloudflared(TOOLS);
  try {
    if (!bin) {
      setTunnel({ status: "downloading", progress: 0, error: "" });
      bin = await downloadCloudflared(TOOLS, {
        log,
        onProgress: (progress) => setTunnel({ progress }),
      });
    }
  } catch (error) {
    await forgetPartialDownload(TOOLS);
    const asset = releaseAsset();
    const manual = asset.endsWith(".tgz")
      ? `也可以在「终端」里运行 brew install cloudflared，或从 github.com/cloudflare/cloudflared/releases 下载 ${asset}，解压出 cloudflared 放进项目的 tools 文件夹。`
      : asset
        ? `也可以手动从 github.com/cloudflare/cloudflared/releases 下载 ${asset}，改名为 ${exeName()} 放进项目的 tools 文件夹。`
        : "";
    setTunnel({
      status: "missing",
      error: `下载 Cloudflare 隧道工具失败（${String(error.message || error)}）。检查网络后点「重试」；${manual}`,
    });
    log("cloudflared 下载失败：", String(error.message || error));
    return;
  }
  if (!room.open) return;
  setTunnel({ status: "starting", url: "", error: "", progress: 0 });
  log("正在接通外网隧道……");
  const proc = spawn(
    bin,
    ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORT}`],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  tunnel.proc = proc;
  const tail = [];
  const onData = (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) if (line.trim()) tail.push(line.trim());
    tail.splice(0, Math.max(0, tail.length - 12));
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && !tunnel.url) {
      setTunnel({ status: "ready", url: match[0].toLowerCase() });
      log("外网地址：", tunnel.url);
      log("邀请链接：", inviteUrl());
    }
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  proc.on("error", (error) => {
    tunnel.proc = null;
    setTunnel({ status: "error", error: String(error.message || error) });
  });
  proc.on("exit", (code) => {
    if (tunnel.proc !== proc) return;
    tunnel.proc = null;
    if (room.open)
      setTunnel({
        status: "error",
        url: "",
        error: `隧道断开了（代码 ${code}）。${tail.slice(-3).join(" ")}`.slice(0, 400),
      });
  });
}

function stopTunnel() {
  const proc = tunnel.proc;
  tunnel.proc = null;
  if (proc) proc.kill();
  Object.assign(tunnel, { status: "off", url: "", error: "", progress: 0 });
  toHost("tunnel", { ...tunnelInfo(), invite: "" });
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => {
    stopTunnel();
    process.exit(0);
  });
process.on("exit", () => tunnel.proc?.kill());

// ---------------------------------------------------------------------------
// room API

function requireMember(req, url) {
  const id = cleanId(req.headers["x-member"] || url.searchParams.get("id"));
  return id ? room.members.get(id) : undefined;
}

function guestAllowed(req, url) {
  if (isLocal(req)) return true;
  const key = req.headers["x-room-key"] || url.searchParams.get("key");
  return room.open && safeEqual(key, room.key);
}

/** Shared by the event stream and long-polling: who is asking, and may they sit down? */
function admit(req, res, url) {
  const local = isLocal(req);
  const role = url.searchParams.get("role") === "host" && local ? "host" : "guest";
  if (!room.open) {
    send(res, 410, { error: "closed" });
    return null;
  }
  if (role === "guest" && !guestAllowed(req, url)) {
    send(res, 403, { error: "key" });
    return null;
  }
  const id = cleanId(url.searchParams.get("id")) || crypto.randomBytes(9).toString("base64url");
  const name = cleanName(url.searchParams.get("name"), role === "host" ? room.hostName : "客人");
  if (role === "host") {
    clearTimeout(room.hostGone);
    room.hostGone = null;
    for (const [otherId, other] of room.members)
      if (other.role === "host" && otherId !== id) {
        for (const stream of other.streams) {
          sse(stream, "replaced", {});
          stream.end();
        }
        room.members.delete(otherId);
      }
  }
  let member = room.members.get(id);
  const arriving = !member || !present(member);
  if (!member) {
    member = newMember(id, name, role);
    room.members.set(id, member);
  }
  member.name = name;
  member.lastSeen = Date.now();
  return { member, arriving };
}

function hello(member) {
  return {
    you: { id: member.id, name: member.name, role: member.role },
    hostName: room.hostName,
    serverTime: Date.now(),
    members: memberList(),
    snapshot: room.snapshot,
    library: room.library,
    ...(member.role === "host" ? { tunnel: { ...tunnelInfo(), invite: inviteUrl() } } : {}),
  };
}

function announceArrival(member) {
  broadcast("members", memberList());
  if (member.role === "guest") {
    notice(`${member.name} 入座了`, "join", member.name);
    log(`${member.name} 入座（${memberList().length} 人）`);
  }
}

function handleEvents(req, res, url) {
  const admitted = admit(req, res, url);
  if (!admitted) return;
  const { member, arriving } = admitted;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`:${" ".repeat(4096)}\nretry: 2500\n\n`);
  if (res.socket) res.socket.setNoDelay(true);
  member.streams.add(res);
  sse(res, "hello", { ...hello(member), seq: member.seq });
  if (arriving) announceArrival(member);

  const ping = setInterval(() => sse(res, "ping", { now: Date.now() }), 15_000);
  req.on("close", () => {
    clearInterval(ping);
    member.streams.delete(res);
    member.lastSeen = Date.now();
  });
}

/**
 * Long-polling fallback for when an event stream gets buffered on the way
 * (it then never reaches the guest even though the server sees them).
 * `since=-1` sits the member down and returns the full state; afterwards each
 * call returns queued events newer than `since`, waiting up to 25 s for one.
 */
async function handlePoll(req, res, url) {
  const admitted = admit(req, res, url);
  if (!admitted) return;
  const { member, arriving } = admitted;
  member.polling = true;
  const since = Number(url.searchParams.get("since"));
  const oldest = member.queue[0]?.s ?? member.seq + 1;
  if (!Number.isFinite(since) || since < 0 || since > member.seq || since < oldest - 1) {
    send(res, 200, { hello: hello(member), events: [], next: member.seq });
    if (arriving) announceArrival(member);
    return;
  }
  if (arriving) announceArrival(member);
  const pending = () => member.queue.filter((item) => item.s > since);
  let events = pending();
  if (!events.length) {
    member.polls++;
    let finished = false;
    await new Promise((resolve) => {
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        member.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, POLL_HOLD_MS);
      member.waiters.add(done);
      req.on("close", done);
    });
    member.polls--;
    events = pending();
  }
  member.lastSeen = Date.now();
  if (res.writableEnded || res.destroyed) return;
  if (!room.open && member.role !== "host" && !events.some((e) => e.e === "closed"))
    return send(res, 410, { error: "closed" });
  send(res, 200, { events, next: events.length ? events[events.length - 1].s : since });
}

// Members that stopped streaming / polling leave the table.
setInterval(() => {
  let changed = false;
  for (const member of [...room.members.values()]) {
    if (present(member)) continue;
    room.members.delete(member.id);
    changed = true;
    if (!room.open) continue;
    if (member.role === "guest") {
      notice(`${member.name} 离席了`, "leave", member.name);
      log(`${member.name} 离席`);
    } else {
      notice("房主暂时离开，稍等片刻…", "host");
      clearTimeout(room.hostGone);
      room.hostGone = setTimeout(() => closeRoom("房主离开了，房间已关闭"), HOST_GRACE_MS);
    }
  }
  if (changed) broadcast("members", memberList());
}, 2000).unref();

const COMMANDS = new Set(["play", "toggle", "next", "prev", "seek", "mode"]);
const MODES = new Set(["sequence", "shuffle", "repeat-all", "repeat-one"]);

async function handleCommand(req, res, url) {
  if (!room.open) return send(res, 410, { error: "closed" });
  if (!guestAllowed(req, url)) return send(res, 403, { error: "key" });
  const member = requireMember(req, url);
  if (!member) return send(res, 403, { error: "member" });
  const now = Date.now();
  member.lastCommand = member.lastCommand.filter((t) => now - t < 3000);
  if (member.lastCommand.length >= 12) return send(res, 429, { error: "slow down" });
  member.lastCommand.push(now);
  const body = await readJson(req);
  const type = String(body.type || "");
  if (!COMMANDS.has(type)) return send(res, 400, { error: "type" });
  const command = { type, by: member.name, byId: member.id };
  if (type === "play") {
    const trackId = String(body.trackId || "").slice(0, 80);
    if (!trackId) return send(res, 400, { error: "track" });
    command.trackId = trackId;
  }
  if (type === "seek") {
    const position = Number(body.position);
    if (!Number.isFinite(position) || position < 0) return send(res, 400, { error: "position" });
    command.position = position;
  }
  if (type === "mode") {
    if (!MODES.has(body.mode)) return send(res, 400, { error: "mode" });
    command.mode = body.mode;
  }
  const hostOnline = [...room.members.values()].some((m) => m.role === "host" && present(m));
  if (!hostOnline) return send(res, 409, { error: "host away" });
  toHost("command", command);
  send(res, 202, { ok: true });
}

function serveBuffer(req, res, entry, cacheSeconds) {
  const total = entry.buf.length;
  const headers = {
    "Content-Type": entry.type || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": `private, max-age=${cacheSeconds}`,
    "X-Content-Type-Options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : total - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : total - 1;
    start = Math.max(0, start);
    end = Math.min(total - 1, end);
    if (start > end || start >= total) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${total}` });
      return res.end();
    }
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": end - start + 1,
    });
    if (req.method === "HEAD") return res.end();
    return res.end(entry.buf.subarray(start, end + 1));
  }
  res.writeHead(200, { ...headers, "Content-Length": total });
  if (req.method === "HEAD") return res.end();
  res.end(entry.buf);
}

function waitForAudio(trackId, ms) {
  return new Promise((resolve) => {
    let waiters = room.audioWaiters.get(trackId);
    if (!waiters) room.audioWaiters.set(trackId, (waiters = new Set()));
    const done = () => {
      clearTimeout(timer);
      waiters.delete(done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    waiters.add(done);
  });
}

async function handleRoom(req, res, url) {
  const route = url.pathname.replace(/^\/room\//, "");
  const local = isLocal(req);
  const write = req.method === "POST" || req.method === "PUT";
  if (write && !sameOriginWrite(req)) return send(res, 403, { error: "origin" });

  if (route === "time") return send(res, 200, { now: Date.now() });

  if (route === "info" && req.method === "GET") {
    const keyOk = guestAllowed(req, url);
    return send(res, 200, {
      server: "tavern",
      open: room.open,
      local,
      keyOk: room.open && keyOk,
      hostName: room.open && keyOk ? room.hostName : undefined,
      members: room.open && keyOk ? memberList().length : undefined,
      ...(local ? { tunnel: tunnelInfo(), invite: inviteUrl() } : {}),
    });
  }

  if (route === "events" && req.method === "GET") return handleEvents(req, res, url);
  if (route === "poll" && req.method === "GET") return handlePoll(req, res, url);
  if (route === "command" && req.method === "POST") return handleCommand(req, res, url);

  let match = /^audio\/([A-Za-z0-9_.-]{1,80})$/.exec(route);
  if (match && (req.method === "GET" || req.method === "HEAD")) {
    if (!guestAllowed(req, url)) return send(res, 403, { error: "key" });
    const id = match[1];
    if (!room.audio.has(id) && room.open && room.snapshot?.trackId === id)
      await waitForAudio(id, 45_000);
    const entry = room.audio.get(id);
    if (!entry) return send(res, 404, { error: "not ready" });
    return serveBuffer(req, res, entry, 3600);
  }
  match = /^cover\/([A-Za-z0-9_.-]{1,80})$/.exec(route);
  if (match && (req.method === "GET" || req.method === "HEAD")) {
    if (!guestAllowed(req, url)) return send(res, 403, { error: "key" });
    const entry = room.covers.get(match[1]);
    if (!entry) return send(res, 404, { error: "none" });
    return serveBuffer(req, res, entry, 86400);
  }

  // ---- everything below is for the host's own page only
  if (!local) return send(res, 403, { error: "host only" });

  if (route === "open" && req.method === "POST") {
    const body = await readJson(req);
    room.hostName = cleanName(body.name, "房主");
    if (!room.open) {
      room.open = true;
      room.key = crypto.randomBytes(16).toString("base64url");
      room.rev = 0;
      log(`${room.hostName} 开放了同席`);
    }
    if (body.tunnel !== false) void startTunnel();
    return send(res, 200, {
      open: true,
      hostName: room.hostName,
      tunnel: tunnelInfo(),
      invite: inviteUrl(),
    });
  }
  if (route === "tunnel" && req.method === "POST") {
    if (!room.open) return send(res, 410, { error: "closed" });
    stopTunnel();
    void startTunnel();
    return send(res, 202, { ok: true });
  }
  if (route === "close" && req.method === "POST") {
    closeRoom();
    return send(res, 200, { open: false });
  }
  if (!room.open) return send(res, 410, { error: "closed" });

  if (route === "snapshot" && req.method === "POST") {
    const body = await readJson(req);
    const position = Number(body.position);
    room.snapshot = {
      rev: ++room.rev,
      trackId: body.trackId ? String(body.trackId).slice(0, 80) : undefined,
      isPlaying: Boolean(body.isPlaying),
      position: Number.isFinite(position) && position >= 0 ? position : 0,
      duration: Number(body.duration) || 0,
      mode: MODES.has(body.mode) ? body.mode : "sequence",
      by: body.by ? cleanName(body.by, "") : undefined,
      byId: cleanId(body.byId) || undefined,
      reason: typeof body.reason === "string" ? body.reason.slice(0, 20) : undefined,
      at: Date.now(),
    };
    broadcast("snapshot", room.snapshot, (m) => m.role !== "host");
    return send(res, 200, { rev: room.rev, at: room.snapshot.at });
  }
  if (route === "library" && req.method === "POST") {
    const body = await readJson(req);
    if (!Array.isArray(body.tracks) || !Array.isArray(body.playlists))
      return send(res, 400, { error: "library" });
    room.library = {
      tracks: body.tracks.slice(0, 5000),
      playlists: body.playlists.slice(0, 200),
      selectedPlaylistId: String(body.selectedPlaylistId || ""),
      // the host's Spotify app: a public Client ID (never a secret) friends sign in with
      spotifyClientId: /^[0-9a-f]{32}$/i.test(String(body.spotifyClientId || ""))
        ? String(body.spotifyClientId).toLowerCase()
        : undefined,
    };
    broadcast("library", room.library, (m) => m.role !== "host");
    return send(res, 200, { ok: true });
  }
  match = /^audio\/([A-Za-z0-9_.-]{1,80})$/.exec(route);
  if (match && req.method === "PUT") {
    const id = match[1];
    const buf = await readBody(req, MAX_AUDIO);
    if (!buf.length) return send(res, 400, { error: "empty" });
    room.audio.delete(id);
    room.audio.set(id, {
      buf,
      type: String(req.headers["content-type"] || "audio/mpeg").slice(0, 80),
      at: Date.now(),
    });
    while (room.audio.size > KEEP_AUDIO) {
      const oldest = [...room.audio.keys()].find((k) => k !== room.snapshot?.trackId);
      if (!oldest) break;
      room.audio.delete(oldest);
    }
    for (const done of room.audioWaiters.get(id) ?? []) done();
    return send(res, 200, { ok: true, bytes: buf.length });
  }
  if (match && req.method === "GET") {
    return send(res, 200, { has: room.audio.has(match[1]) });
  }
  match = /^cover\/([A-Za-z0-9_.-]{1,80})$/.exec(route);
  if (match && req.method === "PUT") {
    const buf = await readBody(req, MAX_COVER);
    if (buf.length)
      room.covers.set(match[1], {
        buf,
        type: String(req.headers["content-type"] || "image/jpeg").slice(0, 80),
        at: Date.now(),
      });
    return send(res, 200, { ok: true });
  }
  send(res, 404, { error: "unknown" });
}

// ---------------------------------------------------------------------------
// static files (dist/)

const compressed = new Map();

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, "Bad path");
  }
  let file = path.resolve(DIST, `.${pathname}`);
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return send(res, 403, "Forbidden");
  let stat = await fsp.stat(file).catch(() => null);
  if (stat?.isDirectory()) {
    file = path.join(file, "index.html");
    stat = await fsp.stat(file).catch(() => null);
  }
  if (!stat) {
    if (path.extname(pathname)) return send(res, 404, "Not found");
    file = path.join(DIST, "index.html");
    stat = await fsp.stat(file).catch(() => null);
    if (!stat) return send(res, 503, "dist/ 还没有构建：请用「启动酒馆.bat」启动。");
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const hashed = /[\\/]assets[\\/]/.test(file) && /-[A-Za-z0-9_-]{6,}\./.test(path.basename(file));
  const headers = {
    "Content-Type": type,
    "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Last-Modified": stat.mtime.toUTCString(),
  };
  if (!hashed && req.headers["if-modified-since"] === headers["Last-Modified"]) {
    res.writeHead(304, headers);
    return res.end();
  }
  const accept = String(req.headers["accept-encoding"] || "");
  const encoding = COMPRESSIBLE.test(type) && stat.size > 1024
    ? accept.includes("br") ? "br" : accept.includes("gzip") ? "gzip" : ""
    : "";
  if (encoding) {
    const cacheKey = `${file}|${stat.mtimeMs}|${encoding}`;
    let body = compressed.get(cacheKey);
    if (!body) {
      const raw = await fsp.readFile(file);
      body =
        encoding === "br"
          ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
          : zlib.gzipSync(raw, { level: 9 });
      compressed.set(cacheKey, body);
    }
    res.writeHead(200, { ...headers, "Content-Encoding": encoding, Vary: "Accept-Encoding", "Content-Length": body.length });
    return res.end(req.method === "HEAD" ? undefined : body);
  }
  res.writeHead(200, { ...headers, "Content-Length": stat.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// YouTube titles for the host's menu. Browsers can't read YouTube's public
// oEmbed endpoint directly (no CORS), so the host's page asks this server.
// Only this computer's own page may use it (custom header + local check), so
// it can't be used as an open proxy.

const OEMBED = process.env.TAVERN_YT_OEMBED || "https://www.youtube.com/oembed";
const oembedCache = new Map();

async function oembed(target) {
  if (oembedCache.has(target)) return oembedCache.get(target);
  let result;
  try {
    const response = await fetch(`${OEMBED}?format=json&url=${encodeURIComponent(target)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404 || response.status === 400) result = null; // removed / private
    else if (response.status === 401 || response.status === 403)
      result = { title: "", author: "", blocked: true }; // can't be embedded
    else if (response.ok) {
      const body = await response.json();
      result = {
        title: String(body.title || "").slice(0, 200),
        author: String(body.author_name || "").slice(0, 120),
      };
    }
  } catch {
    result = undefined; // offline: leave untitled, try again next time
  }
  if (result !== undefined) {
    if (oembedCache.size > 5000) oembedCache.clear();
    oembedCache.set(target, result);
  }
  return result;
}

async function handleYouTubeMeta(req, res, url) {
  if (!isLocal(req) || req.headers["x-tavern"] !== "1") return send(res, 403, { error: "local only" });
  const ids = [
    ...new Set(
      String(url.searchParams.get("ids") || "")
        .split(",")
        .filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)),
    ),
  ].slice(0, 50);
  const list = url.searchParams.get("list");
  const videos = {};
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, ids.length) }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const meta = await oembed(`https://www.youtube.com/watch?v=${id}`);
        if (meta !== undefined) videos[id] = meta;
      }
    }),
  );
  const body = { videos };
  if (list && /^[A-Za-z0-9_-]{10,64}$/.test(list)) {
    const meta = await oembed(`https://www.youtube.com/playlist?list=${list}`);
    if (meta !== undefined) body.list = meta && { title: meta.title, author: meta.author };
  }
  send(res, 200, body);
}

// Bilibili videos for the host's menu (see server/bilibili.mjs). Local only too.
async function handleBilibiliMeta(req, res, url) {
  if (!isLocal(req) || req.headers["x-tavern"] !== "1") return send(res, 403, { error: "local only" });
  try {
    const result = await readBilibili(url.searchParams.get("link") || "");
    send(res, 200, { ok: true, result });
  } catch (error) {
    if (!(error instanceof BilibiliError)) console.error(error);
    send(res, 200, { ok: false, error: error instanceof BilibiliError ? error.reason : "unknown" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://local");
  try {
    if (url.pathname === "/tavern/youtube-meta" && req.method === "GET")
      await handleYouTubeMeta(req, res, url);
    else if (url.pathname === "/tavern/bilibili-meta" && req.method === "GET")
      await handleBilibiliMeta(req, res, url);
    else if (url.pathname.startsWith("/room/")) await handleRoom(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : "server" });
    else res.destroy();
    if (!error.status) console.error(error);
  }
});
server.keepAliveTimeout = 65_000;
server.requestTimeout = 0;

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n  端口 ${PORT} 已被占用：酒馆可能已经开着了。`);
    process.exit(2);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  const local = `http://127.0.0.1:${PORT}/`;
  log(`酒馆开门：${local}`);
  if (!fs.existsSync(path.join(DIST, "index.html")))
    log("注意：还没有 dist/，请先构建（npm run build）。");
  if (OPEN_BROWSER) {
    const opener =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", local]]
        : process.platform === "darwin"
          ? ["open", [local]]
          : ["xdg-open", [local]];
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true, windowsHide: true }).unref();
  }
});
