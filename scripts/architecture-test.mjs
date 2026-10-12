import { expect } from "@playwright/test";
import { launchBrowser } from "./browser.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const url = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
});
await context.addInitScript(() =>
  localStorage.setItem("tavern-skip-entrance", "true"),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
try {
  await page.goto(url, { waitUntil: "networkidle" });
  const contracts = await page.evaluate(async () => {
    const { createPlayerStore } = await import("/src/player/store.ts");
    const { LocalAudioSource } =
      await import("/src/player/LocalAudioSource.ts");
    const { SpotifyAudioSource } =
      await import("/src/player/SpotifyAudioSource.ts");
    const { createPkceRequest, validatePkceCallback } =
      await import("/src/integrations/spotify/pkce.ts");
    const { projectedPosition, fromRoomTrack, toRoomTrack } =
      await import("/src/multiplayer/room.ts");
    const { toTavernTrack, parsePlaylistId } =
      await import("/src/integrations/spotify/api.ts");
    const { persistablePlaylists } = await import("/src/storage/index.ts");
    const results = {};
    const store = createPlayerStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.patch({
      currentTrack: "test",
      queue: ["test"],
      sourceType: "local",
      isPlaying: true,
      position: 1,
    });
    const snapshot = store.getSnapshot();
    store.patch({ position: 1 });
    unsubscribe();
    store.patch({ position: 2 });
    results.store =
      calls === 1 &&
      snapshot.position === 1 &&
      store.getSnapshot().position === 2;
    const audio = document.createElement("audio");
    const local = new LocalAudioSource(() => audio);
    await local.setVolume(4);
    results.localVolume = audio.volume === 1;
    try {
      await local.load({
        sourceType: "spotify",
        uri: "spotify:track:1234567890123456789012",
      });
    } catch {
      results.localGuard = true;
    }
    try {
      await local.load({ objectUrl: "https://example.com/audio.mp3" });
    } catch {
      results.remoteGuard = true;
    }
    await local.load({ objectUrl: `${location.origin}/room/audio/drink-1?key=k` });
    results.roomAudio = audio.src.endsWith("/room/audio/drink-1?key=k");
    const spotify = new SpotifyAudioSource();
    try {
      await spotify.play();
    } catch {
      results.unconnected =
        !spotify.capabilities.playback &&
        !spotify.capabilities.analysis &&
        !spotify.capabilities.persistentAudio;
    }
    let milliseconds = 0;
    const injected = new SpotifyAudioSource({
      startTrack: async () => {},
      resume: async () => {},
      pause: async () => {},
      seek: async (value) => {
        milliseconds = value;
      },
      setVolume: async () => {},
      disconnect: () => {},
    });
    await injected.seek(4.5);
    results.spotifyUnits = milliseconds === 4500;
    try {
      await injected.load({ uri: "https://example.com/audio" });
    } catch {
      results.uriGuard = true;
    }
    const request = await createPkceRequest(
      "public-test-client",
      "http://127.0.0.1:5173/",
      ["streaming"],
    );
    const auth = new URL(request.url);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(request.transaction.verifier),
    );
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    results.pkce =
      auth.searchParams.get("code_challenge") === challenge &&
      auth.searchParams.get("code_challenge_method") === "S256" &&
      !auth.searchParams.has("client_secret");
    const callback = `http://127.0.0.1:5173/?code=example&state=${request.transaction.state}`;
    results.callback =
      validatePkceCallback(callback, request.transaction).code === "example";
    try {
      validatePkceCallback(
        callback.replace(request.transaction.state, "invalid"),
        request.transaction,
      );
    } catch {
      results.stateGuard = true;
    }
    try {
      validatePkceCallback(callback, {
        ...request.transaction,
        createdAt: Date.now() - 700000,
      });
    } catch {
      results.expiryGuard = true;
    }
    try {
      await createPkceRequest("test", "http://localhost:5173/", []);
    } catch {
      results.redirectGuard = true;
    }
    const shared = toRoomTrack({
      id: "drink-1",
      fingerprint: "secret.mp3:1:2",
      fileName: "C:/Users/me/secret.mp3",
      fileSize: 1,
      lastModified: 2,
      mimeType: "audio/mpeg",
      title: "Song",
      alias: "",
      artist: "A",
      album: "B",
      duration: 10,
      tags: [],
      addedAt: 0,
      status: "ready",
      objectUrl: "blob:x",
    });
    results.noFileNames = !JSON.stringify(shared).includes("secret");
    results.guestTrack =
      fromRoomTrack(shared, "k").objectUrl ===
      `${location.origin}/room/audio/drink-1?key=k`;
    results.projection =
      projectedPosition(
        { position: 8, duration: 10, isPlaying: true, at: 1000 },
        6000,
      ) === 10;
    // Spotify: songs are URIs + metadata only; never relayed, stored or rehosted
    const apiTrack = {
      id: "4uLU6hMCjMI75M1A2tKUQC",
      uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
      type: "track",
      name: "Song",
      duration_ms: 200000,
      artists: [{ name: "A" }],
      album: { name: "B", images: [{ url: "https://i.scdn.co/image/x", width: 300 }] },
    };
    const spotifyTrack = toTavernTrack(apiTrack);
    results.spotifyTrack =
      spotifyTrack?.source === "spotify" &&
      !spotifyTrack.objectUrl &&
      toTavernTrack({ ...apiTrack, is_local: true }) === undefined;
    const roomSpotify = toRoomTrack(spotifyTrack);
    const guestSpotify = fromRoomTrack(
      { ...roomSpotify, spotify: { ...roomSpotify.spotify, cover: "https://evil.example/x.png" } },
      "k",
    );
    results.spotifyNoRelay =
      roomSpotify.spotify.uri === apiTrack.uri &&
      !roomSpotify.hasCover &&
      !guestSpotify.objectUrl &&
      guestSpotify.coverUrl === undefined &&
      guestSpotify.spotifyUri === apiTrack.uri;
    results.spotifyLinksOnly =
      persistablePlaylists([
        {
          id: "p",
          name: "P",
          mood: "",
          trackIds: ["spotify-4uLU6hMCjMI75M1A2tKUQC"],
          spotify: { id: "37i9dQZF1DXcBWIGoYBM5M", url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" },
        },
      ])[0].trackIds.length === 0 &&
      parsePlaylistId("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc") ===
        "37i9dQZF1DXcBWIGoYBM5M";
    return results;
  });
  for (const [name, result] of Object.entries(contracts))
    assert(result, `Contract failed: ${name}`);
  assert(
    Object.keys(contracts).length === 19,
    `Missing contract assertion: ${JSON.stringify(contracts)}`,
  );
  await page.getByRole("button", { name: "更多选项", exact: true }).click();
  await page.getByRole("menuitem", { name: /Spotify 酒单/ }).click();
  // no Client ID yet: the panel walks through creating the Spotify app
  await expect(page.getByRole("dialog")).toContainText("建一个自己的 Spotify 应用");
  await expect(page.getByRole("dialog")).toContainText("Client secret");
  await expect(page.locator('dialog input[aria-label="Redirect URI"]')).toHaveValue(
    "http://127.0.0.1:5173/callback",
  );
  await page.getByRole("button", { name: "关闭Spotify 酒单" }).click();
  await page.getByRole("button", { name: "更多选项", exact: true }).click();
  await page.getByRole("menuitem", { name: /同席 · 一起听/ }).click();
  // the Vite dev server can't host a room; the panel says how to start one
  await expect(page.getByRole("dialog")).toContainText("启动酒馆.bat");
  await page.getByRole("button", { name: "关闭同席 · 一起听" }).click();

  const rate = 8000,
    count = rate * 90,
    wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i / rate) * 220 * Math.PI * 2) * 2000),
      44 + i * 2,
    );
  await page.locator('input[type=file][accept^="audio/"]').setInputFiles([
    { name: "architecture-one.wav", mimeType: "audio/wav", buffer: wav },
    { name: "architecture-two.wav", mimeType: "audio/wav", buffer: wav },
  ]);
  await expect(page.locator(".drink-row")).toHaveCount(2);
  await page.locator(".glass-hotspot.is-current").click();
  await expect(page.locator(".play-medallion")).toHaveAttribute(
    "aria-label",
    "暂停",
  );
  const selected = await page
    .locator(".glass-hotspot.is-current")
    .getAttribute("data-track-id");
  await page
    .getByRole("button", { name: "本地酒窖与入场设置", exact: true })
    .click();
  await page
    .getByRole("button", { name: "删除 architecture-one", exact: true })
    .click();
  await page.getByRole("button", { name: "取消删除", exact: true }).click();
  await expect(page.locator(".cellar-inventory li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "删除 architecture-one", exact: true })
    .click();
  await page
    .getByRole("button", { name: "确认删除 architecture-one", exact: true })
    .click();
  await expect(page.locator(".cellar-inventory li")).toHaveCount(1);
  await page.getByRole("button", { name: "关闭酒窖管理", exact: true }).click();
  await expect(page.locator(".play-medallion")).toHaveAttribute(
    "aria-label",
    "播放",
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".drink-row")).toHaveCount(1);
  const persisted = await page.evaluate(async (id) => {
    const { loadLibrary, inspectStorage } =
      await import("/src/storage/index.ts");
    const library = await loadLibrary();
    return {
      files: (await inspectStorage()).files,
      removed:
        !library.tracks.some((t) => t.id === id) &&
        library.playlists.every((p) => !p.trackIds.includes(id)),
    };
  }, selected);
  assert(
    persisted.files === 1 && persisted.removed,
    "Deleted track or Blob returned after reload",
  );
  await fs.mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: path.resolve("test-results/project-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "更多选项", exact: true }).click();
  await page.getByRole("menuitem", { name: /Spotify 酒单/ }).click();
  const dialogBounds = await page.getByRole("dialog").boundingBox();
  assert(
    dialogBounds.x >= 0 && dialogBounds.x + dialogBounds.width <= 390,
    "Mobile dialog overflow",
  );
  await page.screenshot({
    path: path.resolve("test-results/spotify-mobile.png"),
  });
  assert(!errors.length, errors.join("\n"));
  console.log(
    "Architecture, Spotify contracts, panels, per-song transaction and reload checks passed.",
  );
} finally {
  await browser.close();
}
