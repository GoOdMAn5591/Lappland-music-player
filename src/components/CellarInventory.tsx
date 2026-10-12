import { Check, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { TavernTrack } from "../storage";
import { t } from "../i18n";

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
        <h3>{t("藏酒目录 · {n}", { n: tracks.length })}</h3>
      </div>
      <label className="cellar-search">
        <Search size={16} />
        <input
          aria-label={t("搜索本地酒窖")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("曲名 / 调酒师")}
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
                    ? t("已保存")
                    : track.status === "ready"
                      ? t("仅本次会话")
                      : t("需重新导入")}
                </small>
              </div>
              {confirmId === track.id ? (
                <>
                  <button
                    className="icon-button danger-action"
                    disabled={busy}
                    aria-label={t("确认删除 {title}", { title: track.title })}
                    data-tip={t("同时从所有歌单移除")}
                    onClick={async () => {
                      if (await onDelete(track.id)) setConfirmId(undefined);
                    }}
                  >
                    <Check size={17} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={t("取消删除")}
                    onClick={() => setConfirmId(undefined)}
                  >
                    <X size={17} />
                  </button>
                </>
              ) : (
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={t("删除 {title}", { title: track.title })}
                  data-tip={t("从本地酒窖删除")}
                  onClick={() => setConfirmId(track.id)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </li>
          ))}
      </ul>
      {!tracks.length && <p>{t("酒窖暂空。")}</p>}
    </section>
  );
}
