import {
  AlertTriangle,
  Check,
  Clapperboard,
  ExternalLink,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { TavernController } from "../app/useTavernController";
import {
  bilibiliSeasonUrl,
  looksLikeBilibili,
  MAX_BILIBILI,
  readBilibili,
  type BilibiliProblem,
  type BilibiliRead,
} from "../integrations/bilibili/catalog";
import { launcherName } from "../config";
import { IntegrationDialog } from "./IntegrationDialog";
import { t } from "../i18n";

const DAY = 24 * 3600 * 1000;

function problemText(problem: BilibiliProblem) {
  switch (problem) {
    case "missing":
      return t("B站说这个视频 / 列表不存在了（被删、设为私密或还在审核）。");
    case "private":
      return t("这个收藏夹是私密的：在 B站把它设为公开，再粘贴一次。");
    case "limited":
      return t("B站暂时拒绝了读取（访问太频繁），过一两分钟再试。");
    case "offline":
      return t("连不上 B站：检查这台电脑的网络。");
    case "unsupported":
      return t("认不出这个链接：粘贴视频、合集、系列或公开收藏夹的链接（也可以是 b23.tv 分享链接）。付费视频和番剧放不了。");
    case "server":
      return t("读取 B站需要用「{launcher}」打开酒馆（开发模式读不了）。", { launcher: launcherName });
    default:
      return t("读取 B站时出错了，过一会儿再试。");
  }
}

const kindName = (kind: BilibiliRead["kind"]) =>
  kind === "season"
    ? t("合集")
    : kind === "series"
      ? t("系列")
      : kind === "favorites"
        ? t("收藏夹")
        : kind === "parts"
          ? t("分P视频")
          : t("视频");

/**
 * Put Bilibili on the bar: paste a video (it goes onto 「B站点歌」), or a
 * collection / series / public favourites folder / many-part video (it
 * becomes a menu page). Bilibili's embedded player plays them, at the
 * quality Bilibili allows for embeds.
 */
export function BilibiliPanel({ model, onClose }: { model: TavernController; onClose: () => void }) {
  const { playlists, linkBilibili, addBilibiliVideo, bilibiliRefreshId, setBilibiliRefreshId, setSelectedPlaylistId } =
    model;
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  /** A single video that belongs to a collection: offer the whole collection. */
  const [season, setSeason] = useState<BilibiliRead["season"]>();
  const pages = playlists.filter((playlist) => playlist.bilibili);

  const take = (read: BilibiliRead, pageId?: string) => {
    if (!read.items.length) {
      setMessage(t("这个列表里没有能放的视频。"));
      return false;
    }
    if (read.kind === "video" && !pageId) {
      addBilibiliVideo(read.items[0]);
      return true;
    }
    const existing = pageId ? playlists.find((playlist) => playlist.id === pageId) : undefined;
    linkBilibili(
      {
        kind: read.kind === "video" ? "parts" : read.kind,
        id: read.id,
        ...(read.mid ? { mid: read.mid } : {}),
        url: read.url,
        items: read.items,
        fetchedAt: Date.now(),
      },
      existing?.name || read.title || "B站歌单",
      pageId,
    );
    return true;
  };

  const read = async (text: string, pageId?: string) => {
    setBusy(t("正在读取 B站……"));
    setMessage("");
    setSeason(undefined);
    try {
      const answer = await readBilibili(text);
      if (!answer.ok) {
        setMessage(problemText(answer.problem));
        return;
      }
      const result = answer.result;
      const done = take(result, pageId);
      if (!done) return;
      if (result.kind === "video" && result.season && result.season.count > 1 && !pageId) {
        // keep the panel open to offer the whole collection
        setSeason(result.season);
        setLink("");
        return;
      }
      onClose();
    } finally {
      setBusy("");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!looksLikeBilibili(link)) {
      setMessage(problemText("unsupported"));
      return;
    }
    void read(link.trim());
  };

  // opened from the menu's refresh button: read that page again right away
  useEffect(() => {
    if (!bilibiliRefreshId) return;
    const page = playlists.find((playlist) => playlist.id === bilibiliRefreshId);
    setBilibiliRefreshId(undefined);
    if (page?.bilibili && page.bilibili.kind !== "picks") void read(page.bilibili.url, page.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <IntegrationDialog title={t("B站歌单")} eyebrow="BILIBILI · NO ACCOUNT NEEDED" onClose={onClose}>
      <div className="integration-status">
        <Clapperboard size={28} />
        <div>
          <strong>{t("把 B站视频放上吧台")}</strong>
          <small>{t("不用登录，同席的朋友也不用：每个人在自己的浏览器里看，酒馆帮大家对齐进度。")}</small>
        </div>
      </div>
      <form className="spotify-paste" onSubmit={submit}>
        <Link2 size={15} />
        <input
          value={link}
          placeholder={t("粘贴 B站视频、合集或收藏夹链接")}
          aria-label={t("B站链接")}
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
      {season && (
        <div className="integration-note bilibili-season">
          <Check size={16} />
          <span>
            {t("已加进「B站点歌」。它属于合集「{title}」（{n} 个视频）。", { title: season.title, n: season.count })}{" "}
            <button
              className="cellar-command"
              disabled={Boolean(busy)}
              onClick={() => void read(bilibiliSeasonUrl(season.id, season.mid))}
            >
              <Plus size={14} />
              {t("整个合集放上吧台")}
            </button>
          </span>
        </div>
      )}

      {pages.length > 0 && (
        <section className="spotify-picker" aria-label={t("酒单里的 B站页")}>
          <header>
            <strong>{t("酒单里的 B站页")}</strong>
          </header>
          <ul className="spotify-list">
            {pages.map((page) => {
              const linked = page.bilibili!;
              const days = Math.floor((Date.now() - linked.fetchedAt) / DAY);
              return (
                <li key={page.id}>
                  <span className="spotify-cover bilibili" aria-hidden="true">
                    <Clapperboard size={18} />
                  </span>
                  <span className="spotify-row-text">
                    <strong>{t(page.name)}</strong>
                    <small>
                      {linked.kind === "picks"
                        ? t("{n} 个视频", { n: linked.items.length })
                        : t("{kind} · {n} 个视频 · {when}", {
                            kind: kindName(linked.kind),
                            n: linked.items.length,
                            when: days < 1 ? t("今天读取") : t("{d} 天前读取", { d: days }),
                          })}
                    </small>
                  </span>
                  {linked.kind !== "picks" && (
                    <button
                      className="cellar-command"
                      disabled={Boolean(busy)}
                      onClick={() => void read(linked.url, page.id)}
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
        <li>{t("吧台右下角会出现一块 B站小屏幕，视频在里面播放。")}</li>
        <li>
          {t("B站给外链播放器的画质上限是 360P（登录了也一样，这是 B站的规定）。想看高清，点小屏幕上的「在 B站打开」。")}
        </li>
        <li>{t("音量请用电脑的音量键调：B站播放器不让网页调它的音量。")}</li>
        <li>{t("请用酒馆的播放 / 暂停 / 拖动来控制，大家才会同步；B站播放器里按的不会同步给同席。")}</li>
        <li>{t("收藏夹要设为公开才读得到。一个页面最多读前 {n} 个视频。", { n: MAX_BILIBILI })}</li>
      </ul>
      <p className="integration-note">
        <ShieldCheck size={16} />
        <span>
          {t("视频由 B站提供，直接在你的浏览器里播放，酒馆不下载、不转播。")}{" "}
          <a href="https://www.bilibili.com/protocal/licence.html" target="_blank" rel="noreferrer">
            {t("B站用户协议")}
            <ExternalLink size={11} />
          </a>
        </span>
      </p>
      {!pages.length && (
        <p className="integration-note">
          <AlertTriangle size={16} />
          {t("单个视频会放进「B站点歌」页；合集、系列、收藏夹和分P视频会各自变成一页。")}
        </p>
      )}
    </IntegrationDialog>
  );
}
