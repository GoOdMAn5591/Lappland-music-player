import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import type { CSSProperties } from "react";
import { formatTime } from "../app/drinks";

import type { TavernController } from "../app/useTavernController";
export function TransportControls({ model }: { model: TavernController }) {
  const {
    playbackMode,
    volume,
    setVolume,
    isPlaying,
    progress,
    duration,
    currentTrack,
    playByOffset,
    togglePlay,
    cyclePlaybackMode,
    seek,
    playbackIcon,
    progressMax,
    progressPercent,
  } = model;
  return (
    <div className="transport-panel">
      <div className="time-row">
        <span>{formatTime(progress)}</span>
        <span>{formatTime(duration || currentTrack?.duration)}</span>
      </div>
      <input
        className="progress-bar"
        type="range"
        min="0"
        max={progressMax}
        step="0.01"
        value={Math.min(progress, progressMax)}
        onChange={(event) => seek(Number(event.target.value))}
        aria-label="播放进度"
        title={formatTime(progress)}
        style={{ "--progress": `${progressPercent}%` } as CSSProperties}
      />
      <div className="transport-row">
        <button
          className="icon-button metal"
          data-tip="上一杯"
          aria-label="上一首"
          onClick={() => playByOffset(-1)}
        >
          <SkipBack size={22} />
        </button>
        <button
          className="play-button metal"
          data-tip={isPlaying ? "暂停" : "播放"}
          aria-label={isPlaying ? "暂停" : "播放"}
          onClick={togglePlay}
        >
          {isPlaying ? <Pause size={30} /> : <Play size={30} />}
        </button>
        <button
          className="icon-button metal"
          data-tip="下一杯"
          aria-label="下一首"
          onClick={() => playByOffset(1)}
        >
          <SkipForward size={22} />
        </button>
        <button
          className={`icon-button metal mode-${playbackMode}`}
          data-tip={
            playbackMode === "sequence"
              ? "顺序传杯"
              : playbackMode === "shuffle"
                ? "随机上酒"
                : playbackMode === "repeat-one"
                  ? "单杯续杯"
                  : "吧台轮转"
          }
          aria-label="切换播放模式"
          onClick={cyclePlaybackMode}
        >
          {playbackIcon}
        </button>
      </div>
      <label className="volume-pour">
        <Volume2 size={18} />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label="音量"
        />
      </label>
    </div>
  );
}
