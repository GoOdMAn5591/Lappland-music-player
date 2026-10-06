import { ListMusic, Pencil, Plus, Trash2 } from "lucide-react";

import type { TavernController } from "../app/useTavernController";
export function PlaylistMenu({ model }: { model: TavernController }) {
  const {
    playlists,
    setSelectedPlaylistId,
    newPlaylistName,
    setNewPlaylistName,
    selectedPlaylist,
    addPlaylist,
    renamePlaylist,
    deletePlaylist,
  } = model;
  return (
    <aside className="menu-board">
      <div className="board-heading">
        <ListMusic size={20} />
        <span>酒单分区</span>
      </div>
      <div className="playlist-stack">
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            className={`playlist-tab ${playlist.id === selectedPlaylist?.id ? "active" : ""}`}
            onClick={() => setSelectedPlaylistId(playlist.id)}
          >
            <span className="wax-dot" />
            <span>
              <strong>{playlist.name}</strong>
              <small>
                {playlist.trackIds.length} 杯 · {playlist.mood}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="playlist-tools">
        <input
          value={newPlaylistName}
          placeholder="新菜单名"
          onChange={(event) => setNewPlaylistName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addPlaylist();
          }}
        />
        <button
          className="icon-button compact"
          data-tip="创建歌单"
          aria-label="创建歌单"
          onClick={addPlaylist}
        >
          <Plus size={17} />
        </button>
      </div>
      {selectedPlaylist && (
        <div className="playlist-admin">
          <button
            className="ghost-action"
            onClick={() => renamePlaylist(selectedPlaylist)}
          >
            <Pencil size={15} />
            重命名
          </button>
          <button
            className="ghost-action danger"
            onClick={() => deletePlaylist(selectedPlaylist)}
          >
            <Trash2 size={15} />
            删除
          </button>
        </div>
      )}
    </aside>
  );
}
