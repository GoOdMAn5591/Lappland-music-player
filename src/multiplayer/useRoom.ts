import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isSpotifyTrack,
  isYouTubeTrack,
  type PlaybackMode,
  type TavernPlaylist,
  type TavernTrack,
} from "../storage";
import { spotifyEngine } from "../integrations/spotify/player";
import { isSignedIn, setRoomClientId } from "../integrations/spotify/auth";
import { youtubeEngine } from "../integrations/youtube/player";
import {
  RoomConnection,
  fetchRoomInfo,
  fromRoomTrack,
  hostApi,
  projectedPosition,
  rememberName,
  roomUrl,
  storedName,
  toRoomTrack,
  type IncomingCommand,
  type RoomCommand,
  type RoomLibrary,
  type RoomMember,
  type RoomNotice,
  type RoomSnapshot,
  type TunnelInfo,
} from "./room";
import { t } from "../i18n";
import { launcherName } from "../config";

/** What the room needs from the player (kept in a ref, so always the latest render). */
export interface RoomBridge {
  tracks: TavernTrack[];
  playlists: TavernPlaylist[];
  selectedPlaylistId: string;
  carouselTrackIds: string[];
  currentTrackId?: string;
  isPlaying: boolean;
  playbackMode: PlaybackMode;
  audio: () => HTMLAudioElement | null;
  /** Seconds into the song pouring on this computer (local audio or Spotify). */
  position: () => number;
  /** Is sound actually coming out (Spotify takes a moment to start)? */
  audible: () => boolean;
  /** Host: the Spotify app friends sign in with, once the host is connected. */
  spotifyClientId?: string;
  /** Guest: show where the host's song is (Spotify songs have no relayed audio). */
  showProgress: (position: number, duration: number) => void;
  ensureAudioGraph: () => void;
  say: (text: string) => void;
  // host: carry out what someone at the table asked for
  playTrack: (trackId: string) => void;
  togglePlay: () => void;
  playByOffset: (offset: 1 | -1) => void;
  seek: (position: number) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  // guest: mirror the host's bar
  showHostLibrary: (
    tracks: TavernTrack[],
    playlists: TavernPlaylist[],
    selectedPlaylistId: string,
  ) => void;
  followHost: (
    trackId: string | undefined,
    isPlaying: boolean,
    mode: PlaybackMode,
  ) => void;
}

export type RoomStatus =
  | "checking"
  | "unavailable" // page not served by the tavern server (e.g. npm run dev)
  | "idle" // host: room closed
  | "opening"
  | "open"
  | "invite" // guest: invite link checked, waiting for the name
  | "joining"
  | "joined"
  | "closed" // guest: host closed the room
  | "invalid" // guest: wrong / expired link
  | "unreachable"; // guest: tavern can't be reached

const COMMAND_TEXT: Record<RoomCommand["type"], string> = {
  play: "{who} 点了一杯",
  toggle: "{who} 按了播放 / 暂停",
  next: "{who} 切到下一杯",
  prev: "{who} 换回上一杯",
  seek: "{who} 拖了进度",
  mode: "{who} 换了上酒方式",
};

/** Server notices arrive as Chinese text; phrase them in this page's language. */
function noticeText(notice: RoomNotice) {
  if (notice.kind === "join" && notice.name) return t("{name} 入座了", { name: notice.name });
  if (notice.kind === "leave" && notice.name) return t("{name} 离席了", { name: notice.name });
  return t(notice.text);
}

