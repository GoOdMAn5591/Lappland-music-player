import { GripVertical, Pencil, Search, Wine } from "lucide-react";
import { formatTime, getDrinkStyle } from "../app/drinks";

import type { TavernController } from "../app/useTavernController";
export function TrackMenu({ model }: { model: TavernController }) {
  const {
    currentTrackId,
    duration,
    searchTerm,
    setSearchTerm,
    setEditingTrackId,
    setDraggedTrackId,
    fileInputRef,
    trackMap,
    selectedPlaylist,
    visibleTrackIds,
    playTrack,
    reorderTrack,
  } = model;
  return (
    <section className="menu-page">
      <div className="menu-page-heading">
        <div>
          <p className="eyebrow">DRINK LIST</p>
          <h2>{selectedPlaylist?.name ?? "空菜单"}</h2>
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            value={searchTerm}
            placeholder="搜索饮品 / 调酒师 / 标签"
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
      </div>

      <div className="track-list">
        {!visibleTrackIds.length ? (
          <div
            className="empty-menu"
            onClick={() => fileInputRef.current?.click()}
          >
            <Wine size={48} />
            <h3>这页菜单还没写字</h3>
            <p>拖入 MP3、WAV、OGG 或 FLAC，或点击这里添加本地歌曲。</p>
          </div>
        ) : (
          visibleTrackIds.map((trackId) => {
            const track = trackMap.get(trackId);
            if (!track) return null;
            const active = track.id === currentTrackId;
            const drink = getDrinkStyle(track);
            return (
              <article
                key={track.id}
                className={`drink-row ${active ? "active" : ""} ${track.status === "missing" ? "missing" : ""}`}
                draggable
                onDragStart={() => setDraggedTrackId(track.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorderTrack(track.id)}
                onClick={() => playTrack(track.id)}
              >
                <GripVertical className="drag-grip" size={18} />
                <span
                  className={`mini-glass ${drink.className}`}
                  style={drink.style}
                >
                  <span className="mini-liquid" />
                </span>
                <div className="drink-main">
                  <div className="drink-title-line">
                    <h3>{track.alias || track.title}</h3>
                    <span>{formatTime(track.duration)}</span>
                  </div>
                  <p>
                    调酒师：{track.artist} · 年份/产地：
                    {track.album || track.fileName}
                  </p>
                  <div className="tag-row">
                    {track.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    {track.status === "missing" && (
                      <span className="warning-tag">需重新导入</span>
                    )}
                  </div>
                </div>
                <button
                  className="icon-button compact"
                  data-tip="编辑饮品别名与标签"
                  aria-label="编辑歌曲信息"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingTrackId(track.id);
                  }}
                >
                  <Pencil size={16} />
                </button>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
