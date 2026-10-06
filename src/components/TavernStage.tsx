import { Wine } from "lucide-react";
import { DrinkCarousel } from "./DrinkCarousel";
import { getDrinkStyle } from "../app/drinks";
import type { TavernController } from "../app/useTavernController";
import { BottleWall } from "../scene/BottleWall";
import { CurvedBarCounter } from "./CurvedBarCounter";
import { LapplandLive2DLayer } from "./LapplandLive2DLayer";
import { TransparentTrackInfo } from "./TransparentTrackInfo";
import { TransportControls } from "./TransportControls";
export function TavernStage({ model }: { model: TavernController }) {
  const {
    tracks,
    currentTrackId,
    setDraggedTrackId,
    dropTargetId,
    setDropTargetId,
    transitionDirection,
    attentionRef,
    stageRef,
    fileInputRef,
    canvasRef,
    trackMap,
    carouselTrackIds,
    playTrack,
    reorderTrack,
  } = model;
  return (
    <section
      className="center-stage"
      ref={stageRef}
      aria-label="拉普兰德酒馆吧台"
    >
      <div className="scene-title" aria-hidden="true">
        <span>THE MIDNIGHT COUNTER</span>
        <span>01 / 无序之夜</span>
      </div>
      <div className="scene-background" aria-hidden="true">
        <div className="curtain-glow" />
        <BottleWall />
        <div className="dust-field" />
        <div className="candle candle-left" />
        <div className="candle candle-right" />
      </div>

      <LapplandLive2DLayer model={model} />

      <div className="bar-depth">
        <CurvedBarCounter />
      </div>

      <div className="glass-carousel" aria-label="吧台酒杯播放器">
        <canvas ref={canvasRef} width="720" height="160" aria-hidden="true" />
        {!carouselTrackIds.length ? (
          <button
            className="empty-stage"
            onClick={() => fileInputRef.current?.click()}
          >
            <Wine size={52} />
            <strong>吧台还是空的</strong>
            <span>拖入音频，歌曲会变成一排沿吧台轮转的酒杯。</span>
          </button>
        ) : (
          <DrinkCarousel
            ids={carouselTrackIds}
            tracks={trackMap}
            currentId={currentTrackId}
            direction={transitionDirection}
            dropTargetId={dropTargetId}
            getStyle={getDrinkStyle}
            onPlay={playTrack}
            onDrag={setDraggedTrackId}
            onTarget={setDropTargetId}
            onReorder={reorderTrack}
            onAttention={() => {
              attentionRef.current = performance.now();
            }}
          />
        )}
      </div>

      <div className="stage-controls">
        <TransparentTrackInfo model={model} />

        <TransportControls model={model} />
      </div>
    </section>
  );
}
