import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { TavernController } from "../app/useTavernController";
import { EMPTY_RECIPE, recipeFor, type DrinkRecipe } from "../app/recipes";
import { formatTime } from "../app/drinks";
import type { FrameInfo, TavernScene } from "../scene3d/TavernScene";
import type { Quality } from "../scene3d/post";
import type { GlassScreenInfo } from "../scene3d/glasses";
import { t, useLang } from "../i18n";
import { usePowerSaver } from "../power";

interface Props {
  model: TavernController;
  quality: Quality | "auto";
  onFrame: (info: FrameInfo) => void;
  onStatus: (ready: "loading" | "ready" | "failed") => void;
}

interface PressState {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  time: number;
  dragging: boolean;
  target?: string;
  timer?: number;
}

/**
 * Hosts the WebGL tavern and lays invisible, focusable buttons over every glass
 * so hover, click, keyboard focus and drag-to-reorder work like normal UI.
 */
export function BarScene({ model, quality, onFrame, onStatus }: Props) {
  const lang = useLang();
  const {
    carouselTrackIds,
    trackMap,
    currentTrackId,
    transitionDirection,
    isPlaying,
    progress,
    progressMax,
    portrait,
    analyserRef,
    playTrack,
    togglePlay,
    playByOffset,
    moveTrack,
    attentionRef,
    setStatusLine,
  } = model;
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TavernScene>();
  const [sceneReady, setSceneReady] = useState(false);
  const [hotIds, setHotIds] = useState<string[]>([]);
  const [hoverId, setHoverId] = useState<string>();
  const [dragId, setDragId] = useState<string>();
  const hotRefs = useRef(new Map<string, HTMLButtonElement>());
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastFrame = useRef<FrameInfo>();
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const press = useRef<PressState>();
  const suppressClick = useRef(false);
  const swipe = useRef<{ x: number; y: number; id: number }>();
  const hoverRef = useRef<string>();
  hoverRef.current = hoverId;

  const recipes: DrinkRecipe[] = useMemo(() => {
    const list = carouselTrackIds
      .map((id) => trackMap.get(id))
      .filter((track): track is NonNullable<typeof track> => Boolean(track))
      .map(recipeFor);
    return list.length ? list : [EMPTY_RECIPE];
  }, [carouselTrackIds.join("|"), trackMap, lang]);
  const recipeMap = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes],
  );

  useEffect(() => {
    let disposed = false;
    let scene: TavernScene | undefined;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    onStatus("loading");
    import("../scene3d/TavernScene")
      .then(({ TavernScene }) => {
        if (disposed || !hostRef.current) return;
        const params = new URLSearchParams(location.search);
        const forced = params.get("quality");
        const initial =
          forced === "low" || forced === "medium" || forced === "high"
            ? forced
            : quality === "auto"
              ? undefined
              : quality;
        scene = new TavernScene(hostRef.current, {
          manual: params.has("manual"),
          quality: initial,
          reducedMotion: reduced.matches,
          getAnalyser: () => analyserRef.current,
          onFrame: handleFrame,
        });
        sceneRef.current = scene;
        if (params.has("manual"))
          (window as unknown as { __tavern?: TavernScene }).__tavern = scene;
        setSceneReady(true);
        onStatus("ready");
      })
      .catch((error) => {
        console.error(error);
        if (!disposed) onStatus("failed");
      });
    const onReduced = () => sceneRef.current?.setReducedMotion(reduced.matches);
    reduced.addEventListener("change", onReduced);
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      sceneRef.current?.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    const onLeave = () => sceneRef.current?.setPointer(0, 0);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      disposed = true;
      reduced.removeEventListener("change", onReduced);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      scene?.dispose();
      sceneRef.current = undefined;
    };
  }, []);

  const queueCurrent =
    currentTrackId && recipeMap.has(currentTrackId)
      ? currentTrackId
      : recipes[0]?.id;
  useEffect(() => {
    sceneRef.current?.setQueue(recipes, queueCurrent, transitionDirection);
  }, [sceneReady, recipes, queueCurrent, transitionDirection]);

  useEffect(() => {
    sceneRef.current?.setPlaying(isPlaying);
  }, [sceneReady, isPlaying]);

  useEffect(() => {
    if (sceneReady && !new URLSearchParams(location.search).has("quality"))
      sceneRef.current?.setQualityPreference(quality);
  }, [sceneReady, quality]);

  const powerSaver = usePowerSaver();
  useEffect(() => {
    sceneRef.current?.setPowerSaver(powerSaver);
  }, [sceneReady, powerSaver]);

  // behind the closed entrance door nobody sees the bar: don't spend frames on it
  const doorClosed = model.entrancePhase === "closed";
  useEffect(() => {
    sceneRef.current?.setHold(doorClosed);
  }, [sceneReady, doorClosed]);

  useEffect(() => {
    sceneRef.current?.setProgress(progress / Math.max(1, progressMax));
  }, [sceneReady, progress, progressMax]);

  useEffect(() => {
    if (!sceneReady) return;
    void sceneRef.current
      ?.setPortrait(portrait.url, portrait.rig)
      .catch(() =>
        setStatusLine(
          t("角色图片无法读取，请确认 public/assets/lappland 里的图片还在。"),
        ),
      );
  }, [sceneReady, portrait.url]);
  useEffect(() => {
    sceneRef.current?.updateRig(portrait.rig);
  }, [sceneReady, portrait.rig]);

  const placedRef = useRef(new WeakMap<HTMLElement, number[]>());

  // Newly mounted hotspots are positioned immediately from the last frame.
  useLayoutEffect(() => {
    if (lastFrame.current) placeHotspots(lastFrame.current);
  }, [hotIds]);

  function handleFrame(info: FrameInfo) {
    lastFrame.current = info;
    const ids = info.glasses
      .filter((g) => g.visible)
      .sort((a, b) => a.offset - b.offset)
      .map((g) => g.id);
    setHotIds((previous) =>
      previous.join("|") === ids.join("|") ? previous : ids,
    );
    placeHotspots(info);
    onFrameRef.current(info);
  }

  function placeHotspots(info: FrameInfo) {
    for (const glass of info.glasses) {
      const el = hotRefs.current.get(glass.id);
      if (!el) continue;
      const rect = [
        glass.x - glass.width / 2,
        glass.top - 10,
        glass.width,
        Math.max(36, glass.bottom - glass.top + 18),
      ];
      // The glasses sway a little all the time. The invisible click targets only
      // follow real moves, so they hold still under the pointer (and for tests).
      // While a glass is pressed or dragged they follow every frame.
      const last = placedRef.current.get(el);
      if (
        !press.current &&
        last &&
        el.dataset.offset === String(glass.offset) &&
        rect.every((value, i) => Math.abs(value - last[i]) < 3)
      )
        continue;
      placedRef.current.set(el, rect);
      el.style.transform = `translate3d(${rect[0].toFixed(1)}px, ${rect[1].toFixed(1)}px, 0)`;
      el.style.width = `${rect[2].toFixed(1)}px`;
      el.style.height = `${rect[3].toFixed(1)}px`;
      el.style.zIndex = String(100 - Math.round(Math.abs(glass.offset) * 10));
      el.dataset.offset = String(glass.offset);
    }
    const tooltip = tooltipRef.current;
    const hovered =
      hoverRef.current && info.glasses.find((g) => g.id === hoverRef.current);
    if (tooltip && hovered) placeTooltip(tooltip, hovered, info);
  }

  function placeTooltip(
    el: HTMLDivElement,
    glass: GlassScreenInfo,
    info: FrameInfo,
  ) {
    const w = el.offsetWidth || 220;
    const h = el.offsetHeight || 100;
    // The front glass stands right in front of Lappland: put its card beside the glass, not over her.
    const side = glass.offset === 0 && info.width > 640;
    el.classList.toggle("is-side", side);
    if (side) {
      const x = Math.min(info.width - w - 12, glass.x + glass.width / 2 + 14);
      const y = Math.max(
        76,
        glass.top + (glass.bottom - glass.top) * 0.35 - h / 2,
      );
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      return;
    }
    const x = Math.min(info.width - w / 2 - 12, Math.max(w / 2 + 12, glass.x));
    const y = Math.max(76 + h, glass.top - 14);
    el.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px, ${(y - h).toFixed(1)}px, 0)`;
  }

  const setHover = (id?: string) => {
    setHoverId(id);
    sceneRef.current?.setHover(id);
    if (id) attentionRef.current = performance.now();
  };

  const offsetOf = (id: string) =>
    Number(hotRefs.current.get(id)?.dataset.offset ?? 0);

  const onGlassPointerDown = (
    id: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0 || id === EMPTY_RECIPE.id) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = {
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      dragging: false,
    };
    if (event.pointerType === "touch") {
      press.current.timer = window.setTimeout(() => startDrag(), 380);
    }
  };

  const startDrag = () => {
    const state = press.current;
    if (!state || state.dragging || !sceneRef.current?.beginDrag(state.id))
      return;
    state.dragging = true;
    setDragId(state.id);
    setHover(undefined);
  };

  const onGlassPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = press.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - state.x, event.clientY - state.y);
    if (!state.dragging && moved > 8) {
      if (event.pointerType === "touch") {
        // a quick touch swipe browses the bar instead of dragging
        window.clearTimeout(state.timer);
        return;
      }
      startDrag();
    }
    if (state.dragging) {
      const result = sceneRef.current?.dragTo(event.clientX, event.clientY);
      state.target = result?.targetId;
    }
  };

  const onGlassPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = press.current;
    if (!state || state.pointerId !== event.pointerId) return;
    window.clearTimeout(state.timer);
    press.current = undefined;
    if (state.dragging) {
      suppressClick.current = true;
      sceneRef.current?.endDrag();
      setDragId(undefined);
      if (state.target && state.target !== state.id)
        moveTrack(state.id, state.target);
      return;
    }
    if (event.pointerType === "touch") {
      const dx = event.clientX - state.x;
      if (
        Math.abs(dx) > 50 &&
        Math.abs(dx) > Math.abs(event.clientY - state.y) * 1.4
      ) {
        suppressClick.current = true;
        playByOffset(dx < 0 ? 1 : -1);
      }
    }
  };

  const activate = (id: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (id === EMPTY_RECIPE.id) {
      if (!model.isGuest) model.fileInputRef.current?.click();
      return;
    }
    if (id === currentTrackId) {
      togglePlay();
      return;
    }
    const offset = offsetOf(id);
    playTrack(id, offset < 0 ? "prev" : offset > 0 ? "next" : "pick");
  };

  // Swipes on the empty parts of the scene browse the bar on touch screens.
  const onScenePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const onScenePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = undefined;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    if (
      Math.abs(dx) > 60 &&
      Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.5
    )
      playByOffset(dx < 0 ? 1 : -1);
  };

  const hoverTrack = hoverId ? trackMap.get(hoverId) : undefined;
  const hoverRecipe = hoverId ? recipeMap.get(hoverId) : undefined;
  const hoverIsCurrent = hoverId === currentTrackId;

  return (
    <div className="bar-scene" data-dragging={dragId ? "true" : undefined}>
      <div
        className="scene-host"
        ref={hostRef}
        onPointerDown={onScenePointerDown}
        onPointerUp={onScenePointerUp}
      />
      <div className="glass-hotspots" role="list" aria-label={t("吧台上的酒杯")}>
        {hotIds.map((id) => {
          const track = trackMap.get(id);
          const recipe = recipeMap.get(id);
          const current = id === queueCurrent;
          const label =
            id === EMPTY_RECIPE.id
              ? t("空酒杯：添加本地歌曲")
              : `${current ? (isPlaying ? t("暂停") : t("播放")) : t("播放")} ${track?.alias || track?.title || ""}`;
          return (
            <button
              key={id}
              role="listitem"
              ref={(el) => {
                if (el) hotRefs.current.set(id, el);
                else hotRefs.current.delete(id);
              }}
              className={`glass-hotspot ${current ? "is-current" : ""} ${dragId === id ? "is-dragging" : ""}`}
              data-track-id={id}
              data-recipe={recipe?.shape}
              aria-label={label}
              aria-current={current ? "true" : undefined}
              onPointerEnter={(event) =>
                event.pointerType !== "touch" && setHover(id)
              }
              onPointerLeave={() => hoverId === id && setHover(undefined)}
              onFocus={() => setHover(id)}
              onBlur={() => setHover(undefined)}
              onPointerDown={(event) => onGlassPointerDown(id, event)}
              onPointerMove={onGlassPointerMove}
              onPointerUp={onGlassPointerUp}
              onPointerCancel={onGlassPointerUp}
              onClick={() => activate(id)}
              onContextMenu={(event) => event.preventDefault()}
            />
          );
        })}
      </div>
      <div
        ref={tooltipRef}
        className={`glass-tooltip ${hoverId && !dragId ? "is-visible" : ""} ${hoverIsCurrent ? "is-current" : ""}`}
        aria-hidden="true"
      >
        {hoverId === EMPTY_RECIPE.id ? (
          <>
            <span className="tip-eyebrow">EMPTY GLASS</span>
            <strong>{t("吧台还空着")}</strong>
            <small>
              {model.isGuest
                ? t("等房主把歌摆上来")
                : t("拖入音乐，或点击添加本地歌曲")}
            </small>
          </>
        ) : hoverTrack && hoverRecipe ? (
          <>
            <span className="tip-eyebrow">
              {hoverIsCurrent
                ? isPlaying
                  ? "NOW POURING"
                  : "ON THE COUNTER"
                : "NEXT ROUND"}{" "}
              · {hoverRecipe.description}
            </span>
            <strong>{hoverTrack.alias || hoverTrack.title}</strong>
            <small>
              {hoverTrack.artist} · {formatTime(hoverTrack.duration)}
            </small>
            {hoverIsCurrent && (
              <>
                {hoverTrack.alias && (
                  <small className="tip-original">
                    {t("原名：{title}", { title: hoverTrack.title })}
                  </small>
                )}
                <span className="tip-tags">
                  {hoverTrack.tags.map((tag) => (
                    <i key={tag}>{t(tag)}</i>
                  ))}
                </span>
                <small className="tip-hint">
                  {isPlaying
                    ? t("点击酒杯暂停 · 拖动调整顺序")
                    : t("点击酒杯开始 · 拖动调整顺序")}
                </small>
              </>
            )}
            {!hoverIsCurrent && (
              <small className="tip-hint">{t("点击上杯 · 拖动换位")}</small>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export type { FrameInfo };
