import { Wine } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTavernController } from "./app/useTavernController";
import { CharacterSettings } from "./character/CharacterSettings";
import { BarScene } from "./components/BarScene";
import { LocalCellarManager } from "./components/LocalCellarManager";
import { MultiplayerPanel } from "./components/MultiplayerPanel";
import { RoomJoin } from "./components/RoomJoin";
import { SpotifyPanel } from "./components/SpotifyPanel";
import { YouTubePanel } from "./components/YouTubePanel";
import { YouTubeScreen } from "./components/YouTubeScreen";
import { Hud } from "./components/hud/Hud";
import { MenuDrawer } from "./components/hud/MenuDrawer";
import { createFrameBus } from "./components/hud/frameBus";
import { TavernEntrance } from "./entrance/TavernEntrance";
import type { Quality } from "./scene3d/post";
import { t, useLang } from "./i18n";
import { usePowerSaver } from "./power";

const QUALITY_KEY = "tavern-quality";
function storedQuality(): Quality | "auto" {
  try {
    const value = localStorage.getItem(QUALITY_KEY);
    return value === "high" || value === "medium" || value === "low"
      ? value
      : "auto";
  } catch {
    return "auto";
  }
}

export default function App() {
  useLang(); // re-render everything when the language changes
  const powerSaver = usePowerSaver();
  const model = useTavernController();
  const {
    setIsPlaying,
    setProgress,
    setDuration,
    setStatusLine,
    isDragActive,
    setIsDragActive,
    loaded,
    characterSettingsOpen,
    setCharacterSettingsOpen,
    librarySettingsOpen,
    setLibrarySettingsOpen,
    libraryBusy,
    entrancePhase,
    setEntrancePhase,
    portrait,
    audioRef,
    fileInputRef,
    configInputRef,
    appRef,
    currentTrack,
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
  } = model;
  const bus = useMemo(createFrameBus, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scene, setScene] = useState<"loading" | "ready" | "failed">("loading");
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [quality, setQuality] = useState<Quality | "auto">(storedQuality);
  const chooseQuality = useCallback((value: Quality | "auto") => {
    setQuality(value);
    try {
      localStorage.setItem(QUALITY_KEY, value);
    } catch {
      /* preference only lasts this session */
    }
  }, []);

  return (
    <>
      {entrancePhase !== "entered" && (
        <TavernEntrance
          phase={entrancePhase}
          ready={loaded}
          onOpen={openEntrance}
          onEnter={finishEntrance}
        />
      )}
      <div
        ref={appRef}
        data-entry={entrancePhase}
        data-scene={scene}
        data-power={powerSaver ? "saver" : undefined}
        className={`tavern-app ${isDragActive ? "is-dragging-files" : ""} ${menuOpen ? "menu-is-open" : ""}`}
        onDrop={handleDrop}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes("Files") && !model.isGuest)
            setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target || !event.relatedTarget)
            setIsDragActive(false);
        }}
        onPointerMove={handlePointerMove}
      >
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac"
          multiple
          aria-label={t("添加本地音频")}
          onChange={(event) => {
            if (event.target.files) void importFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={configInputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label={t("导入菜单 JSON")}
          onChange={(event) => {
            void importConfig(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <audio
          ref={audioRef}
          onError={model.handleAudioError}
          onEnded={handleEnded}
          onLoadedMetadata={(event) => {
            const audio = event.currentTarget;
            setDuration(audio.duration || currentTrack?.duration || 0);
            if (currentTrack && audio.duration && !currentTrack.duration)
              updateTrack(currentTrack.id, { duration: audio.duration });
          }}
          onTimeUpdate={(event) =>
            setProgress(event.currentTarget.currentTime || 0)
          }
        />

        <BarScene
          model={model}
          quality={quality}
          onFrame={bus.emit}
          onStatus={setScene}
        />
        <div className="hud-scrim" aria-hidden="true" />
        <Hud
          model={model}
          bus={bus}
          quality={quality}
          onQuality={chooseQuality}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <MenuDrawer model={model} open={menuOpen} onClose={closeMenu} />
        <YouTubeScreen model={model} />

        {scene === "failed" && (
          <div className="scene-fallback" role="alert">
            <Wine size={34} />
            <p>
              {t("这台设备暂时无法启用 3D 吧台（WebGL 不可用）。播放、酒单与导入功能仍可正常使用。")}
            </p>
          </div>
        )}

        {characterSettingsOpen && (
          <CharacterSettings
            rig={portrait.rig}
            onChange={portrait.updateRig}
            onClose={() => setCharacterSettingsOpen(false)}
          />
        )}
        {librarySettingsOpen && (
          <LocalCellarManager
            tracks={model.localTracks}
            busy={libraryBusy}
            onClear={emptyCellar}
            onClose={() => setLibrarySettingsOpen(false)}
            onExport={exportConfig}
            onImport={() => configInputRef.current?.click()}
            onDelete={model.removeTrack}
            onReplay={() => {
              setLibrarySettingsOpen(false);
              setIsPlaying(false);
              setEntrancePhase("closed");
            }}
          />
        )}
        {model.youtubePanelOpen && (
          <YouTubePanel model={model} onClose={() => model.setYouTubePanelOpen(false)} />
        )}
        {model.spotifyPanelOpen && (
          <SpotifyPanel model={model} onClose={() => model.setSpotifyPanelOpen(false)} />
        )}
        {model.multiplayerPanelOpen && (
          <MultiplayerPanel
            model={model}
            onClose={() => model.setMultiplayerPanelOpen(false)}
          />
        )}
        {model.isGuest && model.room.status !== "joined" && (
          <RoomJoin model={model} />
        )}

        {isDragActive && (
          <div className="drop-overlay" aria-hidden="true">
            <div className="drop-card">
              <svg viewBox="0 0 48 64" width="54" height="72">
                <path d="M10 6h28l-3 22Q24 38 13 28Z M24 34v20 M14 56h20" />
              </svg>
              <strong>{t("松手，把这些歌倒进吧台")}</strong>
              <span>{t("音频只留在这台电脑的浏览器里")}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
