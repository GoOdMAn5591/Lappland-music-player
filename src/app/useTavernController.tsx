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
  stripExtension,
} from "../app/drinks";
import { usePortrait } from "../character/portrait";
import { getCharacterRuntime } from "../character/runtime";
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
  loadLibrary,
  parseLibraryConfig,
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
export function useTavernController() {
  const [tracks, setTracks] = useState<TavernTrack[]>([]);
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
    "把本地音频拖到吧台上，今晚第一杯就会滑到你面前。",
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
    skipEntrancePreference() ? "entered" : "closed",
  );
  const attentionRef = useRef(-10000);
  const libraryBusyRef = useRef(false);
  const saveTimer = useRef<number>();
  const [modelFiles, setModelFiles] = useState<File[]>([]);
  const portrait = usePortrait(setStatusLine);
  const pointerRef = useRef({ x: 0, y: 0 });
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const {
    audioRef,
    appRef,
    canvasRef,
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
  const live2dInputRef = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<TavernTrack[]>([]);
  const libraryRef = useRef<TavernLibrary>(createDefaultLibrary());
  libraryRef.current = {
    version: 1,
    selectedPlaylistId,
    currentTrackId,
    playbackMode,
    volume,
    tracks: tracks.map(toPersistedTrack),
    playlists,
  };

  useEffect(() => {
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
            `酒窖已恢复 ${restored.filter((track) => track.stored).length} 首；${restored.filter((track) => !track.stored).length} 首需要重新导入音频。`,
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
          "浏览器本地存储暂不可用。音频仍可在本次会话播放，请保留原文件并导出菜单。",
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const library: TavernLibrary = {
      version: 1,
      selectedPlaylistId,
      currentTrackId,
      playbackMode,
      volume,
      tracks: tracks.map(toPersistedTrack),
      playlists,
    };
    saveTimer.current = window.setTimeout(() => {
      saveLibrary(library).catch(() => {
        setStatusLine("菜单保存失败，可能是浏览器储存空间已满。");
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

  const trackMap = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
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
  const carouselTrackIds = activePlaylistIds.length
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
        setStatusLine("歌曲已恢复，点击播放即可开席。");
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
      setStatusLine("本地酒窖已清空，角色图片和电脑中的原文件已保留。");
      return true;
    } catch {
      setStatusLine("本地酒窖清空失败，未更改当前菜单。");
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
        `已从本地酒窖移除 ${track.alias || track.title}，电脑原文件未更改。`,
      );
      return true;
    } catch {
      setStatusLine("删除未完成，当前音乐库已保留。");
      return false;
    } finally {
      libraryBusyRef.current = false;
      setLibraryBusy(false);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    void localSource.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (
      !currentTrack ||
      currentTrack.status !== "ready" ||
      !currentTrack.objectUrl
    ) {
      audio.removeAttribute("src");
      setProgress(0);
      setDuration(0);
      if (currentTrack)
        setStatusLine("这杯酒的酒瓶还没回到吧台：请重新导入对应本地音频。");
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
        setIsPlaying(false);
        setStatusLine("浏览器没有允许自动播放，请再点一次播放按钮。");
      });
    } else {
      void localSource.pause();
    }
  }, [currentTrack, ensureAudioGraph, isPlaying]);

  const getPlayableIds = useCallback(() => {
    const ids = selectedPlaylist?.trackIds?.filter((id) => {
      const track = trackMap.get(id);
      return track?.status === "ready" && track.objectUrl;
    });
    return ids?.length ? ids : readyTracks.map((track) => track.id);
  }, [readyTracks, selectedPlaylist?.trackIds, trackMap]);

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
      if (track.status !== "ready" || !track.objectUrl) {
        setCurrentTrackId(track.id);
        setIsPlaying(false);
        setStatusLine("这只酒杯还缺原酒：请重新导入对应本地音频。");
        return;
      }
      ensureAudioGraph();
      setCurrentTrackId(track.id);
      setIsPlaying(true);
      setStatusLine(`传杯上桌：${track.alias || track.title}`);
    },
    [carouselTrackIds, currentTrackId, ensureAudioGraph, trackMap],
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
        fileInputRef.current?.click();
        return;
      }
      if (isTyping) return;
      const audio = audioRef.current;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (event.key === "ArrowLeft" && audio) {
        audio.currentTime = Math.max(0, audio.currentTime - 5);
      }
      if (event.key === "ArrowRight" && audio) {
        audio.currentTime = Math.min(
          audio.duration || 0,
          audio.currentTime + 5,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!loaded || libraryBusyRef.current) {
        setStatusLine("酒窖正在整理，请稍候再导入。");
        return;
      }
      const fileArray = Array.from(files).filter(isSupportedAudio);
      if (!fileArray.length) {
        setStatusLine(
          "没有识别到可播放的音频文件，支持 MP3、WAV、OGG、FLAC 等格式。",
        );
        return;
      }
      libraryBusyRef.current = true;
      setLibraryBusy(true);
      void requestPersistence();
      setStatusLine(`正在把 ${fileArray.length} 首歌调成吧台上的酒杯...`);
      const nextTracks = [...tracksRef.current];
      const importedIds: string[] = [];
      let sessionOnly = 0;
      let storageFailure = "";
      const selectedId = selectedPlaylist?.id ?? "today-menu";

      for (const file of fileArray) {
        const fingerprint = fileFingerprint(file);
        const existingIndex = nextTracks.findIndex(
          (track) => track.fingerprint === fingerprint,
        );
        const previous =
          existingIndex >= 0 ? nextTracks[existingIndex] : undefined;
        const objectUrl = URL.createObjectURL(file);
        let coverUrl: string | undefined;
        let coverBlob: Blob | undefined;
        let title = previous?.title || stripExtension(file.name);
        let artist = previous?.artist || "无名调酒师";
        let album = previous?.album || file.type || "本地酒窖";
        let duration = previous?.duration || 0;
        let tags = previous?.tags?.length ? previous.tags : ["今日特调"];

        try {
          const metadata = await parseBlob(file);
          title = metadata.common.title?.trim() || title;
          artist = metadata.common.artist?.trim() || artist;
          album =
            metadata.common.album?.trim() ||
            metadata.format.container ||
            metadata.format.codec ||
            album;
          duration = metadata.format.duration || duration;
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
              ? "浏览器容量不足"
              : "浏览器无法保存音频文件";
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
      if (!currentTrackId && importedIds[0]) setCurrentTrackId(importedIds[0]);
      setStatusLine(
        `已添加 ${importedIds.length} 只酒杯。${!menuSaved ? "菜单保存失败，请先导出 JSON 并保留原音频。" : sessionOnly ? `${storageFailure}，${sessionOnly} 首仅本次可播；刷新后需重新导入，菜单信息仍会尽量保存。` : "音频与封面已存入本地酒窖，下次打开自动恢复。"}`,
      );
      libraryBusyRef.current = false;
      setLibraryBusy(false);
    },
    [currentTrackId, selectedPlaylist?.id, loaded],
  );

  const importLive2dFolder = (files?: FileList | null) => {
    if (!files?.length) return;
    const fileArray = Array.from(files);
    const modelFile = fileArray.find((file) =>
      file.name.endsWith(".model3.json"),
    );
    if (!modelFile) {
      setStatusLine(
        "Live2D 文件夹里没有 .model3.json，请选择包含模型配置和纹理的文件夹。",
      );
      return;
    }
    if (!getCharacterRuntime()) {
      setStatusLine(
        "已找到模型；当前版本尚未安装 Cubism 运行时，继续使用已选定图片。模型接入接口已保留。",
      );
      return;
    }
    setModelFiles(fileArray);
  };

  const playByOffset = useCallback(
    (offset: 1 | -1) => {
      const playableIds = getPlayableIds();
      if (!playableIds.length) {
        setStatusLine("吧台上还没有酒杯，先添加几首本地音乐。");
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
    [currentTrackId, getPlayableIds, playTrack, playbackMode],
  );

  const togglePlay = useCallback(() => {
    if (!currentTrackId) {
      const first = getPlayableIds()[0];
      if (first) playTrack(first);
      else setStatusLine("吧台上还没有可播放的酒杯。");
      return;
    }
    const track = trackMap.get(currentTrackId);
    if (track?.status !== "ready" || !track.objectUrl) {
      setStatusLine("这首歌需要重新导入本地文件后才能播放。");
      return;
    }
    ensureAudioGraph();
    setIsPlaying((playing) => !playing);
  }, [currentTrackId, ensureAudioGraph, getPlayableIds, playTrack, trackMap]);

  const cyclePlaybackMode = () => {
    const modes: PlaybackMode[] = [
      "sequence",
      "shuffle",
      "repeat-all",
      "repeat-one",
    ];
    const next = modes[(modes.indexOf(playbackMode) + 1) % modes.length];
    setPlaybackMode(next);
    const labels: Record<PlaybackMode, string> = {
      sequence: "顺序传杯",
      shuffle: "随机上酒",
      "repeat-all": "吧台轮转",
      "repeat-one": "单杯续杯",
    };
    setStatusLine(labels[next]);
  };

  const handleEnded = () => {
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
    if (!event.dataTransfer.files.length) return;
    const image = Array.from(event.dataTransfer.files).find((file) =>
      /\.(jpe?g|png|webp)$/i.test(file.name),
    );
    if (image)
      void portrait.importImage(image).then((ok) => {
        if (ok) setCharacterSettingsOpen(true);
      });
    if (!Array.from(event.dataTransfer.files).some(isSupportedAudio)) return;
    void importFiles(event.dataTransfer.files);
  };

  const reorderTrack = (targetTrackId: string) => {
    if (
      !draggedTrackId ||
      draggedTrackId === targetTrackId ||
      !selectedPlaylist
    )
      return;
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
    setStatusLine("杯子已经沿吧台重新摆好。");
  };

  const addPlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const playlist: TavernPlaylist = {
      id: makeId("menu"),
      name,
      mood: "新开的菜单页，等你来写第一杯。",
      trackIds: [],
    };
    setPlaylists((current) => [...current, playlist]);
    setSelectedPlaylistId(playlist.id);
    setNewPlaylistName("");
    setStatusLine(`已开新菜单：${name}`);
  };

  const renamePlaylist = (playlist: TavernPlaylist) => {
    const name = window.prompt("给这页菜单换个名字", playlist.name)?.trim();
    if (!name) return;
    setPlaylists((current) =>
      current.map((item) =>
        item.id === playlist.id ? { ...item, name } : item,
      ),
    );
  };

  const deletePlaylist = (playlist: TavernPlaylist) => {
    if (playlists.length <= 1) {
      setStatusLine("至少要留一页菜单。");
      return;
    }
    const confirmed = window.confirm(
      `删除歌单「${playlist.name}」？歌曲文件和其他歌单不会被删除。`,
    );
    if (!confirmed) return;
    const next = playlists.filter((item) => item.id !== playlist.id);
    setPlaylists(next);
    if (selectedPlaylistId === playlist.id) setSelectedPlaylistId(next[0].id);
  };

  const toggleTrackInPlaylist = (playlistId: string, trackId: string) => {
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
      playlists,
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
    setStatusLine("菜单配置已导出；音频文件本体不会包含在 JSON 里。");
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
      setStatusLine("菜单配置导入成功；缺失的音频会显示为待重新导入。");
    } catch {
      setStatusLine("这份 JSON 看起来不是有效的酒馆菜单配置。");
    } finally {
      libraryBusyRef.current = false;
      setLibraryBusy(false);
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    void localSource.seek(value);
    setProgress(value);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType === "touch" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = Math.max(
      -0.5,
      Math.min(0.5, (event.clientX - bounds.left) / bounds.width - 0.5),
    );
    const y = Math.max(
      -0.5,
      Math.min(0.5, (event.clientY - bounds.top) / bounds.height - 0.5),
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
    currentTrack?.alias || currentTrack?.title || "今晚还没有点单";
  const currentArtist = currentTrack?.artist || "等待调酒师入场";
  const progressMax = Math.max(1, duration || currentTrack?.duration || 1);
  const progressPercent = Math.min(100, (progress / progressMax) * 100);

  return {
    tracks,
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
    portraitInputRef,
    audioRef,
    fileInputRef,
    configInputRef,
    live2dInputRef,
    appRef,
    currentTrack,
    readyTracks,
    carouselTrackIds,
    updateTrack,
    finishEntrance,
    openEntrance,
    emptyCellar,
    importFiles,
    importLive2dFolder,
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
    modelFiles,
    playlists,
    setSelectedPlaylistId,
    newPlaylistName,
    setNewPlaylistName,
    selectedPlaylist,
    addPlaylist,
    renamePlaylist,
    deletePlaylist,
    setDraggedTrackId,
    dropTargetId,
    setDropTargetId,
    stageRef,
    canvasRef,
    trackMap,
    playTrack,
    reorderTrack,
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
    playbackIcon,
    progressMax,
    progressPercent,
  };
}
export type TavernController = ReturnType<typeof useTavernController>;
