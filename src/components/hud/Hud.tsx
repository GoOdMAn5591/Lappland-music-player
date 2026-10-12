import {
  AlertTriangle,
  Database,
  ExternalLink,
  LogIn,
  FileDown,
  FileUp,
  ListMusic,
  MonitorPlay,
  Music2,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Upload,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TavernController } from "../../app/useTavernController";
import { recipeFor } from "../../app/recipes";
import { BarProgress } from "./BarProgress";
import { VolumeGauge } from "./VolumeGauge";
import type { FrameBus } from "./frameBus";
import type { Quality } from "../../scene3d/post";
import { listJoin, setLang, t, useLang } from "../../i18n";
import { setPowerSaver, usePowerSaver } from "../../power";
import { isSpotifyTrack } from "../../storage";
import { spotifyProblemText } from "../../integrations/spotify/session";

const QUALITY_OPTIONS: [Quality | "auto", string][] = [
  ["auto", "自动"],
  ["high", "高"],
  ["medium", "中"],
  ["low", "低"],
];

function Monogram() {
  return (
    <svg className="monogram" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" className="mono-ring" />
      <circle cx="24" cy="24" r="18.5" className="mono-ring thin" />
      <path
        className="mono-ears"
        d="M14 20 L17.5 9.5 L22 17 M26 17 L30.5 9.5 L34 20"
      />
      <path
        className="mono-glass"
        d="M16.5 19 H31.5 L28.5 27.5 Q24 31 19.5 27.5 Z M24 30 V37 M19.5 37.5 H28.5"
      />
      <path
        className="mono-drink"
        d="M17.6 21.5 H30.4 L28.1 27 Q24 30 19.9 27 Z"
      />
    </svg>
  );
}