const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function useRoom(inviteKey: string | undefined, bridge: RoomBridge) {
  const role = inviteKey ? "guest" : "host";
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const [status, setStatus] = useState<RoomStatus>("checking");
  const [hostName, setHostName] = useState("");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [tunnel, setTunnel] = useState<TunnelInfo>();
  const [connection, setConnection] = useState<"connecting" | "open" | "lost">(
    "connecting",
  );
  const [message, setMessage] = useState("");
  const [me, setMe] = useState<RoomMember>();
  const connRef = useRef<RoomConnection>();
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const actorRef = useRef<{ name: string; id: string; reason: string }>();
  const uploaded = useRef(new Set<string>());
  const coversSent = useRef(new Set<string>());
  const [hostReady, setHostReady] = useState(false);

  // ------------------------------------------------------------- first look
  useEffect(() => {
    let alive = true;
    void fetchRoomInfo(inviteKey).then((info) => {
      if (!alive) return;
      if (role === "guest") {
        if (!info) return setStatus("unreachable");
        if (!info.open || !info.keyOk) return setStatus("invalid");
        setHostName(info.hostName ?? "");
        setStatus("invite");
        return;
      }
      if (!info || !info.local) return setStatus("unavailable");
      setTunnel(info.tunnel ? { ...info.tunnel, invite: info.invite } : undefined);
      if (info.open) {
        // this tab was refreshed while the room stayed open
        connectHost(info.hostName || storedName() || t("房主"));
      } else setStatus("idle");
    });
    return () => {
      alive = false;
      connRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------- host
  const connectHost = useCallback((name: string) => {
    connRef.current?.close();
    const conn = new RoomConnection("host", name);
    connRef.current = conn;
    uploaded.current.clear();
    coversSent.current.clear();
    conn
      .on("hello", (data) => {
        setMe(data.you);
        setHostName(data.hostName);
        setMembers(data.members);
        if (data.tunnel) setTunnel(data.tunnel);
        setStatus("open");
        setHostReady(true);
      })
      .on("members", setMembers)
      .on("tunnel", setTunnel)
      .on("notice", (notice) => {
        if (notice.kind === "join" || notice.kind === "leave")
          bridgeRef.current.say(noticeText(notice));
      })
      .on("command", (command) => applyCommand(command))
      .on("replaced", () => {
        conn.close();
        setStatus("idle");
        setHostReady(false);
        setMessage(t("房间已在另一个标签页里打开。"));
      })
      .on("connection", setConnection);
    conn.connect();
    setHostName(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyCommand = (command: IncomingCommand) => {
    const b = bridgeRef.current;
    actorRef.current = { name: command.by, id: command.byId, reason: command.type };
    window.setTimeout(() => {
      if (actorRef.current?.id === command.byId) actorRef.current = undefined;
    }, 1500);
    if (command.type === "play") {
      const track = b.tracks.find((t) => t.id === command.trackId);
      if (track) b.playTrack(track.id);
      b.say(t("{who} 点了《{title}》", { who: command.by, title: track?.alias || track?.title || t("一杯") }));
      return;
    }
    if (command.type === "toggle") b.togglePlay();
    if (command.type === "next") b.playByOffset(1);
    if (command.type === "prev") b.playByOffset(-1);
    if (command.type === "seek") b.seek(command.position);
    if (command.type === "mode") b.setPlaybackMode(command.mode);
    b.say(t(COMMAND_TEXT[command.type], { who: command.by }));
  };

  const open = useCallback(
    async (name: string) => {
      const clean = name.trim().slice(0, 16) || t("房主");
      rememberName(clean);
      setStatus("opening");
      setMessage("");
      try {
        const result = await hostApi.open(clean);
        setTunnel({ ...result.tunnel, invite: result.invite });
        connectHost(clean);
      } catch {
        setStatus("idle");
        setMessage(t("房间没能打开：请确认是用「{launcher}」启动的。", { launcher: launcherName }));
      }
    },
    [connectHost],
  );

  const close = useCallback(async () => {
    connRef.current?.close();
    connRef.current = undefined;
    setHostReady(false);
    setMembers([]);
    await hostApi.close().catch(() => {});
    setTunnel(undefined);
    setStatus("idle");
  }, []);

  const retryTunnel = useCallback(() => void hostApi.retryTunnel(), []);

  const publish = useCallback((reason: string) => {
    const conn = connRef.current;
    const b = bridgeRef.current;
    if (!conn || conn.role !== "host") return;
    const audio = b.audio();
    const track = b.tracks.find((t) => t.id === b.currentTrackId);
    const actor = actorRef.current;
    const spotify = isSpotifyTrack(track);
    void conn
      .post("snapshot", {
        trackId: track?.status === "ready" ? track.id : undefined,
        // a Spotify song counts as playing once it really started on the host
        isPlaying: b.isPlaying && Boolean(track) && b.audible(),
        position: b.position(),
        duration: spotify
          ? spotifyEngine.durationMs / 1000 || track!.duration
          : isYouTubeTrack(track)
            ? youtubeEngine.durationS || track!.duration
            : audio && Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : (track?.duration ?? 0),
        mode: b.playbackMode,
        by: actor?.name ?? connRef.current?.name,
        byId: actor?.id ?? connRef.current?.id,
        reason: actor?.reason ?? reason,
      })
      .catch(() => {});
  }, []);

  const uploadAudio = useCallback(async (trackId: string | undefined) => {
    const conn = connRef.current;
    const track = bridgeRef.current.tracks.find((t) => t.id === trackId);
    if (!conn || !track?.objectUrl || uploaded.current.has(track.id)) return;
    uploaded.current.add(track.id);
    try {
      const blob = await fetch(track.objectUrl).then((r) => r.blob());
      await conn.post(`audio/${encodeURIComponent(track.id)}`, blob, {
        method: "PUT",
        headers: { "content-type": blob.type || track.mimeType || "audio/mpeg" },
      });
    } catch {
      uploaded.current.delete(track.id);
    }
  }, []);

  // library → guests (debounced), covers in the background
  const { tracks, playlists, selectedPlaylistId, currentTrackId, isPlaying, playbackMode } =
    bridge;
  useEffect(() => {
    if (role !== "host" || !hostReady) return;
    const timer = window.setTimeout(async () => {
      const conn = connRef.current;
      if (!conn) return;
      await conn
        .post("library", {
          tracks: tracks.map(toRoomTrack),
          playlists,
          selectedPlaylistId,
          spotifyClientId: bridgeRef.current.spotifyClientId,
        })
        .catch(() => {});
      for (const track of tracks) {
        // Spotify artwork stays on Spotify's servers; guests load it from there
        if (!track.coverUrl || isSpotifyTrack(track) || coversSent.current.has(track.id)) continue;
        coversSent.current.add(track.id);
        try {
          const blob = await fetch(track.coverUrl).then((r) => r.blob());
          await conn.post(`cover/${encodeURIComponent(track.id)}`, blob, {
            method: "PUT",
            headers: { "content-type": blob.type || "image/jpeg" },
          });
        } catch {
          coversSent.current.delete(track.id);
        }
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [role, hostReady, tracks, playlists, selectedPlaylistId, bridge.spotifyClientId]);

  // the song on the counter goes up first, then the next glass in line
  useEffect(() => {
    if (role !== "host" || !hostReady || !currentTrackId) return;
    let cancelled = false;
    void (async () => {
      await uploadAudio(currentTrackId);
      if (cancelled) return;
      const order = bridgeRef.current.carouselTrackIds;
      const next = order[(order.indexOf(currentTrackId) + 1) % order.length];
      if (next && next !== currentTrackId) await uploadAudio(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [role, hostReady, currentTrackId, uploadAudio]);

  // playback → guests
  useEffect(() => {
    if (role !== "host" || !hostReady) return;
    const timer = window.setTimeout(() => publish("change"), 120);
    return () => window.clearTimeout(timer);
  }, [role, hostReady, currentTrackId, isPlaying, playbackMode, publish]);

  useEffect(() => {
    if (role !== "host" || !hostReady) return;
    const audio = bridgeRef.current.audio();
    const onSeeked = () => publish("seek");
    const onPlaying = () => publish("tick");
    audio?.addEventListener("seeked", onSeeked);
    audio?.addEventListener("playing", onPlaying);
    const heartbeat = window.setInterval(() => {
      if (bridgeRef.current.isPlaying) publish("tick");
    }, 4000);
    // the host's Spotify really started / jumped: tell everyone where it is
    const offs = [
      spotifyEngine.on("started", () => publish("tick")),
      spotifyEngine.on("seeked", () => publish("seek")),
      youtubeEngine.on("started", () => publish("tick")),
      youtubeEngine.on("seeked", () => publish("seek")),
    ];
    return () => {
      audio?.removeEventListener("seeked", onSeeked);
      audio?.removeEventListener("playing", onPlaying);
      window.clearInterval(heartbeat);
      offs.forEach((off) => off());
    };
  }, [role, hostReady, publish]);

  // ------------------------------------------------------------------ guest
  /** How long a jump takes to be playable on this connection (s), learned from 'seeked'. */
  const seekLead = useRef(0.15);
  const joinTimer = useRef<number>();
  const lastSeek = useRef(0);
  const seekStart = useRef<number | null>(null);

  /** Learned on this connection: how long Spotify takes to start / to jump (s). */
  const spotifySync = useRef({ lead: 0.8, seekLead: 0.35, lastStart: 0, lastSeek: 0, checkAt: 0 });

  /**
   * A Spotify song plays from this friend's own account; line it up with the
   * host's position (Spotify has no playback-rate control, so jump when off).
   */
  const syncSpotify = (conn: RoomConnection, snap: RoomSnapshot, track: TavernTrack) => {
    const engine = spotifyEngine;
    const s = spotifySync.current;
    const uri = track.spotifyUri ?? "";
    const target = projectedPosition(snap, conn.now());
    bridgeRef.current.showProgress(target, snap.duration || track.duration);
    if (!uri || !isSignedIn() || engine.status === "error" || engine.held) return;
    const now = performance.now();
    if (!snap.isPlaying) {
      if (engine.isOn(uri) && (engine.playing || engine.starting)) void engine.pause();
      return;
    }
    if (!engine.isOn(uri) || engine.finished) {
      if (now - s.lastStart < 3000) return;
      if (snap.duration > 0 && target > snap.duration - 1.5) return; // about to end: wait for the next one
      s.lastStart = now;
      // asked at the last moment: loading Spotify's player the first time takes a while
      void engine.play(uri, () => {
        const snapNow = snapshotRef.current;
        const live = snapNow && snapNow.trackId === snap.trackId ? snapNow : snap;
        return (projectedPosition(live, conn.now()) + spotifySync.current.lead) * 1000;
      });
      return;
    }
    if (engine.starting) return;
    if (!engine.playing) {
      if (now - s.lastStart < 3000) return;
      s.lastStart = now;
      void engine.resume();
      return;
    }
    const drift = engine.position() - target;
    if (s.checkAt && now > s.checkAt) {
      // how did the last jump land? learn from it
      s.checkAt = 0;
      if (Math.abs(drift) < 3) s.seekLead = Math.max(0, Math.min(2, s.seekLead - drift * 0.6));
    }
    if (Math.abs(drift) > 0.6 && now - s.lastSeek > 3500) {
      s.lastSeek = now;
      s.checkAt = now + 1800;
      void engine.seek(target + s.seekLead);
    }
  };

  /** Learned on this connection: how long YouTube takes to start / to jump (s). */
  const youtubeSync = useRef({ lead: 0.6, seekLead: 0.2, lastStart: 0, lastSeek: 0, checkAt: 0, rev: -1 });

  /** A YouTube video plays in this friend's own screen; line it up with the host. */
  const syncYouTube = (conn: RoomConnection, snap: RoomSnapshot, track: TavernTrack) => {
    const engine = youtubeEngine;
    const s = youtubeSync.current;
    const id = track.youtubeId ?? "";
    const target = projectedPosition(snap, conn.now());
    bridgeRef.current.showProgress(target, snap.duration || track.duration);
    if (!id || engine.status === "error" || track.status !== "ready") return;
    if (engine.isOn(id)) engine.poll(); // notice a jump on YouTube's own seek bar first
    const now = performance.now();
    // this friend just used YouTube's own controls: the request is on its way to
    // the host, so don't pull the video back before the host's answer arrives
    if (now - engine.userAt < 2500 && snap.at < conn.now() - (now - engine.userAt)) return;
    const fresh = snap.rev !== s.rev;
    s.rev = snap.rev;
    if (!snap.isPlaying) {
      if (engine.isOn(id) && (engine.playing || engine.starting)) engine.pause();
      return;
    }
    if (!engine.isOn(id) || engine.finished) {
      if (now - s.lastStart < 3000) return;
      if (snap.duration > 0 && target > snap.duration - 1.5) return;
      s.lastStart = now;
      void engine.play(id, () => {
        const snapNow = snapshotRef.current;
        const live = snapNow && snapNow.trackId === snap.trackId ? snapNow : snap;
        return projectedPosition(live, conn.now()) + youtubeSync.current.lead;
      });
      return;
    }
    if (engine.starting) return;
    if (!engine.playing) {
      if (now - s.lastStart < 3000) return;
      s.lastStart = now;
      engine.resume();
      return;
    }
    const drift = engine.position() - target;
    if (s.checkAt && now > s.checkAt) {
      s.checkAt = 0;
      if (Math.abs(drift) < 3) s.seekLead = Math.max(0, Math.min(2, s.seekLead - drift * 0.6));
    }
    // a new word from the host (someone jumped) may move us at once
    if (Math.abs(drift) > 0.5 && (now - s.lastSeek > 3000 || (fresh && Math.abs(drift) > 2))) {
      s.lastSeek = now;
      s.checkAt = now + 1500;
      engine.seek(target + s.seekLead);
    }
  };

  const syncAudio = useCallback(() => {
    const conn = connRef.current;
    const snap = snapshotRef.current;
    const audio = bridgeRef.current.audio();
    if (!conn || !snap?.trackId) return;
    const track = bridgeRef.current.tracks.find((t) => t.id === snap.trackId);
    if (isSpotifyTrack(track)) {
      syncSpotify(conn, snap, track!);
      return;
    }
    if (isYouTubeTrack(track)) {
      syncYouTube(conn, snap, track!);
      return;
    }
    if (!audio) return;
    if (!audio.src.includes(`/audio/${encodeURIComponent(snap.trackId)}`)) return;
    if (audio.readyState < 1 || audio.seeking) return;
    const target = projectedPosition(snap, conn.now());
    const drift = audio.currentTime - target;
    const now = performance.now();
    if (!snap.isPlaying) {
      audio.playbackRate = 1;
      if (Math.abs(drift) > 0.25) audio.currentTime = target;
      return;
    }
    if (Math.abs(drift) > 0.5) {
      if (now - lastSeek.current < 1500) return;
      lastSeek.current = now;
      seekStart.current = now;
      audio.playbackRate = 1;
      audio.currentTime = Math.max(0, target + seekLead.current);
      return;
    }
    // small drift: nudge the speed (pitch is preserved) until we line up again
    audio.playbackRate =
      Math.abs(drift) < 0.03 ? 1 : Math.max(0.92, Math.min(1.08, 1 - drift * 0.8));
  }, []);

  useEffect(() => {
    if (role !== "guest" || status !== "joined") return;
    const timer = window.setInterval(syncAudio, 400);
    const offStarted = spotifyEngine.on("started", ({ latency }) => {
      if (latency === undefined || latency > 8) return;
      const s = spotifySync.current;
      s.lead = Math.max(0.2, Math.min(3, s.lead * 0.5 + latency * 0.5));
      window.setTimeout(syncAudio, 600);
    });
    const offYouTube = youtubeEngine.on("started", ({ latency }) => {
      // a long wait is an ad, not the connection: don't learn from it
      if (latency === undefined || latency > 5) return;
      const s = youtubeSync.current;
      s.lead = Math.max(0.1, Math.min(3, s.lead * 0.5 + latency * 0.5));
      window.setTimeout(syncAudio, 600);
    });
    const audio = bridgeRef.current.audio();
    const onSeeked = () => {
      if (seekStart.current === null) return;
      const took = (performance.now() - seekStart.current) / 1000;
      seekStart.current = null;
      seekLead.current = Math.max(0.05, Math.min(2.5, seekLead.current * 0.4 + took * 0.6));
    };
    audio?.addEventListener("loadedmetadata", syncAudio);
    audio?.addEventListener("canplay", syncAudio);
    audio?.addEventListener("seeked", onSeeked);
    return () => {
      window.clearInterval(timer);
      offStarted();
      offYouTube();
      audio?.removeEventListener("loadedmetadata", syncAudio);
      audio?.removeEventListener("canplay", syncAudio);
      audio?.removeEventListener("seeked", onSeeked);
      if (audio) audio.playbackRate = 1;
    };
  }, [role, status, syncAudio]);

  const applyLibrary = (library: RoomLibrary | null) => {
    if (!library || !inviteKey) return;
    setRoomClientId(library.spotifyClientId);
    bridgeRef.current.showHostLibrary(
      library.tracks.map((track) => fromRoomTrack(track, inviteKey)),
      library.playlists,
      library.selectedPlaylistId,
    );
  };

  const applySnapshot = (snapshot: RoomSnapshot | null, myId: string) => {
    if (!snapshot) return;
    const previous = snapshotRef.current;
    snapshotRef.current = snapshot;
    bridgeRef.current.followHost(snapshot.trackId, snapshot.isPlaying, snapshot.mode);
    window.setTimeout(syncAudio, 30);
    if (!previous || !snapshot.by || snapshot.byId === myId) return;
    const track = bridgeRef.current.tracks.find((t) => t.id === snapshot.trackId);
    const title = track?.alias || track?.title;
    if (snapshot.trackId !== previous.trackId && title)
      bridgeRef.current.say(t("{who} 端上了《{title}》", { who: snapshot.by, title }));
    else if (snapshot.isPlaying !== previous.isPlaying)
      bridgeRef.current.say(
        t(snapshot.isPlaying ? "{who} 继续播放" : "{who} 暂停了", { who: snapshot.by }),
      );
    else if (snapshot.reason === "seek")
      bridgeRef.current.say(t("{who} 调了进度", { who: snapshot.by }));
  };

  const join = useCallback(
    (name: string) => {
      if (!inviteKey) return;
      const clean = name.trim().slice(0, 16) || t("客人");
      rememberName(clean);
      // this click is the gesture that lets the browser play sound later
      const b = bridgeRef.current;
      b.ensureAudioGraph();
      const audio = b.audio();
      if (audio && !audio.getAttribute("src")) {
        audio.src = SILENCE;
        void audio.play().catch(() => {});
      }
      setStatus("joining");
      setMessage("");
      const conn = new RoomConnection("guest", clean, inviteKey);
      connRef.current = conn;
      // never leave the guest staring at a spinner
      window.clearTimeout(joinTimer.current);
      joinTimer.current = window.setTimeout(() => {
        if (connRef.current !== conn) return;
        conn.close();
        setStatus((current) => (current === "joining" ? "unreachable" : current));
      }, 25_000);
      conn
        .on("hello", (data) => {
          window.clearTimeout(joinTimer.current);
          setMe(data.you);
          setHostName(data.hostName);
          setMembers(data.members);
          setStatus("joined");
          applyLibrary(data.library);
          applySnapshot(data.snapshot, data.you.id);
          bridgeRef.current.say(t("已入座 {host} 的酒馆", { host: data.hostName }));
        })
        .on("members", setMembers)
        .on("library", (library) => applyLibrary(library))
        .on("snapshot", (snapshot) => applySnapshot(snapshot, conn.id))
        .on("notice", (notice) => bridgeRef.current.say(noticeText(notice)))
        .on("closed", ({ reason }) => {
          conn.close();
          snapshotRef.current = null;
          bridgeRef.current.followHost(undefined, false, bridgeRef.current.playbackMode);
          setStatus("closed");
          setMessage(t(reason));
          bridgeRef.current.say(t(reason));
        })
        .on("connection", (state) => {
          setConnection(state);
          if (state === "lost") {
            // the server rejected us (room gone or key changed): ask once more
            void fetchRoomInfo(inviteKey).then((info) => {
              if (!info?.open || !info.keyOk) {
                setStatus("closed");
                setMessage(t("房间已经关闭了。"));
              } else window.setTimeout(() => conn.connect(), 2000);
            });
          }
        });
      conn.connect();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inviteKey, syncAudio],
  );

  const leave = useCallback(() => {
    connRef.current?.close();
    connRef.current = undefined;
    snapshotRef.current = null;
    bridgeRef.current.followHost(undefined, false, bridgeRef.current.playbackMode);
    setMembers([]);
    setStatus("invite");
  }, []);

  const send = useCallback((command: RoomCommand) => {
    const conn = connRef.current;
    if (!conn || conn.role !== "guest") return;
    bridgeRef.current.ensureAudioGraph();
    conn.command(command).catch((error: Error) => {
      bridgeRef.current.say(
        /409/.test(error.message)
          ? t("房主暂时不在，稍后再试。")
          : /429/.test(error.message)
            ? t("手速太快啦，慢一点。")
            : t("这条指令没送到，网络好像不太稳。"),
      );
    });
  }, []);

  const inRoom =
    (role === "host" && status === "open") ||
    (role === "guest" && status === "joined");

  return useMemo(
    () => ({
      role,
      status,
      inRoom,
      isGuest: role === "guest",
      hostName,
      members,
      me,
      tunnel,
      connection,
      message,
      defaultName: storedName(),
      open,
      close,
      retryTunnel,
      join,
      leave,
      send,
      coverUrl: (id: string) =>
        inviteKey ? roomUrl(`cover/${encodeURIComponent(id)}?key=${inviteKey}`) : "",
    }),
    [
      role,
      status,
      inRoom,
      hostName,
      members,
      me,
      tunnel,
      connection,
      message,
      open,
      close,
      retryTunnel,
      join,
      leave,
      send,
      inviteKey,
    ],
  );
}

export type RoomApi = ReturnType<typeof useRoom>;
