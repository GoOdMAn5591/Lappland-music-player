import { ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TavernController } from "../app/useTavernController";
import { youtubeThumb, youtubeWatchUrl } from "../integrations/youtube/catalog";
import { useYouTubeEngine } from "../integrations/youtube/player";
import { isYouTubeTrack } from "../storage";
import { t } from "../i18n";

const SIZE_KEY = "tavern-youtube-large";

/**
 * The little screen behind the bar where YouTube videos play. YouTube's rules
 * shape it: always visible while it plays (no hidden or background player),
 * nothing drawn over it, at least 200 × 200 px, YouTube's own controls and
 * branding left alone. It's tucked away whenever the bar pours something else.
 */
export function YouTubeScreen({ model }: { model: TavernController }) {
  const engine = useYouTubeEngine();
  const mount = useRef<HTMLDivElement>(null);
  const [large, setLarge] = useState(() => {
    try {
      return localStorage.getItem(SIZE_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => engine.attach(mount.current), [engine]);

  const track = model.currentTrack;
  const active = isYouTubeTrack(track);
  const id = active ? (track!.youtubeId ?? "") : "";
  const hint = !active
    ? ""
    : engine.status === "error"
      ? t("YouTube 播放器没加载出来：检查网络，或暂时关掉拦截广告的扩展。")
      : engine.needsGesture && model.isPlaying
        ? t("没有声音？点一下画面里的播放键。")
        : "";

  return (
    <section
      className={`youtube-screen ${active ? "" : "is-idle"} ${large ? "is-large" : ""}`}
      aria-label={t("YouTube 屏幕")}
      aria-hidden={!active}
    >
      <div className="youtube-frame">
        {/* the video's picture until the player has loaded it (the player covers it) */}
        {active && !engine.isOn(id) && (
          <img className="youtube-poster" src={youtubeThumb(id)} alt="" />
        )}
        <div ref={mount} className="youtube-mount" />
      </div>
      <footer className="youtube-caption">
        <span className="youtube-badge">YouTube</span>
        <span className="youtube-title" title={active ? track!.title : undefined}>
          {active ? track!.title : ""}
        </span>
        {active && (
          <a
            className="ghost-icon"
            href={youtubeWatchUrl(id)}
            target="_blank"
            rel="noreferrer"
            aria-label={t("在 YouTube 打开")}
            data-tip={t("在 YouTube 打开")}
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
      {hint && <p className="youtube-hint">{hint}</p>}
    </section>
  );
}
