import { ExternalLink, Lock, LockOpen, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { TavernController } from "../app/useTavernController";
import { bilibiliWatchUrl } from "../integrations/bilibili/catalog";
import { bilibiliKey, useBilibiliEngine } from "../integrations/bilibili/player";
import { isBilibiliTrack } from "../storage";
import { t } from "../i18n";

const SIZE_KEY = "tavern-bilibili-large";

function storedLarge() {
  try {
    return localStorage.getItem(SIZE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The little screen where Bilibili videos play, in the same corner as
 * YouTube's (only one of them shows at a time). A clear shield lies over
 * Bilibili's player so the bar's own buttons stay in charge; it can be
 * lifted to use the player itself (volume, a click to start the sound).
 */
export function BilibiliScreen({ model }: { model: TavernController }) {
  const engine = useBilibiliEngine();
  const [large, setLarge] = useState(storedLarge);
  const track = model.currentTrack;
  const active = isBilibiliTrack(track);
  const bvid = active ? (track!.bilibiliId ?? "") : "";
  const p = active ? (track!.bilibiliPage ?? 1) : 1;
  const showing = active && engine.isOn(bilibiliKey(bvid, p)) && Boolean(engine.src);
  const nonce = engine.nonce;

  // "no sound?" for the first moments after the sound should have begun
  const [justStarted, setJustStarted] = useState(false);
  const rolling = showing && engine.rolling;
  useEffect(() => {
    if (!rolling) return;
    setJustStarted(true);
    const timer = window.setTimeout(() => setJustStarted(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [rolling, engine.nonce]);

  // the shield goes back on by itself after a while
  useEffect(() => {
    if (!engine.unlocked) return;
    const timer = window.setTimeout(() => engine.setUnlocked(false), 60_000);
    return () => window.clearTimeout(timer);
  }, [engine, engine.unlocked]);

  const hint = !showing
    ? ""
    : engine.unlocked
      ? t("现在可以直接用 B站播放器（音量、播放键）。这里按的暂停和拖动不会同步给同席，用完点锁。")
      : engine.starting
        ? t("正在打开 B站播放器……")
        : justStarted
          ? t("没有声音？点小锁解锁，再点画面里的播放键。")
          : "";

  return (
    <section
      className={`bilibili-screen ${active ? "" : "is-idle"} ${large ? "is-large" : ""}`}
      aria-label={t("B站屏幕")}
      aria-hidden={!active}
    >
      <div className="bilibili-frame">
        {active && track?.coverUrl && !engine.started && (
          <img className="bilibili-poster" src={track.coverUrl} alt="" referrerPolicy="no-referrer" />
        )}
        {showing && (
          <iframe
            key={nonce}
            src={engine.src}
            title={t("B站播放器")}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            // the player may open Bilibili in a new tab, but never take the tavern's own tab away
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => engine.loaded(nonce)}
          />
        )}
        {showing && !engine.unlocked && (
          <div
            className="bilibili-shield"
            aria-hidden="true"
            title={t("点画面：播放 / 暂停")}
            onClick={() => model.togglePlay()}
          />
        )}
      </div>
      <footer className="bilibili-caption">
        <span className="bilibili-badge">bilibili</span>
        <span className="bilibili-title" title={active ? track!.title : undefined}>
          {active ? track!.title : ""}
        </span>
        {active && (
          <button
            className={`ghost-icon ${engine.unlocked ? "is-active" : ""}`}
            aria-pressed={engine.unlocked}
            aria-label={engine.unlocked ? t("锁回去，用酒馆的按钮") : t("解锁，直接用 B站播放器")}
            data-tip={engine.unlocked ? t("锁回去") : t("解锁 B站播放器")}
            onClick={() => engine.setUnlocked(!engine.unlocked)}
          >
            {engine.unlocked ? <LockOpen size={13} /> : <Lock size={13} />}
          </button>
        )}
        {active && (
          <a
            className="ghost-icon"
            href={bilibiliWatchUrl(bvid, p)}
            target="_blank"
            rel="noreferrer"
            aria-label={t("在 B站打开（高清）")}
            data-tip={t("在 B站看高清")}
            onClick={(event) => {
              event.currentTarget.href = bilibiliWatchUrl(bvid, p, engine.position());
            }}
          >
            <ExternalLink size={13} />
          </a>
        )}
        <button
          className="ghost-icon"
          aria-label={large ? t("缩小屏幕") : t("放大屏幕")}
          data-tip={large ? t("缩小屏幕") : t("放大屏幕")}
          onClick={() => {
            setLarge(!large);
            try {
              localStorage.setItem(SIZE_KEY, large ? "0" : "1");
            } catch {
              /* size lasts this session */
            }
          }}
        >
          {large ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </footer>
      {hint && <p className="bilibili-hint">{hint}</p>}
    </section>
  );
}
