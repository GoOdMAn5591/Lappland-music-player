import { Bell, Check, X } from "lucide-react";

import type { TavernController } from "../app/useTavernController";
export function TrackEditor({ model }: { model: TavernController }) {
  const {
    playlists,
    setStatusLine,
    setEditingTrackId,
    editingTrack,
    updateTrack,
    toggleTrackInPlaylist,
  } = model;
  return (
    <aside className={`cellar-drawer ${editingTrack ? "open" : ""}`}>
      {editingTrack ? (
        <>
          <div className="drawer-heading">
            <div>
              <p className="eyebrow">调酒笔记</p>
              <h2>{editingTrack.title}</h2>
            </div>
            <button
              className="icon-button compact"
              data-tip="关闭"
              aria-label="关闭编辑"
              onClick={() => setEditingTrackId(undefined)}
            >
              <X size={17} />
            </button>
          </div>
          <label className="field-label">
            饮品别名
            <input
              value={editingTrack.alias}
              placeholder={editingTrack.title}
              onChange={(event) =>
                updateTrack(editingTrack.id, {
                  alias: event.target.value,
                })
              }
            />
          </label>
          <label className="field-label">
            口味标签
            <input
              value={editingTrack.tags.join(", ")}
              placeholder="烈酒, 低语, 午夜"
              onChange={(event) =>
                updateTrack(editingTrack.id, {
                  tags: event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                })
              }
            />
          </label>
          <div className="drawer-meta">
            <span>文件：{editingTrack.fileName}</span>
            <span>
              大小：{(editingTrack.fileSize / 1024 / 1024).toFixed(2)} MB
            </span>
            <span>
              状态：
              {editingTrack.status === "ready"
                ? editingTrack.stored
                  ? "已存入本地酒窖"
                  : "仅本次会话可播"
                : "待重新导入"}
            </span>
          </div>
          <div className="playlist-checkboxes">
            <p>放入菜单</p>
            {playlists.map((playlist) => (
              <label key={playlist.id}>
                <input
                  type="checkbox"
                  checked={playlist.trackIds.includes(editingTrack.id)}
                  onChange={() =>
                    toggleTrackInPlaylist(playlist.id, editingTrack.id)
                  }
                />
                <span>{playlist.name}</span>
              </label>
            ))}
          </div>
          <button
            className="commit-note"
            onClick={() => setStatusLine("调酒笔记已写入菜单。")}
          >
            <Check size={17} />
            写入菜单
          </button>
        </>
      ) : (
        <div className="drawer-placeholder">
          <Bell size={26} />
          <p>选择一只酒杯，给它写别名、口味标签和归属菜单。</p>
        </div>
      )}
    </aside>
  );
}
