import { useLocalVisualizer } from "../player/useLocalVisualizer";
import { Repeat, Repeat1, Shuffle } from "lucide-react";
import { parseBlob } from "music-metadata";
import type { DragEvent, PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playerStore, usePlayerStore } from "../player/store";
import { LocalAudioSource } from "../player/LocalAudioSource";
import {
  buildTags,
  fileFingerprint,
  isSupportedAudio,
  makeId,
  probeAudio,
  stripExtension,
} from "../app/drinks";
import { usePortrait } from "../character/portrait";
import { inviteKeyFromLocation, type RoomCommand } from "../multiplayer/room";
import { useRoom } from "../multiplayer/useRoom";
import {
  ringDoorbell,
  skipEntrancePreference,
  type EntrancePhase,
} from "../entrance/TavernEntrance";
import {
  clearLibrary,
  deleteStoredTrack,
  createDefaultLibrary,
  inspectStorage,
  isSpotifyTrack,
  loadLibrary,
  parseLibraryConfig,
  persistablePlaylists,
  releaseTrack,
  requestPersistence,
  reviveTrack,
  saveLibrary,
  storeAudio,
  toPersistedTrack,
  type PlaybackMode,
  type TavernLibrary,
  type TavernPlaylist,
  type TavernTrack,
} from "../storage";
import { t } from "../i18n";
import { spotifyProblemText, useSpotify } from "../integrations/spotify/session";
import { spotifyEngine } from "../integrations/spotify/player";
import {
  fetchLinkedTracks,
  SpotifyApiError,
  type SpotifyPlaylistInfo,
} from "../integrations/spotify/api";
export function useTavernController() {
  // Opened from a friend's invite link: this page mirrors their bar.
  const [inviteKey] = useState(inviteKeyFromLocation);
  const isGuest = Boolean(inviteKey);
  const roomSendRef = useRef<(command: RoomCommand) => void>(() => {});
  const [tracks, setTracks] = useState<TavernTrack[]>([]);
  /** Songs of linked Spotify playlists: fetched each session, never saved. */
  const [spotifyTracks, setSpotifyTracks] = useState<TavernTrack[]>([]);
  /** Bumped when a whole menu is replaced, so linked Spotify pages fetch again. */
  const [spotifyEpoch, setSpotifyEpoch] = useState(0);
  const [playlists, setPlaylists] = useState<TavernPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("today-menu");
  const {
    currentTrackId,
    setCurrentTrackId,
    playbackMode,
    setPlaybackMode,
    volume,
    setVolume,
    isPlaying,
    setIsPlaying,
    progress,
    setProgress,
    duration,
    setDuration,
    sourceType,
  } = usePlayerStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusLine, setStatusLine] = useState(
    t("把本地音频拖到吧台上，今晚第一杯就会滑到你面前。"),
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [editingTrackId, setEditingTrackId] = useState<string>();
  const [draggedTrackId, setDraggedTrackId] = useState<string>();
  const [dropTargetId, setDropTargetId] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<
    "next" | "prev" | "pick"
  >("pick");
  const [characterSettingsOpen, setCharacterSettingsOpen] = useState(false);
  const [librarySettingsOpen, setLibrarySettingsOpen] = useState(false);
  const [spotifyPanelOpen, setSpotifyPanelOpen] = useState(false);
  const [multiplayerPanelOpen, setMultiplayerPanelOpen] = useState(false);
  const [libraryBytes, setLibraryBytes] = useState(0);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [entrancePhase, setEntrancePhase] = useState<EntrancePhase>(() =>
    isGuest || skipEntrancePreference() ? "entered" : "closed",
  );
  const attentionRef = useRef(-10000);
  const libraryBusyRef = useRef(false);
  const saveTimer = useRef<number>();
  const portrait = usePortrait();
  const pointerRef = useRef({ x: 0, y: 0 });
  const stageRef = useRef<HTMLElement>(null);
  const {
    audioRef,
    appRef,
    analyserRef,
    audioContextRef,
    gainRef,
    ensureAudioGraph,
  } = useLocalVisualizer(isPlaying);
  const localSource = useMemo(
    () => new LocalAudioSource(() => audioRef.current),
    [],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<TavernTrack[]>([]);
  const libraryRef = useRef<TavernLibrary>(createDefaultLibrary());
  libraryRef.current = {
    version: 1,
    selectedPlaylistId,
    currentTrackId,
    playbackMode,
    volume,
    tracks: tracks.map(toPersistedTrack),
    // the live pages (Spotify ones keep their songs); saveLibrary strips them
    playlists,
  };

  useEffect(() => {
    if (isGuest) {
      // a guest's own cellar stays untouched; the host's menu arrives over the room
      setPlaylists([]);
      setLoaded(true);
      setStatusLine(t("正在连接朋友的酒馆……"));
      return;
    }
    let alive = true;
    loadLibrary()
      .then(async (library) => {
        const restored = await Promise.all(library.tracks.map(reviveTrack));
        if (!alive) {
          restored.forEach(releaseTrack);
          return;
        }
        setTracks(restored);
        setPlaylists(
          library.playlists.length
            ? library.playlists
            : createDefaultLibrary().playlists,
        );
        setSelectedPlaylistId(library.selectedPlaylistId || "today-menu");
        setCurrentTrackId(library.currentTrackId);
        setPlaybackMode(library.playbackMode || "sequence");
        setVolume(library.volume ?? 0.76);
        setLoaded(true);
        if (restored.length)
          setStatusLine(
            t("酒窖已恢复 {ok} 首；{missing} 首需要重新导入音频。", {
              ok: restored.filter((track) => track.stored).length,
              missing: restored.filter((track) => !track.stored).length,
            }),
          );
      })
      .catch(() => {
        const library = createDefaultLibrary();
        if (!alive) return;
        setTracks([]);
        setPlaylists(library.playlists);
        setSelectedPlaylistId(library.selectedPlaylistId);
        setLoaded(true);
        setStatusLine(
          t("浏览器本地存储暂不可用。音频仍可在本次会话播放，请保留原文件并导出菜单。"),
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || isGuest) return;
    const library: TavernLibrary = {
      version: 1,
      selectedPlaylistId,
      currentTrackId,
      playbackMode,
      volume,
      tracks: tracks.map(toPersistedTrack),
      playlists: persistablePlaylists(playlists),
    };
    saveTimer.current = window.setTimeout(() => {
      saveLibrary(library).catch(() => {
        setStatusLine(t("菜单保存失败，可能是浏览器储存空间已满。"));
      });
    }, 250);
    return () => window.clearTimeout(saveTimer.current);
  }, [
    currentTrackId,
    loaded,
    playbackMode,
    playlists,
    selectedPlaylistId,
    tracks,
    volume,
  ]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    if (isGuest) return;
    let alive = true;
    void inspectStorage().then((info) => {
      if (alive) setLibraryBytes(info.bytes);
    });
    return () => {
      alive = false;
    };
  }, [tracks.length, libraryBusy]);

  useEffect(() => {
    if (appRef.current) appRef.current.inert = entrancePhase !== "entered";
  }, [entrancePhase]);

  useEffect(
    () => () => {
      tracksRef.current.forEach(releaseTrack);
    },
    [],
  );

  const allTracks = useMemo(
    () => (spotifyTracks.length ? [...tracks, ...spotifyTracks] : tracks),
    [tracks, spotifyTracks],
  );
  const trackMap = useMemo(
    () => new Map(allTracks.map((track) => [track.id, track])),
    [allTracks],
  );
  const spotify = useSpotify();
  const spotifyReady = spotify.account.status === "ok";
  /** Can this tab start the song? (A guest asks the host instead.) */
  const isPlayable = useCallback(
    (track?: TavernTrack) =>
      Boolean(
        track &&
          track.status === "ready" &&
          (isSpotifyTrack(track) ? spotifyReady && track.spotifyUri : track.objectUrl),
      ),
    [spotifyReady],
  );

  const selectedPlaylist = useMemo(
    () =>
      playlists.find((playlist) => playlist.id === selectedPlaylistId) ??
      playlists[0],
    [playlists, selectedPlaylistId],
  );

  const currentTrack = currentTrackId
    ? trackMap.get(currentTrackId)
    : undefined;
  const editingTrack = editingTrackId
    ? trackMap.get(editingTrackId)
    : undefined;
  const readyTracks = tracks.filter(
    (track) => track.status === "ready" && track.objectUrl,
  );

  const activePlaylistIds = selectedPlaylist?.trackIds ?? [];
  const carouselTrackIds =
    activePlaylistIds.length || selectedPlaylist?.spotify
      ? activePlaylistIds
      : readyTracks.map((track) => track.id);
  const queueKey = carouselTrackIds.join("\0");
  useEffect(() => {
    playerStore.patch({ queue: carouselTrackIds });
  }, [queueKey]);
  const searchNeedle = searchTerm.trim().toLowerCase();
  const visibleTrackIds = activePlaylistIds.filter((id) => {
    const track = trackMap.get(id);
    if (!track) return false;
    if (!searchNeedle) return true;
    return [
      track.title,
      track.alias,
      track.artist,
      track.album,
      track.fileName,
      track.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase()
      .includes(searchNeedle);
  });

  const updateTrack = useCallback(
    (trackId: string, patch: Partial<TavernTrack>) => {
      setTracks((current) =>
        current.map((track) =>
          track.id === trackId ? { ...track, ...patch } : track,
        ),
      );
    },
    [],
  );

  const finishEntrance = useCallback(() => {
    setEntrancePhase("entered");
    const context = audioContextRef.current;
    if (context && gainRef.current) {
      gainRef.current.gain.cancelScheduledValues(context.currentTime);
      gainRef.current.gain.setTargetAtTime(1, context.currentTime, 0.15);
    }
    requestAnimationFrame(() =>
      appRef.current
        ?.querySelector<HTMLButtonElement>(".play-button")
        ?.focus({ preventScroll: true }),
    );
  }, []);

  const openEntrance = () => {
    ensureAudioGraph();
    ringDoorbell(audioContextRef.current);
    setEntrancePhase("opening");
    const track =
      currentTrack?.status === "ready" ? currentTrack : readyTracks[0];
    const audio = audioRef.current;
    if (track?.objectUrl && audio) {
      const context = audioContextRef.current;
      if (context && gainRef.current) {
        gainRef.current.gain.cancelScheduledValues(context.currentTime);
        gainRef.current.gain.setValueAtTime(0, context.currentTime);
        gainRef.current.gain.linearRampToValueAtTime(
          1,
          context.currentTime + 3,
        );
      }
      void localSource.load(track);
      setCurrentTrackId(track.id);
      setIsPlaying(true);
      void localSource.play().catch(() => {
        setIsPlaying(false);
        setStatusLine(t("歌曲已恢复，点击播放即可开席。"));
      });
    }
  };

  const emptyCellar = async () => {
    if (libraryBusyRef.current) return false;
    libraryBusyRef.current = true;
    setLibraryBusy(true);
    window.clearTimeout(saveTimer.current);
    try {
      await clearLibrary();
      audioRef.current?.pause();
      setIsPlaying(false);
      tracksRef.current.forEach(releaseTrack);
      tracksRef.current = [];
      setTracks([]);
      setCurrentTrackId(undefined);
      setEditingTrackId(undefined);
      const empty = createDefaultLibrary();
      setPlaylists(empty.playlists);
      setSelectedPlaylistId(empty.selectedPlaylistId);
      setPlaybackMode(empty.playbackMode);
      setVolume(empty.volume);
      setProgress(0);
      setDuration(0);
      setLibraryBytes(0);
      setStatusLine(t("本地酒窖已清空，角色图片和电脑中的原文件已保留。"));
      return true;
    } catch {
      setStatusLine(t("本地酒窖清空失败，未更改当前菜单。"));
      return false;
    } finally {
      libraryBusyRef.current = false;
      setLibraryBusy(false);
    }
  };

  const removeTrack = async (id: string) => {
    if (libraryBusyRef.current) return false;
    const track = tracksRef.current.find((item) => item.id === id);
    if (!track) return false;
    libraryBusyRef.current = true;
    setLibraryBusy(true);
    window.clearTimeout(saveTimer.current);
    const remaining = tracksRef.current.filter((item) => item.id !== id);
    const nextLibrary = {
      ...libraryRef.current,
      tracks: remaining.map(toPersistedTrack),
      playlists: libraryRef.current.playlists.map((list) => ({
        ...list,
        trackIds: list.trackIds.filter((trackId) => trackId !== id),
      })),
      currentTrackId: currentTrackId === id ? remaining[0]?.id : currentTrackId,
    };
    try {
      await deleteStoredTrack(track.fingerprint, nextLibrary);
      if (currentTrackId === id) {
        await localSource.pause();
        setIsPlaying(false);
        setCurrentTrackId(nextLibrary.currentTrackId);
        setProgress(0);
        setDuration(0);
      }
      releaseTrack(track);
      tracksRef.current = remaining;
      setTracks(remaining);
      setPlaylists(nextLibrary.playlists);
      if (editingTrackId === id) setEditingTrackId(undefined);
      setStatusLine(
        t("已从本地酒窖移除 {title}，电脑原文件未更改。", { title: track.alias || track.title }),
      );
      return true;
    } catch {
      setStatusLine(t("删除未完成，当前音乐库已保留。"));
      return false;
    } finally {
      libraryBusyRef.current = false;
      setLibraryBusy(false);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    spotifyEngine.setVolume(volume);
    if (!audio) return;
    void localSource.setVolume(volume);
  }, [volume]);

  /** Bumped by every pick, so picking the glass that just finished pours it again. */
  const [pourCount, setPourCount] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isSpotifyTrack(currentTrack)) {
      // Never two songs at once (and Spotify forbids overlapping its audio): local goes quiet.
      if (audio.getAttribute("src")) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      setDuration(currentTrack!.duration || 0);
      // A guest's own Spotify is lined up with the host by the room (useRoom).
      if (isGuest) return;
      const uri = currentTrack!.spotifyUri!;
      if (!isPlaying) {
        if (spotifyEngine.isOn(uri)) void spotifyEngine.pause();
        return;
      }
      if (!spotifyReady) {
        setIsPlaying(false);
        setStatusLine(t("这杯来自 Spotify：先在「Spotify 酒单」里连上你的 Spotify。"));
        return;
      }
      if (!spotifyEngine.isOn(uri) || spotifyEngine.finished || spotifyEngine.held) {
        // after Spotify was taken to another device, pick up where it stopped
        const from = spotifyEngine.held && spotifyEngine.isOn(uri) ? spotifyEngine.position() : 0;
        setProgress(from);
        void spotifyEngine.play(uri, from * 1000).then((ok) => {
          if (ok || !spotifyEngine.isOn(uri)) return;
          setIsPlaying(false);
          setStatusLine(spotifyProblemText(spotifyEngine.problem));
        });
      } else if (!spotifyEngine.playing && !spotifyEngine.starting) void spotifyEngine.resume();
      return;
    }
    // a local glass (or none): Spotify stops first
    if (spotifyEngine.uri) void spotifyEngine.stop();
    if (
      !currentTrack ||
      currentTrack.status !== "ready" ||
      !currentTrack.objectUrl
    ) {
      audio.removeAttribute("src");
      setProgress(0);
      setDuration(0);
      if (currentTrack)
        setStatusLine(t("这杯酒的酒瓶还没回到吧台：请重新导入对应本地音频。"));
      return;
    }
    if (audio.src !== currentTrack.objectUrl) {
      void localSource.load(currentTrack);
      setProgress(0);
      setDuration(currentTrack.duration || 0);
    }
    if (isPlaying) {
      ensureAudioGraph();
      localSource.play().catch(() => {
        if (isGuest) {
          // keep following the host; the next tap anywhere starts the sound
          setStatusLine(t("浏览器拦住了自动播放：点一下页面任意位置就能听到。"));
          const resume = () => {
            ensureAudioGraph();
            void localSource.play().catch(() => {});
          };
          window.addEventListener("pointerdown", resume, { once: true });
          return;
        }
        setIsPlaying(false);
        setStatusLine(t("浏览器没有允许自动播放，请再点一次播放按钮。"));
      });
    } else {
      void localSource.pause();
    }
  }, [currentTrack, ensureAudioGraph, isPlaying, pourCount, spotifyReady]);

  const getPlayableIds = useCallback(() => {
    const ids = selectedPlaylist?.trackIds?.filter((id) => {
      const track = trackMap.get(id);
      // a guest can ask for any glass the host can pour
      return isGuest ? track?.status === "ready" : isPlayable(track);
    });
    return ids?.length ? ids : readyTracks.map((track) => track.id);
  }, [readyTracks, selectedPlaylist?.trackIds, trackMap, isPlayable, isGuest]);

  const playTrack = useCallback(
    (trackId: string, intent: "next" | "prev" | "pick" = "pick") => {
      const track = trackMap.get(trackId);
      if (!track) return;
      const fromIndex = carouselTrackIds.findIndex(
        (id) => id === currentTrackId,
      );
      const toIndex = carouselTrackIds.findIndex((id) => id === trackId);
      if (
        intent === "pick" &&
        fromIndex >= 0 &&
        toIndex >= 0 &&
        fromIndex !== toIndex
      ) {
        setTransitionDirection(toIndex > fromIndex ? "next" : "prev");
      } else {
        setTransitionDirection(intent);
      }
      if (isGuest) {
        if (track.status !== "ready") {
          setStatusLine(t("房主那边也缺这杯的原酒，换一杯吧。"));
          return;
        }
        ensureAudioGraph();
        roomSendRef.current({ type: "play", trackId: track.id });
        return;
      }
      if (!isPlayable(track)) {
        setCurrentTrackId(track.id);
        setIsPlaying(false);
        // (a friend's request can land here too, so no dialog pops up on the host)
        if (isSpotifyTrack(track))
          setStatusLine(t("这杯来自 Spotify：先在「Spotify 酒单」里连上你的 Spotify。"));
        else setStatusLine(t("这只酒杯还缺原酒：请重新导入对应本地音频。"));
        return;
      }
      if (isSpotifyTrack(track)) spotifyEngine.activate();
      else ensureAudioGraph();
      setCurrentTrackId(track.id);
      setIsPlaying(true);
      setPourCount((count) => count + 1);
      setStatusLine(t("传杯上桌：{title}", { title: track.alias || track.title }));
    },
    [carouselTrackIds, currentTrackId, ensureAudioGraph, trackMap, isGuest, isPlayable],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (entrancePhase !== "entered") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("dialog") ||
        (target?.closest("button") && event.code === "Space")
      )
        return;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (!isGuest) fileInputRef.current?.click();
        return;
      }
      if (isTyping) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      const { position, duration: length } = playerStore.getSnapshot();
      if (event.key === "ArrowLeft") seek(Math.max(0, position - 5));
      if (event.key === "ArrowRight" && length > 0) seek(Math.min(length, position + 5));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      if (isGuest) {
        setStatusLine(t("同席时只能点房主酒窖里的歌。"));
        return;
      }
      if (!loaded || libraryBusyRef.current) {
        setStatusLine(t("酒窖正在整理，请稍候再导入。"));
        return;
      }
      const fileArray = Array.from(files).filter(isSupportedAudio);
      if (!fileArray.length) {
        setStatusLine(
          t("没有识别到可播放的音频文件，支持 MP3、WAV、OGG、FLAC 等格式。"),
        );
        return;
      }
      libraryBusyRef.current = true;
      setLibraryBusy(true);
      void requestPersistence();
      setStatusLine(t("正在把 {n} 首歌调成吧台上的酒杯...", { n: fileArray.length }));
      const nextTracks = [...tracksRef.current];
      const importedIds: string[] = [];
      let sessionOnly = 0;
      let storageFailure = "";
      const undecodable: string[] = [];
      // local songs never go onto a Spotify page: use the first local menu page instead
      const selectedId =
        selectedPlaylist && !selectedPlaylist.spotify
          ? selectedPlaylist.id
          : (libraryRef.current.playlists.find((playlist) => !playlist.spotify)?.id ??
            "today-menu");

      for (const file of fileArray) {
        const fingerprint = fileFingerprint(file);
        const existingIndex = nextTracks.findIndex(
          (track) => track.fingerprint === fingerprint,
        );
        const previous =
          existingIndex >= 0 ? nextTracks[existingIndex] : undefined;
        const objectUrl = URL.createObjectURL(file);
        const probed = await probeAudio(objectUrl);
        if (probed < 0) {
          URL.revokeObjectURL(objectUrl);
          undecodable.push(file.name);
          continue;
        }
        let coverUrl: string | undefined;
        let coverBlob: Blob | undefined;
        let title = previous?.title || stripExtension(file.name);
        let artist = previous?.artist || t("无名调酒师");
        let album = previous?.album || t("本地酒窖");
        let duration = previous?.duration || 0;
        let tags = previous?.tags?.length ? previous.tags : [t("今日特调")];

        try {
          const metadata = await parseBlob(file);
          title = metadata.common.title?.trim() || title;
          artist = metadata.common.artist?.trim() || artist;
          album = metadata.common.album?.trim() || album;
          duration = metadata.format.duration || probed || duration;
          tags = previous?.tags?.length
            ? previous.tags
            : buildTags(file, artist, duration, metadata.common.genre);
          const picture = metadata.common.picture?.[0];
          if (picture) {
            coverBlob = new Blob([picture.data as BlobPart], {
              type: picture.format || "image/jpeg",
            });
            coverUrl = URL.createObjectURL(coverBlob);
          }
        } catch {
          duration = duration || probed;
          tags = previous?.tags?.length
            ? previous.tags
            : buildTags(file, artist, duration);
        }

        let stored = false;
        try {
          await storeAudio(fingerprint, file, coverBlob);
          stored = true;
        } catch (error) {
          sessionOnly++;
          storageFailure =
            error instanceof DOMException && error.name === "QuotaExceededError"
              ? t("浏览器容量不足")
              : t("浏览器无法保存音频文件");
        }

        const baseTrack: TavernTrack = {
          id: previous?.id ?? makeId("drink"),
          fingerprint,
          fileName: file.name,
          fileSize: file.size,
          lastModified: file.lastModified,
          mimeType: file.type || "audio/*",
          title,
          alias: previous?.alias ?? "",
          artist,
          album,
          duration,
          tags,
          addedAt: previous?.addedAt ?? Date.now(),
          status: "ready",
          stored,
          objectUrl,
          coverUrl: coverUrl ?? previous?.coverUrl,
        };

        if (previous?.objectUrl && previous.objectUrl !== objectUrl)
          URL.revokeObjectURL(previous.objectUrl);
        if (previous?.coverUrl && coverUrl)
          URL.revokeObjectURL(previous.coverUrl);
        if (existingIndex >= 0)
          nextTracks[existingIndex] = { ...previous, ...baseTrack };
        else nextTracks.push(baseTrack);
        importedIds.push(baseTrack.id);
      }

      const nextPlaylists = libraryRef.current.playlists.map((playlist) =>
        playlist.id === selectedId
          ? {
              ...playlist,
              trackIds: [
                ...playlist.trackIds,
                ...importedIds.filter((id) => !playlist.trackIds.includes(id)),
              ],
            }
          : playlist,
      );
      const nextLibrary = {
        ...libraryRef.current,
        tracks: nextTracks.map(toPersistedTrack),
        playlists: nextPlaylists,
        currentTrackId: libraryRef.current.currentTrackId ?? importedIds[0],
      };
      window.clearTimeout(saveTimer.current);
      let menuSaved = true;
      try {
        await saveLibrary(nextLibrary);
      } catch {
        menuSaved = false;
      }
      setTracks(nextTracks);
      tracksRef.current = nextTracks;
      setPlaylists(nextPlaylists);
      if (selectedPlaylist?.spotify && importedIds.length) setSelectedPlaylistId(selectedId);
      if (!currentTrackId && importedIds[0]) setCurrentTrackId(importedIds[0]);
      const rejected = undecodable.length
        ? t("《{names}》{more}无法解码，已退回（文件可能损坏，或可转成 MP3 / WAV 再试）。", {
            names: undecodable.slice(0, 2).join(t("》《")),
            more: undecodable.length > 2 ? t(" 等 {n} 首", { n: undecodable.length }) : "",
          })
        : "";
      setStatusLine(
        importedIds.length
          ? t("已添加 {n} 只酒杯。", { n: importedIds.length }) +
            (!menuSaved
              ? t("菜单保存失败，请先导出 JSON 并保留原音频。")
              : sessionOnly
                ? t("{why}，{n} 首仅本次可播；刷新后需重新导入，菜单信息仍会尽量保存。", {
                    why: t(storageFailure),
                    n: sessionOnly,
                  })
                : t("音频与封面已存入本地酒窖，下次打开自动恢复。")) +
            rejected
          : rejected || t("没有可添加的音频。"),
      );
      libraryBusyRef.current = false;
      setLibraryBusy(false);
    },
    [currentTrackId, selectedPlaylist?.id, loaded],
  );

  const playByOffset = useCallback(
    (offset: 1 | -1) => {
      if (isGuest) {
        roomSendRef.current({ type: offset === 1 ? "next" : "prev" });
        return;
      }
      const playableIds = getPlayableIds();
      if (!playableIds.length) {
        setStatusLine(t("吧台上还没有酒杯，先添加几首本地音乐。"));
        return;
      }
      if (playbackMode === "shuffle" && offset === 1) {
        const next =
          playableIds[Math.floor(Math.random() * playableIds.length)];
        playTrack(next, "pick");
        return;
      }
      const index = playableIds.findIndex((id) => id === currentTrackId);
      const startIndex = index >= 0 ? index : 0;
      let nextIndex = startIndex + offset;
      if (nextIndex < 0)
        nextIndex = playbackMode === "repeat-all" ? playableIds.length - 1 : 0;
      if (nextIndex >= playableIds.length) {
        if (playbackMode === "repeat-all") nextIndex = 0;
        else {
          setIsPlaying(false);
          return;
        }
      }
      playTrack(playableIds[nextIndex], offset === 1 ? "next" : "prev");
    },
    [currentTrackId, getPlayableIds, playTrack, playbackMode, isGuest],
  );

  const togglePlay = useCallback(() => {
    if (isGuest) {
      ensureAudioGraph();
      spotifyEngine.activate();
      const first = getPlayableIds()[0];
      if (currentTrackId) roomSendRef.current({ type: "toggle" });
      else if (first) roomSendRef.current({ type: "play", trackId: first });
      else setStatusLine(t("房主的吧台上还没有酒杯。"));
      return;
    }
    if (!currentTrackId) {
      const first = getPlayableIds()[0];
      if (first) playTrack(first);
      else setStatusLine(t("吧台上还没有可播放的酒杯。"));
      return;
    }
    const track = trackMap.get(currentTrackId);
    if (!isPlayable(track)) {
      if (isSpotifyTrack(track))
        setStatusLine(t("这杯来自 Spotify：先在「Spotify 酒单」里连上你的 Spotify。"));
      else setStatusLine(t("这首歌需要重新导入本地文件后才能播放。"));
      return;
    }
    if (isSpotifyTrack(track)) spotifyEngine.activate();
    else ensureAudioGraph();
    setIsPlaying((playing) => !playing);
  }, [
    currentTrackId,
    ensureAudioGraph,
    getPlayableIds,
    playTrack,
    trackMap,
    isGuest,
    isPlayable,
  ]);

  const cyclePlaybackMode = () => {
    const modes: PlaybackMode[] = [
      "sequence",
      "shuffle",
      "repeat-all",
      "repeat-one",
    ];
    const next = modes[(modes.indexOf(playbackMode) + 1) % modes.length];
    if (isGuest) {
      roomSendRef.current({ type: "mode", mode: next });
      return;
    }
    setPlaybackMode(next);
    const labels: Record<PlaybackMode, string> = {
      sequence: t("顺序传杯"),
      shuffle: t("随机上酒"),
      "repeat-all": t("吧台轮转"),
      "repeat-one": t("单杯续杯"),
    };
    setStatusLine(labels[next]);
  };

  const handleEnded = () => {
    if (isGuest) return; // the host moves everyone on to the next glass
    if (playbackMode === "repeat-one") {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }
      return;
    }
    playByOffset(1);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    if (!event.dataTransfer.files.length || isGuest) return;
    if (!Array.from(event.dataTransfer.files).some(isSupportedAudio)) return;
    void importFiles(event.dataTransfer.files);
  };

  const reorderTrack = (targetTrackId: string) => {
    if (
      isGuest ||
      !draggedTrackId ||
      draggedTrackId === targetTrackId ||
      !selectedPlaylist
    )
      return;
    if (selectedPlaylist.spotify) {
      setDropTargetId(undefined);
      setStatusLine(t("Spotify 歌单的顺序跟着 Spotify 走，要调顺序请在 Spotify 里改。"));
      return;
    }
    const order = [...selectedPlaylist.trackIds];
    const from = order.indexOf(draggedTrackId);
    const to = order.indexOf(targetTrackId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, draggedTrackId);
    setPlaylists((current) =>
      current.map((playlist) =>
        playlist.id === selectedPlaylist.id
          ? { ...playlist, trackIds: order }
          : playlist,
      ),
    );
    setDropTargetId(undefined);
    setStatusLine(t("杯子已经沿吧台重新摆好。"));
  };

  /** Move a glass to the spot of another glass (drag on the bar or in the menu). */
  const moveTrack = (trackId: string, targetTrackId: string) => {
    if (isGuest) {
      setStatusLine(t("同席时酒杯顺序由房主来摆。"));
      return;
    }
    if (!selectedPlaylist || trackId === targetTrackId) return;
    if (selectedPlaylist.spotify) {
      setStatusLine(t("Spotify 歌单的顺序跟着 Spotify 走，要调顺序请在 Spotify 里改。"));
      return;
    }
    const order = [...selectedPlaylist.trackIds];
    const from = order.indexOf(trackId);
    const to = order.indexOf(targetTrackId);
    if (from < 0 || to < 0) {
      setStatusLine(t("只能在当前菜单里调整酒杯顺序。"));
      return;
    }
    order.splice(from, 1);
    order.splice(to, 0, trackId);
    setPlaylists((current) =>
      current.map((playlist) =>
        playlist.id === selectedPlaylist.id
          ? { ...playlist, trackIds: order }
          : playlist,
      ),
    );
    setStatusLine(t("杯子已经沿吧台重新摆好。"));
  };

  const addPlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const playlist: TavernPlaylist = {
      id: makeId("menu"),
      name,
      mood: t("新开的菜单页，等你来写第一杯。"),
      trackIds: [],
    };
    setPlaylists((current) => [...current, playlist]);
    setSelectedPlaylistId(playlist.id);
    setNewPlaylistName("");
    setStatusLine(t("已开新菜单：{name}", { name }));
  };

  const renamePlaylist = (playlist: TavernPlaylist) => {
    const name = window.prompt(t("给这页菜单换个名字"), playlist.name)?.trim();
    if (!name) return;
    setPlaylists((current) =>
      current.map((item) =>
        item.id === playlist.id ? { ...item, name } : item,
      ),
    );
  };

  const deletePlaylist = (playlist: TavernPlaylist) => {
    if (playlists.length <= 1) {
      setStatusLine(t("至少要留一页菜单。"));
      return;
    }
    const confirmed = window.confirm(
      t("删除歌单「{name}」？歌曲文件和其他歌单不会被删除。", { name: playlist.name }),
    );
    if (!confirmed) return;
    const next = playlists.filter((item) => item.id !== playlist.id);
    setPlaylists(next);
    if (selectedPlaylistId === playlist.id) setSelectedPlaylistId(next[0].id);
  };

  const renamePlaylistTo = (playlistId: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setPlaylists((current) =>
      current.map((item) =>
        item.id === playlistId ? { ...item, name: clean } : item,
      ),
    );
    setStatusLine(t("菜单已改名：{name}", { name: clean }));
  };

  /** Delete without a browser confirm; the menu drawer asks inline first. */
  const removePlaylist = (playlistId: string) => {
    if (playlists.length <= 1) {
      setStatusLine(t("至少要留一页菜单。"));
      return;
    }
    const next = playlists.filter((item) => item.id !== playlistId);
    setPlaylists(next);
    if (selectedPlaylistId === playlistId) setSelectedPlaylistId(next[0].id);
    setStatusLine(t("这页菜单已撕下，歌曲仍留在酒窖里。"));
  };

  const toggleTrackInPlaylist = (playlistId: string, trackId: string) => {
    const target = playlists.find((playlist) => playlist.id === playlistId);
    if (target?.spotify || isSpotifyTrack(trackMap.get(trackId))) {
      setStatusLine(t("Spotify 的歌只待在它自己的歌单页里。"));
      return;
    }
    setPlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const exists = playlist.trackIds.includes(trackId);
        return {
          ...playlist,
          trackIds: exists
            ? playlist.trackIds.filter((id) => id !== trackId)
            : [...playlist.trackIds, trackId],
        };
      }),
    );
  };

  const exportConfig = () => {
    const library: TavernLibrary = {
      version: 1,
      selectedPlaylistId,
      currentTrackId,
      playbackMode,
      volume,
      tracks: tracks.map(toPersistedTrack),
      playlists: persistablePlaylists(playlists),
    };
    const blob = new Blob([JSON.stringify(library, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tavern-menu-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusLine(t("菜单配置已导出；音频文件本体不会包含在 JSON 里。"));
  };

  const importConfig = async (file?: File) => {
    if (!file || !loaded || libraryBusyRef.current) return;
    libraryBusyRef.current = true;
    setLibraryBusy(true);
    try {
      const parsed = parseLibraryConfig(await file.text());
      const currentByFingerprint = new Map(
        tracks.map((track) => [track.fingerprint, track]),
      );
      const importedTracks = await Promise.all(
        parsed.tracks.map(async (track) => {
          const current = currentByFingerprint.get(track.fingerprint);
          return current?.objectUrl
            ? {
                ...track,
                objectUrl: current.objectUrl,
                coverUrl: current.coverUrl,
                status: current.status,
                stored: current.stored,
              }
            : await reviveTrack(track);
        }),
      );
      const retainedUrls = new Set(
        importedTracks.map((track) => track.objectUrl),
      );
      tracks.forEach((track) => {
        if (!retainedUrls.has(track.objectUrl)) releaseTrack(track);
      });
      setTracks(importedTracks);
      setPlaylists(parsed.playlists);
      setSelectedPlaylistId(
        parsed.selectedPlaylistId || parsed.playlists[0]?.id || "today-menu",
      );
      setCurrentTrackId(parsed.currentTrackId);
      setPlaybackMode(parsed.playbackMode || "sequence");
      setVolume(parsed.volume ?? 0.76);
      fetchedRef.current.clear();
      setSpotifyEpoch((epoch) => epoch + 1);
      setStatusLine(t("菜单配置导入成功；缺失的音频会显示为待重新导入。"));
    } catch {
      setStatusLine(t("这份 JSON 看起来不是有效的酒馆菜单配置。"));
    } finally {
      libraryBusyRef.current = false;
      setLibraryBusy(false);
    }
  };

  /** Move the playhead of whatever is pouring on this computer. */
  const seekHere = (value: number) => {
    const position = Math.max(0, value);
    if (isSpotifyTrack(currentTrack)) void spotifyEngine.seek(position);
    else void localSource.seek(position);
    setProgress(position);
  };

  const seek = (value: number) => {
    if (isGuest) {
      roomSendRef.current({ type: "seek", position: Math.max(0, value) });
      setProgress(value);
      return;
    }
    seekHere(value);
  };

  /** A relayed song can hiccup on a shaky connection: try again instead of stopping. */
  const handleAudioError = () => {
    const audio = audioRef.current;
    if (isGuest && audio?.getAttribute("src")) {
      setStatusLine(t("网络有点卡，正在重新接酒……"));
      window.setTimeout(() => {
        audio.load();
        if (isPlaying) void audio.play().catch(() => {});
      }, 1500);
      return;
    }
    setIsPlaying(false);
    setStatusLine(
      t("这首音频无法解码，请检查文件是否完整，或转换为 MP3 / WAV 后重新导入。"),
    );
  };

  // --------------------------------------------------------------- Spotify
  const isSpotifyNow = isSpotifyTrack(currentTrack);
  const spotifyUriNow = isSpotifyNow ? currentTrack?.spotifyUri : undefined;
  const [spotifyLoading, setSpotifyLoading] = useState<string[]>([]);
  const fetchedRef = useRef(new Set<string>());
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;

  // where the Spotify song is (the host's bar; a guest's follows the room)
  useEffect(() => {
    if (!spotifyUriNow || isGuest) return;
    const tick = () =>
      setProgress(spotifyEngine.isOn(spotifyUriNow) ? spotifyEngine.position() : 0);
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [spotifyUriNow, isGuest]);

  // the song finished, or Spotify was paused / taken over from outside the tavern
  const spotifyEventsRef = useRef({ ended: (_uri: string) => {}, lost: (_uri: string) => {} });
  spotifyEventsRef.current = {
    ended: (uri) => {
      if (isGuest || uri !== spotifyUriNow) return;
      if (playbackMode === "repeat-one") {
        void spotifyEngine.play(uri, 0);
        return;
      }
      setPourCount((count) => count + 1);
      playByOffset(1);
    },
    lost: (uri) => {
      if (isGuest || uri !== spotifyUriNow) return;
      setIsPlaying(false);
      setStatusLine(t("Spotify 在别处被暂停或换了设备，酒馆这边也先停下。"));
    },
  };
  useEffect(() => {
    const offEnded = spotifyEngine.on("ended", ({ uri }) => spotifyEventsRef.current.ended(uri));
    const offLost = spotifyEngine.on("lost", ({ uri }) => spotifyEventsRef.current.lost(uri));
    return () => {
      offEnded();
      offLost();
    };
  }, []);

  /** Pull a linked menu page's songs from Spotify. */
  const refreshSpotifyPlaylist = useCallback(async (playlistId: string) => {
    const playlist = playlistsRef.current.find((item) => item.id === playlistId);
    const link = playlist?.spotify;
    if (!playlist || !link) return;
    fetchedRef.current.add(`${playlistId}:${link.id}`);
    setSpotifyLoading((current) => [...current.filter((id) => id !== playlistId), playlistId]);
    try {
      const fetched = await fetchLinkedTracks(link);
      setSpotifyTracks((current) => {
        const byId = new Map(current.map((track) => [track.id, track]));
        fetched.forEach((track) => byId.set(track.id, track));
        return [...byId.values()];
      });
      setPlaylists((current) =>
        current.map((item) =>
          item.id === playlistId ? { ...item, trackIds: fetched.map((track) => track.id) } : item,
        ),
      );
      setStatusLine(
        fetched.length
          ? t("「{name}」从 Spotify 端上来了 {n} 杯。", { name: playlist.name, n: fetched.length })
          : t("「{name}」里没有能在网页上播放的歌。", { name: playlist.name }),
      );
    } catch (error) {
      fetchedRef.current.delete(`${playlistId}:${link.id}`);
      setStatusLine(
        error instanceof SpotifyApiError && error.status === 403
          ? t("Spotify 只允许读取你自己建的或协作的歌单，「{name}」读不到曲目。", { name: playlist.name })
          : error instanceof SpotifyApiError && error.status === 404
            ? t("Spotify 上找不到「{name}」了，可能已被删除。", { name: playlist.name })
            : t("没能从 Spotify 取到「{name}」，稍后在酒单里点刷新再试。", { name: playlist.name }),
      );
    } finally {
      setSpotifyLoading((current) => current.filter((id) => id !== playlistId));
    }
  }, []);

  // linked pages fill themselves once Spotify is connected
  const linkedKey = playlists
    .filter((playlist) => playlist.spotify)
    .map((playlist) => `${playlist.id}:${playlist.spotify!.id}`)
    .join("|");
  useEffect(() => {
    if (isGuest || !loaded || !spotifyReady) return;
    for (const key of linkedKey ? linkedKey.split("|") : []) {
      if (fetchedRef.current.has(key)) continue;
      void refreshSpotifyPlaylist(key.slice(0, key.lastIndexOf(":")));
    }
  }, [isGuest, loaded, spotifyReady, linkedKey, refreshSpotifyPlaylist, spotifyEpoch]);

  // signed out: the Spotify songs leave the bar (the page links stay)
  useEffect(() => {
    if (isGuest || spotify.signedIn) return;
    fetchedRef.current.clear();
    void spotifyEngine.stop();
    setSpotifyTracks((current) => (current.length ? [] : current));
    setPlaylists((current) =>
      current.some((item) => item.spotify && item.trackIds.length)
        ? current.map((item) => (item.spotify ? { ...item, trackIds: [] } : item))
        : current,
    );
  }, [isGuest, spotify.signedIn]);

  // back from a full-page Spotify sign-in: show where things stand
  useEffect(() => {
    try {
      if (sessionStorage.getItem("tavern-open-spotify") === "1") {
        sessionStorage.removeItem("tavern-open-spotify");
        setSpotifyPanelOpen(true);
      }
    } catch {
      /* nothing to reopen */
    }
  }, []);

  /** Put a Spotify playlist (or 「我喜欢的歌曲」) on the menu as its own page. */
  const linkSpotifyPlaylist = (info: SpotifyPlaylistInfo) => {
    if (isGuest) return;
    const existing = playlistsRef.current.find((item) => item.spotify?.id === info.link.id);
    if (existing) {
      setSelectedPlaylistId(existing.id);
      void refreshSpotifyPlaylist(existing.id);
      return;
    }
    const playlist: TavernPlaylist = {
      id: `spotify-${info.link.id}-${Date.now().toString(36)}`,
      name: info.name,
      mood: info.link.owner ? `Spotify · ${info.link.owner}` : "Spotify",
      trackIds: [],
      spotify: info.link,
    };
    playlistsRef.current = [...playlistsRef.current, playlist];
    setPlaylists(playlistsRef.current);
    setSelectedPlaylistId(playlist.id);
    void refreshSpotifyPlaylist(playlist.id);
  };

  // ------------------------------------------------------------- 同席 room
  const hostPlaylistRef = useRef<string>();
  const room = useRoom(inviteKey, {
    tracks: allTracks,
    playlists,
    selectedPlaylistId,
    carouselTrackIds,
    currentTrackId,
    isPlaying,
    playbackMode,
    audio: () => audioRef.current,
    position: () =>
      spotifyUriNow
        ? spotifyEngine.isOn(spotifyUriNow)
          ? spotifyEngine.position()
          : 0
        : (audioRef.current?.currentTime ?? 0),
    audible: () =>
      spotifyUriNow ? spotifyEngine.isOn(spotifyUriNow) && spotifyEngine.playing : isPlaying,
    spotifyClientId: spotifyReady ? spotify.clientId : undefined,
    showProgress: (position, length) => {
      setProgress(position);
      setDuration(length);
    },
    ensureAudioGraph,
    say: (text) =>
      setStatusLine((previous) => (previous === text ? `${text}\u200b` : text)),
    playTrack: (id) => playTrack(id),
    togglePlay,
    playByOffset,
    seek: seekHere,
    setPlaybackMode,
    showHostLibrary: (hostTracks, hostPlaylists, hostSelected) => {
      tracksRef.current = hostTracks;
      setTracks(hostTracks);
      setPlaylists(hostPlaylists);
      if (hostPlaylistRef.current !== hostSelected) {
        hostPlaylistRef.current = hostSelected;
        setSelectedPlaylistId(hostSelected || hostPlaylists[0]?.id || "today-menu");
      }
    },
    followHost: (trackId, playing, mode) => {
      const order = carouselTrackIds;
      const from = order.indexOf(currentTrackId ?? "");
      const to = trackId ? order.indexOf(trackId) : -1;
      if (trackId !== currentTrackId)
        setTransitionDirection(from >= 0 && to >= 0 ? (to > from ? "next" : "prev") : "pick");
      setCurrentTrackId(trackId);
      setIsPlaying(Boolean(trackId) && playing);
      setPlaybackMode(mode);
    },
  });
  roomSendRef.current = room.send;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType === "touch" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const x = Math.max(
      -0.5,
      Math.min(0.5, event.clientX / window.innerWidth - 0.5),
    );
    const y = Math.max(
      -0.5,
      Math.min(0.5, event.clientY / window.innerHeight - 0.5),
    );
    pointerRef.current = { x: x * 2, y: y * 2 };
    event.currentTarget.style.setProperty("--tilt-x", `${x.toFixed(3)}`);
    event.currentTarget.style.setProperty("--tilt-y", `${y.toFixed(3)}`);
  };

  const playbackIcon =
    playbackMode === "shuffle" ? (
      <Shuffle size={19} />
    ) : playbackMode === "repeat-one" ? (
      <Repeat1 size={19} />
    ) : (
      <Repeat size={19} />
    );

  const currentTitle =
    currentTrack?.alias || currentTrack?.title || t("今晚还没有点单");
  const currentArtist = currentTrack?.artist || t("等待调酒师入场");
  const progressMax = Math.max(1, duration || currentTrack?.duration || 1);
  const progressPercent = Math.min(100, (progress / progressMax) * 100);

  return {
    tracks: allTracks,
    localTracks: tracks,
    spotify,
    spotifyLoading,
    linkSpotifyPlaylist,
    refreshSpotifyPlaylist,
    isPlayable,
    currentTrackId,
    setIsPlaying,
    setProgress,
    duration,
    setDuration,
    statusLine,
    setStatusLine,
    isDragActive,
    setIsDragActive,
    loaded,
    transitionDirection,
    characterSettingsOpen,
    setCharacterSettingsOpen,
    librarySettingsOpen,
    setLibrarySettingsOpen,
    libraryBytes,
    libraryBusy,
    entrancePhase,
    setEntrancePhase,
    portrait,
    pointerRef,
    audioRef,
    fileInputRef,
    configInputRef,
    appRef,
    currentTrack,
    readyTracks,
    carouselTrackIds,
    updateTrack,
    finishEntrance,
    openEntrance,
    emptyCellar,
    importFiles,
    handleEnded,
    handleDrop,
    exportConfig,
    importConfig,
    handlePointerMove,
    removeTrack,
    spotifyPanelOpen,
    setSpotifyPanelOpen,
    multiplayerPanelOpen,
    setMultiplayerPanelOpen,
    sourceType,
    isPlaying,
    attentionRef,
    playlists,
    setSelectedPlaylistId,
    newPlaylistName,
    setNewPlaylistName,
    selectedPlaylist,
    addPlaylist,
    renamePlaylist,
    deletePlaylist,
    renamePlaylistTo,
    removePlaylist,
    selectedPlaylistId,
    setDraggedTrackId,
    dropTargetId,
    setDropTargetId,
    stageRef,
    analyserRef,
    trackMap,
    playTrack,
    reorderTrack,
    moveTrack,
    setEditingTrackId,
    editingTrack,
    toggleTrackInPlaylist,
    searchTerm,
    setSearchTerm,
    visibleTrackIds,
    currentTitle,
    currentArtist,
    playbackMode,
    volume,
    setVolume,
    progress,
    playByOffset,
    togglePlay,
    cyclePlaybackMode,
    seek,
    handleAudioError,
    room,
    isGuest,
    playbackIcon,
    progressMax,
    progressPercent,
  };
}
export type TavernController = ReturnType<typeof useTavernController>;
