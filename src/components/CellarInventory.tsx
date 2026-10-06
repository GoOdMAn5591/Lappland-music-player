import { Check, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { TavernTrack } from "../storage";

export function CellarInventory({
  tracks,
  busy,
  onDelete,
}: {
  tracks: TavernTrack[];
  busy: boolean;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string>();
  return (
    <section className="cellar-section">
      <div className="cellar-heading">
        <h3>藏酒目录 · {tracks.length}</h3>
      </div>
      <label className="cellar-search">
        <Search size={16} />
        <input
          aria-label="搜索本地酒窖"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="曲名 / 调酒师"
        />
      </label>
      <ul className="cellar-inventory">
        {tracks
          .filter((track) =>
            `${track.alias} ${track.title} ${track.artist}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((track) => (
            <li key={track.id}>
              <div>
                <strong>{track.alias || track.title}</strong>
                <small>
                  {track.artist} · {(track.fileSize / 1024 ** 2).toFixed(2)} MB
                  ·{" "}
                  {track.stored
                    ? "已保存"
                    : track.status === "ready"
                      ? "仅本次会话"
                      : "需重新导入"}
                </small>
              </div>
              {confirmId === track.id ? (
                <>
                  <button
                    className="icon-button danger-action"
                    disabled={busy}
                    aria-label={`确认删除 ${track.title}`}
                    data-tip="同时从所有歌单移除"
                    onClick={async () => {
                      if (await onDelete(track.id)) setConfirmId(undefined);
                    }}
                  >
                    <Check size={17} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label="取消删除"
                    onClick={() => setConfirmId(undefined)}
                  >
                    <X size={17} />
                  </button>
                </>
              ) : (
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={`删除 ${track.title}`}
                  data-tip="从本地酒窖删除"
                  onClick={() => setConfirmId(track.id)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </li>
          ))}
      </ul>
      {!tracks.length && <p>酒窖暂空。</p>}
    </section>
  );
}
