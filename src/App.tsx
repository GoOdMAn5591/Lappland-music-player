import { Database, Wine } from "lucide-react";
import {
  LocalCellarManager,
  formatBytes,
} from "./components/LocalCellarManager";
import { useTavernController } from "./app/useTavernController";
import { CharacterSettings } from "./character/CharacterSettings";
import { FloatingToolbar } from "./components/FloatingToolbar";
import { PlaylistMenu } from "./components/PlaylistMenu";
import { TavernStage } from "./components/TavernStage";
import { TrackEditor } from "./components/TrackEditor";
import { TrackMenu } from "./components/TrackMenu";
import { TavernEntrance } from "./entrance/TavernEntrance";
import { SpotifyPanel } from "./components/SpotifyPanel";
import { MultiplayerPanel } from "./components/MultiplayerPanel";
export default function App() {
  const model = useTavernController();
  const {
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
  } = model;
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
        className={`tavern-shell motion-${transitionDirection} ${isDragActive ? "is-dragging-files" : ""}`}
        onDrop={handleDrop}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes("Files")) setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          pointerRef.current = { x: 0, y: 0 };
          appRef.current?.style.setProperty("--tilt-x", "0");
          appRef.current?.style.setProperty("--tilt-y", "0");
        }}
      >
        <input
          ref={portraitInputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="拉普兰德角色图片"
          onChange={(event) => {
            void portrait.importImage(event.target.files?.[0]).then((ok) => {
              if (ok) setCharacterSettingsOpen(true);
            });
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac"
          multiple
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
          onChange={(event) => {
            void importConfig(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={live2dInputRef}
          className="visually-hidden"
          type="file"
          accept=".json,.model3.json,.moc3,.motion3.json,.physics3.json,.png,.jpg,.jpeg"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(event) => {
            importLive2dFolder(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        {characterSettingsOpen && portrait.asset && portrait.url && (
          <CharacterSettings
            asset={portrait.asset}
            url={portrait.url}
            onChange={portrait.updateRig}
            onChoose={() => portraitInputRef.current?.click()}
            onClose={() => setCharacterSettingsOpen(false)}
          />
        )}
        {librarySettingsOpen && (
          <LocalCellarManager
            tracks={tracks}
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
        {model.spotifyPanelOpen && (
          <SpotifyPanel onClose={() => model.setSpotifyPanelOpen(false)} />
        )}
        {model.multiplayerPanelOpen && (
          <MultiplayerPanel
            onClose={() => model.setMultiplayerPanelOpen(false)}
          />
        )}
        <audio
          ref={audioRef}
          onError={() => {
            setIsPlaying(false);
            setStatusLine(
              "这首音频无法解码，请检查文件是否完整，或转换为 MP3 / WAV 后重新导入。",
            );
          }}
          onEnded={handleEnded}
          onLoadedMetadata={(event) => {
            const audio = event.currentTarget;
            setDuration(audio.duration || currentTrack?.duration || 0);
            if (currentTrack && audio.duration && !currentTrack.duration) {
              updateTrack(currentTrack.id, { duration: audio.duration });
            }
          }}
          onTimeUpdate={(event) =>
            setProgress(event.currentTarget.currentTime || 0)
          }
        />

        <FloatingToolbar model={model} />

        <main className="tavern-layout">
          <PlaylistMenu model={model} />

          <TavernStage model={model} />

          <TrackMenu model={model} />

          <TrackEditor model={model} />
        </main>

        <footer className="status-strip">
          <span>{statusLine}</span>
          <button
            className="library-summary"
            onClick={() => setLibrarySettingsOpen(true)}
          >
            <Database size={13} />
            {formatBytes(libraryBytes)}
          </button>
          <span>
            {tracks.length} 首 · {readyTracks.length} 首已导入 · 当前第{" "}
            {Math.max(0, carouselTrackIds.indexOf(currentTrackId ?? "")) + 1} 杯
          </span>
        </footer>

        {isDragActive && (
          <div className="drop-overlay">
            <Wine size={60} />
            <p>松手，把这些歌倒进吧台</p>
          </div>
        )}
      </div>
    </>
  );
}
