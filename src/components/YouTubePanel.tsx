import {
  AlertTriangle,
  Check,
  ExternalLink,
  Link2,
  LoaderCircle,
  MonitorPlay,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TavernController } from "../app/useTavernController";
import {
  fetchYouTubeMeta,
  MAX_PLAYLIST,
  parseYouTubeLink,
  readPlaylistIds,
  toItems,
  youtubePlaylistUrl,
} from "../integrations/youtube/catalog";
import { loadYouTubeApi, PLAYER_VARS, type YTPlayer } from "../integrations/youtube/player";
import { YOUTUBE_KEEP_MS } from "../storage";
import { IntegrationDialog } from "./IntegrationDialog";
import { t } from "../i18n";

const DAY = 24 * 3600 * 1000;

/**
 * Put YouTube on the bar: paste a playlist (it becomes a menu page) or a
 * single video (it goes onto 「YouTube 点歌」). Reading a playlist happens in
 * a small visible player here, without playing anything.
 */
export function YouTubePanel({ model, onClose }: { model: TavernController; onClose: () => void }) {
  const {
    playlists,
    linkYouTube,
    addYouTubeVideo,
    youtubeRefreshId,
    setYouTubeRefreshId,
    setSelectedPlaylistId,
  } = model;
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const previewHost = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer>();
  const pages = playlists.filter((playlist) => playlist.youtube);

  useEffect(() => () => player.current?.destroy(), []);

  /** The small reading player (visible, never plays). */
  const readingPlayer = async () => {
    if (player.current) return player.current;
    setPreview(true);
    await loadYouTubeApi();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return new Promise<YTPlayer>((resolve, reject) => {
      const host = previewHost.current;
      if (!host) return reject(new Error("no host"));
      const mount = document.createElement("div");
      host.replaceChildren(mount);
      const timer = window.setTimeout(() => reject(new Error("timeout")), 20_000);
      const created = new window.YT!.Player(mount, {
        width: "100%",
        height: "100%",
        playerVars: PLAYER_VARS,
        events: {
          onReady: () => {
            window.clearTimeout(timer);
            player.current = created;
            resolve(created);
          },
        },
      });
    });
  };

  const readList = async (list: string, pageId?: string) => {
    setBusy(t("正在读取 YouTube 歌单……"));
    setMessage("");
    try {
      const reader = await readingPlayer();
      const ids = await readPlaylistIds(reader, list);
      if (!ids.length) {
        setMessage(t("读不到这个歌单：它可能是私密的，或者链接不完整。"));
        return;
      }
      setBusy(t("正在给 {n} 个视频写上名字……", { n: ids.length }));
      const meta = await fetchYouTubeMeta(ids, list);
      const items = toItems(ids, meta);
      const existing = pageId ? playlists.find((playlist) => playlist.id === pageId) : undefined;
      linkYouTube(
        { list, url: youtubePlaylistUrl(list), items, fetchedAt: Date.now() },
        existing?.name || meta.list?.title || "YouTube 歌单",
        pageId,
      );
      onClose();
    } catch {
      setMessage(t("YouTube 播放器没加载出来：检查网络，或暂时关掉拦截广告的扩展。"));
    } finally {
      setBusy("");
    }
  };

  const addVideo = async (id: string) => {
    setBusy(t("正在查看这个视频……"));
    setMessage("");
    try {
      const meta = await fetchYouTubeMeta([id]);
      const info = meta.videos[id];
      if (info === null) {
        setMessage(t("这个视频已被删除，或者是私密的。"));
        return;
      }
      if (info?.blocked) {
        setMessage(t("这个视频的作者不允许在别的网站播放，换一个吧。"));
        return;
      }
      addYouTubeVideo({ id, title: info?.title ?? "", author: info?.author ?? "", duration: 0 });
      onClose();
    } finally {
      setBusy("");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseYouTubeLink(link);
    if (!parsed) {
      setMessage(t("认不出这个链接：复制 YouTube 地址栏里的网址，或歌单 / 视频的「分享」链接。"));
      return;
    }
    if (parsed.list) void readList(parsed.list);
    else if (parsed.video) void addVideo(parsed.video);
  };

  // opened from the menu's refresh button: read that page again right away
  useEffect(() => {
    if (!youtubeRefreshId) return;
    const page = playlists.find((playlist) => playlist.id === youtubeRefreshId);
    setYouTubeRefreshId(undefined);
    if (page?.youtube?.list) void readList(page.youtube.list, page.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <IntegrationDialog title={t("YouTube 歌单")} eyebrow="YOUTUBE · NO ACCOUNT NEEDED" onClose={onClose}>
      <div className="integration-status">
        <MonitorPlay size={28} />
        <div>
          <strong>{t("把 YouTube 歌单放上吧台")}</strong>
          <small>{t("不用账号，同席的朋友也不用：每个人在自己的浏览器里看，酒馆把大家对齐到同一秒。")}</small>
        </div>
      </div>
      <form className="spotify-paste" onSubmit={submit}>
        <Link2 size={15} />
        <input
          value={link}
          placeholder={t("粘贴 YouTube 歌单或视频链接")}
          aria-label={t("YouTube 链接")}
          onChange={(event) => setLink(event.target.value)}
          disabled={Boolean(busy)}
        />
        <button className="commit-note" type="submit" disabled={Boolean(busy) || !link.trim()}>
          {busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}
          {t("放上吧台")}
        </button>
      </form>
      {busy && (
        <p className="room-progress">
          <LoaderCircle size={16} className="spin" />
          {busy}
        </p>
      )}
      {message && <p className="spotify-error">{message}</p>}
      <div className={`youtube-preview ${preview ? "" : "is-idle"}`} aria-hidden={!preview}>
        <div ref={previewHost} className="youtube-mount" />
      </div>

      {pages.length > 0 && (
        <section className="spotify-picker" aria-label={t("酒单里的 YouTube 页")}>
          <header>
            <strong>{t("酒单里的 YouTube 页")}</strong>
          </header>
          <ul className="spotify-list">
            {pages.map((page) => {
              const link = page.youtube!;
              const days = Math.floor((Date.now() - link.fetchedAt) / DAY);
              const expired = !link.items.length && link.fetchedAt > 0 && Date.now() - link.fetchedAt >= YOUTUBE_KEEP_MS;
              return (
                <li key={page.id}>
                  <span className="spotify-cover youtube" aria-hidden="true">
                    <MonitorPlay size={18} />
                  </span>
                  <span className="spotify-row-text">
                    <strong>{t(page.name)}</strong>
                    <small>
                      {expired
                        ? t("资料已过期，需要重新读取")
                        : t("{n} 个视频 · {when}", {
                            n: link.items.length,
                            when: days < 1 ? t("今天读取") : t("{d} 天前读取", { d: days }),
                          })}
                    </small>
                  </span>
                  {link.list && (
                    <button
                      className="cellar-command"
                      disabled={Boolean(busy)}
                      onClick={() => void readList(link.list!, page.id)}
                    >
                      <RefreshCw size={14} />
                      {t("刷新")}
                    </button>
                  )}
                  <button
                    className="cellar-command"
                    onClick={() => {
                      setSelectedPlaylistId(page.id);
                      onClose();
                    }}
                  >
                    <Check size={14} />
                    {t("去看看")}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ul className="room-explain">
        <li>{t("吧台右下角会出现一块 YouTube 小屏幕：YouTube 规定播放器必须看得见，不能只放声音。")}</li>
        <li>{t("YouTube 可能会插播广告（每个人各自的），广告播完酒馆会自动追上进度。")}</li>
        <li>{t("有些视频的作者不允许在别的网站播放，轮到它时会自动跳过。")}</li>
        <li>
          {t("一个歌单最多读前 {n} 个视频。YouTube 规定读到的资料最多保存 30 天，过期后点「刷新」重新读取。", {
            n: MAX_PLAYLIST,
          })}
        </li>
      </ul>
      <p className="integration-note">
        <ShieldCheck size={16} />
        <span>
          {t("视频由 YouTube 提供，直接在你的浏览器里播放，酒馆不下载、不转播。使用即表示同意")}{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">
            {t("YouTube 服务条款")}
            <ExternalLink size={11} />
          </a>
          {t("，并适用")}{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            {t("Google 隐私权政策")}
            <ExternalLink size={11} />
          </a>
          {t("。")}
        </span>
      </p>
      {!pages.length && (
        <p className="integration-note">
          <AlertTriangle size={16} />
          {t("可以粘贴歌单链接（含 list=），也可以粘贴单个视频，单个视频会放进「YouTube 点歌」页。")}
        </p>
      )}
    </IntegrationDialog>
  );
}