function ToolButton({
  tip,
  label,
  onClick,
  children,
  pressed,
}: {
  tip: string;
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      className="brass-button tool"
      data-tip={tip}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ModeIcon({ mode }: { mode: string }) {
  // Engraved marks for the four pouring orders.
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      aria-hidden="true"
      className="mode-icon"
    >
      {mode === "shuffle" ? (
        <path d="M3 7h3.5c4.5 0 6.5 10 11 10H21M3 17h3.5c1.6 0 2.8-1.3 3.9-3M14 9.8c1-1.6 2.1-2.8 3.5-2.8H21M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5" />
      ) : mode === "repeat-one" ? (
        <>
          <path d="M4 11V9a3 3 0 0 1 3-3h12M16.5 3.5 19 6l-2.5 2.5M20 13v2a3 3 0 0 1-3 3H5M7.5 20.5 5 18l2.5-2.5" />
          <path d="M11.3 10.4 12.6 9.6v5" />
        </>
      ) : mode === "repeat-all" ? (
        <path d="M4 11V9a3 3 0 0 1 3-3h12M16.5 3.5 19 6l-2.5 2.5M20 13v2a3 3 0 0 1-3 3H5M7.5 20.5 5 18l2.5-2.5" />
      ) : (
        <path d="M4 8h12M4 12h9M4 16h6M17 11v8M14.5 16.5 17 19l2.5-2.5" />
      )}
    </svg>
  );
}

const MODE_LABEL: Record<string, string> = {
  sequence: "顺序传杯",
  shuffle: "随机上酒",
  "repeat-all": "吧台轮转",
  "repeat-one": "单杯续杯",
};

function StatusToast({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 5200);
    return () => window.clearTimeout(timer);
  }, [text]);
  return (
    <p
      className={`status-toast ${visible ? "is-visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span>{text}</span>
    </p>
  );
}

function MoreMenu({
  model,
  quality,
  onQuality,
}: {
  model: TavernController;
  quality: Quality | "auto";
  onQuality: (q: Quality | "auto") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lang = useLang();
  const powerSaver = usePowerSaver();
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = (
    label: string,
    icon: ReactNode,
    action: () => void,
    note?: string,
  ) => (
    <button
      role="menuitem"
      onClick={() => {
        setOpen(false);
        action();
      }}
    >
      {icon}
      <span>
        {label}
        {note && <small>{note}</small>}
      </span>
    </button>
  );
  return (
    <div className="more-menu" ref={ref}>
      <button
        className="brass-button tool"
        data-tip={t("更多 · 角色 / 来源 / 同席")}
        aria-label={t("更多选项")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="more-popover" role="menu">
          <div className="more-compact">
            {!model.isGuest &&
              item(t("导入菜单 JSON"), <FileUp size={17} />, () =>
                model.configInputRef.current?.click(),
              )}
            {!model.isGuest &&
              item(
                t("导出菜单 JSON"),
                <FileDown size={17} />,
                model.exportConfig,
                t("不含音频"),
              )}
            {!model.isGuest &&
              item(
                t("本地酒窖"),
                <Database size={17} />,
                () => model.setLibrarySettingsOpen(true),
                t("存储、备份与入场"),
              )}
            {item(t("角色构图与动画"), <SlidersHorizontal size={17} />, () =>
              model.setCharacterSettingsOpen(true),
            )}
          </div>
          {item(
            model.isGuest ? t("Spotify · 一起听") : t("Spotify 酒单"),
            <Music2 size={17} />,
            () => model.setSpotifyPanelOpen(true),
            model.spotify.account.status === "ok"
              ? t("已连接 · {name}", { name: model.spotify.account.profile?.name ?? "" })
              : model.isGuest
                ? t("用你自己的账号一起听")
                : model.spotify.clientId
                  ? t("点这里连接 Spotify")
                  : t("把你的 Spotify 歌单放上吧台"),
          )}
          {!model.isGuest &&
            item(
              t("YouTube 歌单"),
              <MonitorPlay size={17} />,
              () => model.setYouTubePanelOpen(true),
              t("不用账号，朋友也能一起看"),
            )}
          {item(
            t("同席 · 一起听"),
            <Users size={17} />,
            () => model.setMultiplayerPanelOpen(true),
            model.room.inRoom
              ? t("{n} 人在座", { n: model.room.members.length })
              : model.isGuest
                ? t("未入座")
                : t("开房间，朋友用链接入座"),
          )}
          <div className="quality-row" role="group" aria-label={t("性能模式")}>
            <span>
              {t("性能模式")}
              <small>{t("低画质 · 20 帧 · 切走后停止渲染")}</small>
            </span>
            <button
              className={powerSaver ? "is-active" : ""}
              aria-pressed={powerSaver}
              onClick={() => setPowerSaver(!powerSaver)}
            >
              {powerSaver ? t("开") : t("关")}
            </button>
          </div>
          <div
            className={`quality-row ${powerSaver ? "is-disabled" : ""}`}
            role="group"
            aria-label={t("画质")}
          >
            <span>{t("画质")}</span>
            {QUALITY_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                className={!powerSaver && quality === value ? "is-active" : ""}
                aria-pressed={!powerSaver && quality === value}
                disabled={powerSaver}
                onClick={() => onQuality(value)}
              >
                {t(label)}
              </button>
            ))}
          </div>
          <div className="quality-row" role="group" aria-label="语言 · Language">
            <span>语言 · Language</span>
            <button
              className={lang === "zh" ? "is-active" : ""}
              aria-pressed={lang === "zh"}
              lang="zh-CN"
              onClick={() => setLang("zh")}
            >
              中文
            </button>
            <button
              className={lang === "en" ? "is-active" : ""}
              aria-pressed={lang === "en"}
              lang="en"
              onClick={() => setLang("en")}
            >
              English
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A Spotify song on the counter: its cover, where it comes from and a link
 * back (Spotify requires all three while its music plays). For a friend at a
 * shared table it also says what's missing for them to hear it.
 */
function SpotifyCredit({ model }: { model: TavernController }) {
  const { currentTrack, isGuest, spotify, setSpotifyPanelOpen, isPlaying } = model;
  if (!currentTrack || !isSpotifyTrack(currentTrack)) return null;
  const { account, engine } = spotify;
  let hint = "";
  let action: { label: string; run: () => void } | undefined;
  if (isGuest) {
    if (!spotify.clientId) hint = t("房主的 Spotify 还没准备好");
    else if (!spotify.signedIn) {
      hint = t("这杯来自 Spotify，用你自己的 Spotify 登录就能一起听");
      action = { label: t("登录"), run: () => setSpotifyPanelOpen(true) };
    } else if (account.status === "not-registered") {
      hint = t("你的 Spotify 账号还没被房主加进名单");
      action = { label: t("查看"), run: () => setSpotifyPanelOpen(true) };
    } else if (engine.status === "error") {
      hint = spotifyProblemText(engine.problem);
      action = { label: t("查看"), run: () => setSpotifyPanelOpen(true) };
    } else if (engine.held && isPlaying) {
      hint = t("Spotify 正在你的其他设备上播放");
      action = { label: t("在这里听"), run: () => engine.retake() };
    } else if (engine.needsGesture && isPlaying) {
      hint = t("浏览器要你点一下才肯出声");
      action = { label: t("点我出声"), run: () => engine.activate() };
    }
  } else if (account.status !== "ok") {
    hint = t("Spotify 未连接");
    action = { label: t("连接"), run: () => setSpotifyPanelOpen(true) };
  } else if (engine.status === "error") {
    hint = spotifyProblemText(engine.problem);
    action = { label: t("查看"), run: () => setSpotifyPanelOpen(true) };
  }
  return (
    <div className="spotify-credit">
      {currentTrack.coverUrl && (
        <img src={currentTrack.coverUrl} alt={t("《{album}》封面", { album: currentTrack.album })} />
      )}
      <span className="spotify-credit-text">
        <span>
          {t("由 Spotify 提供")}
          {currentTrack.spotifyUrl && (
            <a href={currentTrack.spotifyUrl} target="_blank" rel="noreferrer">
              {t("在 Spotify 打开")}
              <ExternalLink size={11} />
            </a>
          )}
        </span>
        {hint && <small className="is-warn">{hint}</small>}
      </span>
      {action && (
        <button className="spotify-credit-action" onClick={action.run}>
          <LogIn size={13} />
          {action.label}
        </button>
      )}
    </div>
  );
}

export function Hud({
  model,
  bus,
  quality,
  onQuality,
  onOpenMenu,
}: {
  model: TavernController;
  bus: FrameBus;
  quality: Quality | "auto";
  onQuality: (quality: Quality | "auto") => void;
  onOpenMenu: () => void;
}) {
  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    playbackMode,
    volume,
    setVolume,
    togglePlay,
    playByOffset,
    cyclePlaybackMode,
    seek,
    carouselTrackIds,
    currentTrackId,
    fileInputRef,
    configInputRef,
    exportConfig,
    setLibrarySettingsOpen,
    setCharacterSettingsOpen,
    statusLine,
    tracks,
    room,
    isGuest,
  } = model;
  const lang = useLang();
  const recipe = useMemo(
    () => (currentTrack ? recipeFor(currentTrack) : undefined),
    [currentTrack, lang],
  );
  const index = currentTrackId ? carouselTrackIds.indexOf(currentTrackId) : -1;
  const empty = tracks.length === 0;
  const playable = isGuest ? currentTrack?.status === "ready" : model.isPlayable(currentTrack);
  const total = duration || currentTrack?.duration || 0;

  return (
    <>
      <header className="hud-top">
        <div className="brand">
          <Monogram />
          <div>
            <span className="brand-name">{t("无序酒馆")}</span>
            <span className="brand-sub">LAPPLAND · AFTER HOURS</span>
          </div>
        </div>
        <nav className="hud-tools" aria-label={t("酒馆工具")}>
          <ToolButton
            tip={t("酒单 · 歌单、搜索与调酒笔记")}
            label={t("打开酒单")}
            onClick={onOpenMenu}
          >
            <ListMusic size={18} />
          </ToolButton>
          {!isGuest && (
            <>
              <ToolButton
                tip={t("添加本地歌曲 · Ctrl/Cmd+O")}
                label={t("添加本地歌曲")}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={18} />
              </ToolButton>
              <ToolButton
                tip={t("导入菜单 JSON")}
                label={t("导入菜单配置")}
                onClick={() => configInputRef.current?.click()}
              >
                <FileUp size={18} />
              </ToolButton>
              <ToolButton
                tip={t("导出菜单 JSON（不含音频）")}
                label={t("导出菜单配置")}
                onClick={exportConfig}
              >
                <FileDown size={18} />
              </ToolButton>
              <ToolButton
                tip={t("本地酒窖 · 存储、备份与入场")}
                label={t("本地酒窖与入场设置")}
                onClick={() => setLibrarySettingsOpen(true)}
              >
                <Database size={18} />
              </ToolButton>
            </>
          )}
          <ToolButton
            tip={t("拉普兰德 · 构图与动作幅度")}
            label={t("角色构图与动画")}
            onClick={() => setCharacterSettingsOpen(true)}
          >
            <SlidersHorizontal size={18} />
          </ToolButton>
          {(room.inRoom || room.status === "opening") && (
            <button
              className={`room-chip ${room.connection === "open" ? "" : "is-reconnecting"}`}
              data-tip={
                room.connection === "open"
                  ? t("同席 · {names}", { names: listJoin(room.members.map((m) => m.name)) })
                  : t("同席 · 正在重新连接")
              }
              aria-label={t("同席房间，{n} 人在座", { n: room.members.length })}
              onClick={() => model.setMultiplayerPanelOpen(true)}
            >
              <Users size={16} />
              <span>{room.members.length || 1}</span>
            </button>
          )}
          <MoreMenu model={model} quality={quality} onQuality={onQuality} />
        </nav>
      </header>

      <button
        className="menu-tab"
        onClick={onOpenMenu}
        aria-label={t("打开酒单侧栏")}
      >
        <span className="menu-tab-seal" aria-hidden="true" />
        <span className="menu-tab-text">{t("酒单")}</span>
        <span className="menu-tab-latin">MENU</span>
      </button>

      <BarProgress
        bus={bus}
        progress={progress}
        duration={total}
        disabled={!playable}
        onSeek={seek}
      />

      <section
        className={`plaque ${empty ? "is-empty" : ""}`}
        aria-live="polite"
        aria-label={t("当前饮品")}
      >
        {empty ? (
          <>
            <p className="plaque-eyebrow">
              THE BAR IS NOW OPEN · YOU ARE MOST WELCOME
            </p>
            <h2 className="plaque-title">
              {isGuest ? t("等房主摆上酒杯") : t("吧台还空着")}
            </h2>
            <p className="plaque-meta">
              {isGuest
                ? room.inRoom
                  ? t("{host} 的吧台上还没有歌", { host: room.hostName })
                  : t("入座之后，就能和大家一起听")
                : t("把本地音乐拖进酒馆，或点下面的铜钮添加 · MP3 / WAV / OGG / FLAC")}
            </p>
          </>
        ) : (
          <>
            <p className="plaque-eyebrow">
              Nº {String(Math.max(0, index) + 1).padStart(2, "0")} /{" "}
              {String(carouselTrackIds.length).padStart(2, "0")}
              <span className="sep">·</span>
              {isPlaying ? "NOW POURING" : "ON THE COUNTER"}
              {recipe && (
                <>
                  <span className="sep">·</span>
                  {recipe.description}
                </>
              )}
            </p>
            <h2 className="plaque-title" title={currentTrack?.title}>
              {currentTrack
                ? currentTrack.alias || currentTrack.title
                : t("选一杯酒")}
            </h2>
            <p className="plaque-meta">
              <span>{t("调酒师 {name}", { name: currentTrack?.artist ?? "—" })}</span>
              {currentTrack?.album && (
                <span className="plaque-album">{t("产地 {name}", { name: currentTrack.album })}</span>
              )}
            </p>
            <div className="plaque-tags">
              {currentTrack?.tags.map((tag) => (
                <span key={tag}>{t(tag)}</span>
              ))}
              {currentTrack?.status === "missing" && (
                <span className="warn">
                  <AlertTriangle size={12} />{" "}
                  {isGuest ? t("房主缺原酒") : t("需重新导入")}
                </span>
              )}
              {currentTrack?.status === "ready" &&
                !currentTrack.stored &&
                !currentTrack.source &&
                !isGuest && (
                <span className="warn">{t("仅本次可播")}</span>
              )}
            </div>
          </>
        )}
      </section>

      <div className="transport" role="group" aria-label={t("播放控制")}>
        {empty && isGuest ? null : empty ? (
          <button
            className="pour-cta"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={18} />
            {t("添加歌曲")}
          </button>
        ) : (
          <>
            <button
              className={`brass-button mode mode-${playbackMode}`}
              data-tip={t("{mode} · 点击切换", { mode: t(MODE_LABEL[playbackMode]) })}
              aria-label={t("切换播放模式")}
              onClick={cyclePlaybackMode}
            >
              <ModeIcon mode={playbackMode} />
            </button>
            <button
              className="brass-button skip"
              data-tip={t("上一杯")}
              aria-label={t("上一首")}
              onClick={() => playByOffset(-1)}
            >
              <SkipBack size={19} />
            </button>
            <button
              className={`play-medallion ${isPlaying ? "is-playing" : ""}`}
              data-tip={isPlaying ? t("暂停 · 空格") : t("开席 · 空格")}
              aria-label={isPlaying ? t("暂停") : t("播放")}
              onClick={togglePlay}
            >
              <span className="medallion-ring" aria-hidden="true" />
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button
              className="brass-button skip"
              data-tip={t("下一杯")}
              aria-label={t("下一首")}
              onClick={() => playByOffset(1)}
            >
              <SkipForward size={19} />
            </button>
            <VolumeGauge volume={volume} onChange={setVolume} />
          </>
        )}
      </div>

      <SpotifyCredit model={model} />
      <StatusToast text={statusLine} />
    </>
  );
}
