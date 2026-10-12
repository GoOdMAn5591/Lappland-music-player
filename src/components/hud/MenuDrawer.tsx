import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileDown,
  FileUp,
  GripVertical,
  LoaderCircle,
  Music2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "../../app/drinks";
import {
  DRINK_PALETTES,
  GLASS_LABELS,
  GLASS_SHAPES,
  recipeFor,
} from "../../app/recipes";
import type { TavernController } from "../../app/useTavernController";
import { GlassIcon } from "./GlassIcon";
import { getLang, t } from "../../i18n";
import { isSpotifyTrack } from "../../storage";

/**
 * The drink menu: playlists are menu sections, songs are drinks with the
 * duration set like a price. Opens over the scene as a sheet of smoked glass.
 */
export function MenuDrawer({
  model,
  open,
  onClose,
}: {
  model: TavernController;
  open: boolean;
  onClose: () => void;
}) {
  const {
    playlists,
    selectedPlaylist,
    setSelectedPlaylistId,
    newPlaylistName,
    setNewPlaylistName,
    addPlaylist,
    renamePlaylistTo,
    removePlaylist,
    searchTerm,
    setSearchTerm,
    visibleTrackIds,
    trackMap,
    currentTrackId,
    isPlaying,
    playTrack,
    editingTrack,
    setEditingTrackId,
    setDraggedTrackId,
    reorderTrack,
    dropTargetId,
    setDropTargetId,
    fileInputRef,
    configInputRef,
    exportConfig,
    isGuest,
    spotifyLoading,
    refreshSpotifyPlaylist,
    setSpotifyPanelOpen,
    isPlayable,
  } = model;
  const spotifyPage = selectedPlaylist?.spotify;
  const spotifyBusy = Boolean(selectedPlaylist && spotifyLoading.includes(selectedPlaylist.id));
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setRenaming(false);
    setConfirmDelete(false);
  }, [selectedPlaylist?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (editingTrack) setEditingTrackId(undefined);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, editingTrack, onClose, setEditingTrackId]);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel) panel.inert = !open;
    if (open)
      panel
        ?.querySelector<HTMLElement>(".menu-search input")
        ?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <div
        className={`menu-scrim ${open ? "is-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        className={`menu-drawer ${open ? "is-open" : ""}`}
        aria-label={t("酒单")}
        aria-hidden={!open}
      >
        {editingTrack ? (
          <DrinkEditor model={model} />
        ) : (
          <>
            <header className="menu-head">
              <div>
                <p className="menu-eyebrow">{t("CARTE DU SOIR · 今夜酒单")}</p>
                <h2>{t("酒单")}</h2>
              </div>
              <button
                className="brass-button small"
                aria-label={t("关闭酒单")}
                data-tip={t("收起 · Esc")}
                onClick={onClose}
              >
                <X size={17} />
              </button>
            </header>

            <nav className="menu-sections" aria-label={t("歌单分区")}>
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  className={`menu-section ${playlist.id === selectedPlaylist?.id ? "is-active" : ""} ${playlist.spotify ? "is-spotify" : ""}`}
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                  aria-pressed={playlist.id === selectedPlaylist?.id}
                  data-tip={playlist.spotify ? t("Spotify 歌单") : undefined}
                >
                  {playlist.spotify ? (
                    <Music2 size={12} className="spotify-mark" aria-hidden="true" />
                  ) : (
                    <span className="wax" aria-hidden="true" />
                  )}
                  <strong>{t(playlist.name)}</strong>
                  <small>{playlist.trackIds.length}</small>
                </button>
              ))}
              {isGuest ? null : adding ? (
                <span className="menu-new">
                  <input
                    autoFocus
                    value={newPlaylistName}
                    placeholder={t("新菜单名")}
                    aria-label={t("新菜单名")}
                    onChange={(event) => setNewPlaylistName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addPlaylist();
                        setAdding(false);
                      }
                      if (event.key === "Escape") setAdding(false);
                    }}
                    onBlur={() => !newPlaylistName && setAdding(false)}
                  />
                  <button
                    aria-label={t("创建歌单")}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      addPlaylist();
                      setAdding(false);
                    }}
                  >
                    <Check size={15} />
                  </button>
                </span>
              ) : (
                <button
                  className="menu-section add"
                  onClick={() => setAdding(true)}
                  aria-label={t("新建歌单")}
                  data-tip={t("新开一页菜单")}
                >
                  <Plus size={15} />
                </button>
              )}
            </nav>

            {selectedPlaylist && (
              <div className="menu-section-head">
                {renaming ? (
                  <form
                    className="menu-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      renamePlaylistTo(selectedPlaylist.id, renameValue);
                      setRenaming(false);
                    }}
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      aria-label={t("菜单名称")}
                      onChange={(event) => setRenameValue(event.target.value)}
                    />
                    <button type="submit" aria-label={t("保存菜单名称")}>
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={t("取消改名")}
                      onClick={() => setRenaming(false)}
                    >
                      <X size={15} />
                    </button>
                  </form>
                ) : confirmDelete ? (
                  <div className="menu-confirm">
                    <span>
                      {selectedPlaylist.spotify
                        ? t("撕下「{name}」？Spotify 上的歌单不受影响。", { name: selectedPlaylist.name })
                        : t("撕下「{name}」？歌曲仍留在酒窖。", { name: t(selectedPlaylist.name) })}
                    </span>
                    <button
                      className="danger"
                      onClick={() => {
                        removePlaylist(selectedPlaylist.id);
                        setConfirmDelete(false);
                      }}
                    >
                      {t("撕下")}
                    </button>
                    <button onClick={() => setConfirmDelete(false)}>
                      {t("留着")}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="menu-mood">
                      {t(selectedPlaylist.mood || "这一页还没有题词。")}
                    </p>
                    {spotifyPage && (
                      <a
                        className="ghost-icon"
                        href={spotifyPage.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t("在 Spotify 打开这个歌单")}
                        data-tip={t("在 Spotify 打开")}
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {spotifyPage && !isGuest && (
                      <button
                        className="ghost-icon"
                        aria-label={t("从 Spotify 重新取歌")}
                        data-tip={t("从 Spotify 刷新")}
                        disabled={spotifyBusy}
                        onClick={() => {
                          if (model.spotify.account.status === "ok")
                            void refreshSpotifyPlaylist(selectedPlaylist.id);
                          else setSpotifyPanelOpen(true);
                        }}
                      >
                        <RefreshCw size={14} className={spotifyBusy ? "spin" : ""} />
                      </button>
                    )}
                    {!isGuest && (
                      <>
                    <button
                      className="ghost-icon"
                      aria-label={t("重命名歌单")}
                      data-tip={t("改名")}
                      onClick={() => {
                        setRenameValue(selectedPlaylist.name);
                        setRenaming(true);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="ghost-icon"
                      aria-label={t("删除歌单")}
                      data-tip={t("撕下这页")}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 size={14} />
                    </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            <label className="menu-search">
              <Search size={15} />
              <input
                value={searchTerm}
                placeholder={t("搜索饮品 / 调酒师 / 口味")}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              {searchTerm && (
                <button aria-label={t("清除搜索")} onClick={() => setSearchTerm("")}>
                  <X size={14} />
                </button>
              )}
            </label>

            <ol className="drink-list">
              {!visibleTrackIds.length && spotifyPage && !searchTerm ? (
                <li className="drink-empty">
                  <button
                    onClick={() => !isGuest && !spotifyBusy && setSpotifyPanelOpen(true)}
                  >
                    {spotifyBusy ? <LoaderCircle size={30} className="spin" /> : <Music2 size={30} />}
                    <strong>
                      {spotifyBusy
                        ? t("正在从 Spotify 取歌……")
                        : !isGuest && model.spotify.account.status !== "ok"
                          ? t("连上 Spotify 后，这页会自动上酒")
                          : t("这个歌单里还没有能播放的歌")}
                    </strong>
                    <span>
                      {isGuest
                        ? t("等房主那边取好歌。")
                        : t("歌单内容跟着 Spotify 走：在 Spotify 里加歌，回来点刷新。")}
                    </span>
                  </button>
                </li>
              ) : !visibleTrackIds.length ? (
                <li className="drink-empty">
                  <button
                    onClick={() => !isGuest && fileInputRef.current?.click()}
                  >
                    <svg
                      viewBox="0 0 24 32"
                      width="34"
                      height="46"
                      aria-hidden="true"
                    >
                      <path d="M5 3h14l-1.5 10Q12 18 6.5 13Z M12 16v11 M7 28h10" />
                    </svg>
                    <strong>
                      {searchTerm ? t("没有找到这款酒") : t("这页菜单还没写字")}
                    </strong>
                    <span>
                      {searchTerm
                        ? t("换个关键词，或清空搜索。")
                        : isGuest
                          ? t("房主还没往这页菜单里放歌。")
                          : t("拖入 MP3、WAV、OGG 或 FLAC，或点这里添加本地歌曲。")}
                    </span>
                  </button>
                </li>
              ) : (
                visibleTrackIds.map((trackId, index) => {
                  const track = trackMap.get(trackId);
                  if (!track) return null;
                  const recipe = recipeFor(track);
                  const active = track.id === currentTrackId;
                  const fromSpotify = isSpotifyTrack(track);
                  const offline = fromSpotify && !isGuest && !isPlayable(track);
                  return (
                    <li
                      key={track.id}
                      className={`drink-row ${active ? "is-active" : ""} ${track.status === "missing" || offline ? "is-missing" : ""} ${dropTargetId === track.id ? "is-drop" : ""}`}
                      draggable={!isGuest && !spotifyPage}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", track.id);
                        setDraggedTrackId(track.id);
                      }}
                      onDragEnd={() => {
                        setDraggedTrackId(undefined);
                        setDropTargetId(undefined);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDropTargetId(track.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        reorderTrack(track.id);
                      }}
                    >
                      <button
                        className="drink-main"
                        onClick={() => playTrack(track.id)}
                        aria-current={active ? "true" : undefined}
                      >
                        <span className="drink-no">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <GlassIcon recipe={recipe} />
                        <span className="drink-text">
                          <span className="drink-line">
                            <strong>{track.alias || track.title}</strong>
                            <i className="leader" aria-hidden="true" />
                            <span className="drink-price">
                              {formatTime(track.duration)}
                            </span>
                          </span>
                          <span className="drink-sub">
                            {t("调酒师 {name}", { name: track.artist })}
                            {track.album ? ` · ${t("产地 {name}", { name: track.album })}` : ""}
                          </span>
                          <span className="drink-tags">
                            {active && (
                              <span
                                className={`pouring ${isPlaying ? "on" : ""}`}
                                aria-hidden="true"
                              >
                                <i />
                                <i />
                                <i />
                              </span>
                            )}
                            {track.tags.map((tag) => (
                              <em key={tag}>{t(tag)}</em>
                            ))}
                            {track.status === "missing" && (
                              <em className="warn">
                                {isGuest ? t("房主缺原酒") : t("需重新导入")}
                              </em>
                            )}
                            {offline && <em className="warn">{t("Spotify 未连接")}</em>}
                          </span>
                        </span>
                      </button>
                      {fromSpotify && track.spotifyUrl && (
                        <a
                          className="ghost-icon edit"
                          href={track.spotifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t("在 Spotify 打开这首歌")}
                          data-tip={t("在 Spotify 打开")}
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      {!isGuest && !fromSpotify && (
                        <button
                          className="ghost-icon edit"
                          aria-label={t("编辑歌曲信息")}
                          data-tip={t("调酒笔记")}
                          onClick={() => setEditingTrackId(track.id)}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      <span className="drag-handle" aria-hidden="true">
                        <GripVertical size={15} />
                      </span>
                    </li>
                  );
                })
              )}
            </ol>

            {!isGuest && (
            <footer className="menu-foot">
              <button onClick={() => fileInputRef.current?.click()}>
                <Upload size={15} /> {t("添加歌曲")}
              </button>
              <button onClick={() => setSpotifyPanelOpen(true)}>
                <Music2 size={15} /> {t("Spotify 歌单")}
              </button>
              <button onClick={() => configInputRef.current?.click()}>
                <FileUp size={15} /> {t("导入菜单")}
              </button>
              <button onClick={exportConfig}>
                <FileDown size={15} /> {t("导出菜单")}
              </button>
            </footer>
            )}
          </>
        )}
      </aside>
    </>
  );
}

function DrinkEditor({ model }: { model: TavernController }) {
  const {
    editingTrack,
    updateTrack,
    setEditingTrackId,
    playlists,
    toggleTrackInPlaylist,
  } = model;
  const [tagText, setTagText] = useState(editingTrack?.tags.join(", ") ?? "");
  useEffect(
    () => setTagText(editingTrack?.tags.join(", ") ?? ""),
    [editingTrack?.id],
  );
  const recipe = useMemo(
    () => (editingTrack ? recipeFor(editingTrack) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingTrack, getLang()],
  );
  if (!editingTrack || !recipe) return null;
  return (
    <div className="drink-editor">
      <header className="menu-head">
        <button
          className="brass-button small"
          aria-label={t("关闭编辑")}
          data-tip={t("回到酒单")}
          onClick={() => setEditingTrackId(undefined)}
        >
          <ArrowLeft size={17} />
        </button>
        <div>
          <p className="menu-eyebrow">{t("调酒笔记 · BARTENDER'S NOTE")}</p>
          <h2 title={editingTrack.title}>
            {editingTrack.alias || editingTrack.title}
          </h2>
        </div>
        <span className="editor-glass">
          <GlassIcon recipe={recipe} size={30} />
        </span>
      </header>
      <label className="note-field">
        <span>{t("饮品别名")}</span>
        <input
          aria-label={t("饮品别名")}
          value={editingTrack.alias}
          placeholder={editingTrack.title}
          onChange={(event) =>
            updateTrack(editingTrack.id, { alias: event.target.value })
          }
        />
      </label>
      <label className="note-field">
        <span>{t("口味标签")}</span>
        <input
          aria-label={t("口味标签")}
          value={tagText}
          placeholder={t("烈酒, 低语, 午夜")}
          onChange={(event) => {
            setTagText(event.target.value);
            updateTrack(editingTrack.id, {
              tags: event.target.value
                .split(/[,，、]/)
                .map((tag) => tag.trim())
                .filter(Boolean)
                .slice(0, 8),
            });
          }}
        />
        <small>
          {t("标签会改变酒色：烈/红 → 深红，甜/金 → 金黄，午夜/低语 → 紫黑，柔/蓝 → 透蓝，苦/烟 → 烟灰。")}
        </small>
      </label>
      <fieldset className="note-field">
        <legend>{t("杯型")}</legend>
        <div className="shape-picker">
          <button
            className={!editingTrack.glass ? "is-active" : ""}
            aria-pressed={!editingTrack.glass}
            onClick={() => updateTrack(editingTrack.id, { glass: undefined })}
          >
            {t("自动")}
          </button>
          {GLASS_SHAPES.map((shape) => (
            <button
              key={shape}
              className={editingTrack.glass === shape ? "is-active" : ""}
              aria-pressed={editingTrack.glass === shape}
              aria-label={t(GLASS_LABELS[shape])}
              data-tip={t(GLASS_LABELS[shape])}
              onClick={() => updateTrack(editingTrack.id, { glass: shape })}
            >
              <GlassIcon recipe={{ ...recipe, shape }} size={18} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="note-field">
        <legend>{t("酒色")}</legend>
        <div className="tint-picker">
          <button
            className={!editingTrack.tint ? "is-active auto" : "auto"}
            aria-pressed={!editingTrack.tint}
            onClick={() => updateTrack(editingTrack.id, { tint: undefined })}
          >
            {t("按标签")}
          </button>
          {DRINK_PALETTES.map((palette) => (
            <button
              key={palette.key}
              className={editingTrack.tint === palette.key ? "is-active" : ""}
              aria-pressed={editingTrack.tint === palette.key}
              aria-label={t(palette.label)}
              data-tip={t(palette.label)}
              style={{
                background: `radial-gradient(circle at 35% 30%, ${palette.top}, ${palette.deep})`,
              }}
              onClick={() =>
                updateTrack(editingTrack.id, { tint: palette.key })
              }
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="note-field">
        <legend>{t("放入菜单")}</legend>
        <div className="playlist-checks">
          {playlists.filter((playlist) => !playlist.spotify).map((playlist) => (
            <label key={playlist.id}>
              <input
                type="checkbox"
                checked={playlist.trackIds.includes(editingTrack.id)}
                onChange={() =>
                  toggleTrackInPlaylist(playlist.id, editingTrack.id)
                }
              />
              <span>{t(playlist.name)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <dl className="note-meta">
        <div>
          <dt>{t("原曲名")}</dt>
          <dd>{editingTrack.title}</dd>
        </div>
        <div>
          <dt>{t("文件")}</dt>
          <dd>{editingTrack.fileName}</dd>
        </div>
        <div>
          <dt>{t("大小")}</dt>
          <dd>{(editingTrack.fileSize / 1024 / 1024).toFixed(2)} MB</dd>
        </div>
        <div>
          <dt>{t("状态")}</dt>
          <dd>
            {editingTrack.status === "ready"
              ? editingTrack.stored
                ? t("已存入本地酒窖")
                : t("仅本次会话可播")
              : t("待重新导入")}
          </dd>
        </div>
      </dl>
    </div>
  );
}
