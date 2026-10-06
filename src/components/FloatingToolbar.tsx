import {
  Database,
  FileDown,
  FileUp,
  ImagePlus,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Wine,
  Music2,
  Users,
} from "lucide-react";

import type { TavernController } from "../app/useTavernController";
import { formatBytes } from "./LocalCellarManager";
export function FloatingToolbar({ model }: { model: TavernController }) {
  const {
    setCharacterSettingsOpen,
    setLibrarySettingsOpen,
    portrait,
    portraitInputRef,
    fileInputRef,
    configInputRef,
    live2dInputRef,
    exportConfig,
  } = model;
  return (
    <header className="tavern-topbar">
      <div className="brand-mark" aria-label="无序酒馆">
        <Wine size={26} />
      </div>
      <div>
        <p className="eyebrow">LAPPLAND / AFTER HOURS</p>
        <h1>无序酒馆吧台</h1>
      </div>
      <nav className="source-selector" aria-label="音乐来源">
        <button
          className="icon-button"
          aria-label="本地酒窖与入场设置"
          aria-pressed={model.sourceType === "local"}
          data-tip="本地酒窖 · 音频只留在此浏览器"
          onClick={() => setLibrarySettingsOpen(true)}
        >
          <Database size={18} />
          <span>本地</span>
        </button>
        <button
          className="icon-button"
          aria-label="Spotify 酒单"
          aria-pressed={model.sourceType === "spotify"}
          data-tip="Spotify 酒单 · 实验接口，未连接"
          onClick={() => model.setSpotifyPanelOpen(true)}
        >
          <Music2 size={18} />
          <span>Spotify</span>
        </button>
      </nav>
      <button
        className="session-status icon-button"
        aria-label="同席房间状态"
        data-tip={`${model.tracks.length} 首 · ${formatBytes(model.libraryBytes)} · 本地音源 · 房间离线`}
        onClick={() => model.setMultiplayerPanelOpen(true)}
      >
        <Users size={17} />
        <span>离线</span>
      </button>
      <div className="topbar-actions">
        <button
          className="icon-button"
          data-tip="载入拉普兰德图片"
          aria-label="载入拉普兰德图片"
          onClick={() => portraitInputRef.current?.click()}
        >
          <ImagePlus size={20} />
        </button>
        {portrait.asset && (
          <button
            className="icon-button"
            data-tip="角色构图与动画"
            aria-label="角色构图与动画"
            onClick={() => setCharacterSettingsOpen(true)}
          >
            <SlidersHorizontal size={20} />
          </button>
        )}
        <button
          className="icon-button"
          data-tip="添加本地歌曲 Ctrl/Cmd+O"
          aria-label="添加本地歌曲"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={20} />
        </button>
        <button
          className="icon-button"
          data-tip="导入本地 Live2D 文件夹"
          aria-label="导入 Live2D 模型"
          onClick={() => live2dInputRef.current?.click()}
        >
          <Sparkles size={20} />
        </button>
        <button
          className="icon-button"
          data-tip="导入菜单 JSON"
          aria-label="导入菜单配置"
          onClick={() => configInputRef.current?.click()}
        >
          <FileUp size={20} />
        </button>
        <button
          className="icon-button"
          data-tip="导出菜单 JSON"
          aria-label="导出菜单配置"
          onClick={exportConfig}
        >
          <FileDown size={20} />
        </button>
      </div>
    </header>
  );
}
