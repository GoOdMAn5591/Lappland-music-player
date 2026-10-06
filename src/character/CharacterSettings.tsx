import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, RotateCcw, Undo2, X } from "lucide-react";
import {
  defaultRig,
  transparentRig,
  transparentPortraitName,
  type Anchor,
  type PortraitAsset,
  type PortraitRig,
} from "./portrait";
import { lapplandRig } from "./lapplandRig";

const anchors: [Anchor, string][] = [
  ["head", "头部"],
  ["leftHair", "左发梢 / 飘带"],
  ["rightHair", "右发梢 / 飘带"],
  ["leftEye", "左眼高光"],
  ["rightEye", "右眼高光"],
  ["leftEar", "左耳"],
  ["rightEar", "右耳"],
  ["shoulders", "肩部"],
  ["chest", "胸口"],
  ["ribbon", "飘带"],
  ["leftHand", "抬起的手"],
  ["rightHand", "持杯的手"],
  ["heldGlass", "手中酒杯"],
];

export function CharacterSettings({
  asset,
  url,
  onChange,
  onChoose,
  onClose,
}: {
  asset: PortraitAsset;
  url: string;
  onChange: (rig: PortraitRig) => void;
  onChoose: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<Anchor | "outline">("head");
  const rig = asset.rig;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const adjust = (
    key: "zoom" | "x" | "y" | "motion" | "feather",
    value: number,
  ) => onChange({ ...rig, [key]: value });
  const point = selected === "outline" ? undefined : rig.anchors[selected];
  return (
    <dialog
      ref={dialog}
      className="character-settings"
      onCancel={onClose}
      aria-labelledby="character-settings-title"
    >
      <header className="drawer-heading">
        <div>
          <p className="eyebrow">LAPPLAND / PORTRAIT</p>
          <h2 id="character-settings-title">角色构图</h2>
        </div>
        <button
          className="icon-button compact"
          aria-label="关闭角色设置"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="portrait-settings-body">
        <div className="portrait-map-column">
          <button
            className="portrait-anchor-map"
            aria-label={`定位${selected === "outline" ? "角色轮廓" : anchors.find(([key]) => key === selected)?.[1]}`}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (!event.detail) return;
              const p = {
                x: Math.max(
                  0,
                  Math.min(1, (event.clientX - bounds.left) / bounds.width),
                ),
                y: Math.max(
                  0,
                  Math.min(1, (event.clientY - bounds.top) / bounds.height),
                ),
              };
              onChange(
                selected === "outline"
                  ? { ...rig, outline: [...rig.outline, p] }
                  : { ...rig, anchors: { ...rig.anchors, [selected]: p } },
              );
            }}
          >
            <img src={url} alt={asset.name} />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {rig.outline.length > 1 && (
                <polygon
                  points={rig.outline
                    .map((p) => `${p.x * 100},${p.y * 100}`)
                    .join(" ")}
                />
              )}
            </svg>
            {Object.entries(rig.anchors).map(([key, p]) => (
              <span
                key={key}
                className={`anchor-dot ${selected === key ? "selected" : ""}`}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              />
            ))}
            {rig.outline.map((p, i) => (
              <span
                key={i}
                className="outline-dot"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              />
            ))}
          </button>
          <p className="portrait-filename">{asset.name}</p>
          <div className="portrait-file-actions">
            <button className="ghost-action" onClick={onChoose}>
              <ImagePlus size={16} />
              更换图片
            </button>
            <button
              className="icon-button compact"
              aria-label="重置角色构图"
              title="重置角色构图"
              onClick={() =>
                onChange(
                  asset.name === "136884763_p0_master1200.jpg"
                    ? lapplandRig
                    : asset.name === transparentPortraitName
                      ? transparentRig()
                      : defaultRig(),
                )
              }
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
        <div className="portrait-adjustments">
          <label>
            缩放 <output>{rig.zoom.toFixed(2)}×</output>
            <input
              aria-label="角色缩放"
              type="range"
              min="0.5"
              max="3"
              step="0.01"
              value={rig.zoom}
              onChange={(e) => adjust("zoom", Number(e.target.value))}
            />
          </label>
          <label>
            水平位置{" "}
            <input
              aria-label="角色水平位置"
              type="range"
              min="-60"
              max="60"
              step="1"
              value={rig.x}
              onChange={(e) => adjust("x", Number(e.target.value))}
            />
          </label>
          <label>
            垂直位置{" "}
            <input
              aria-label="角色垂直位置"
              type="range"
              min="-60"
              max="60"
              step="1"
              value={rig.y}
              onChange={(e) => adjust("y", Number(e.target.value))}
            />
          </label>
          <label>
            动作幅度{" "}
            <input
              aria-label="角色动作幅度"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={rig.motion}
              onChange={(e) => adjust("motion", Number(e.target.value))}
            />
          </label>
          <label>
            边缘柔化{" "}
            <input
              aria-label="角色边缘柔化"
              type="range"
              min="0"
              max="0.25"
              step="0.005"
              value={rig.feather}
              onChange={(e) => adjust("feather", Number(e.target.value))}
            />
          </label>
          <label>
            动作定位
            <select
              aria-label="动作定位"
              value={selected}
              onChange={(e) =>
                setSelected(e.target.value as Anchor | "outline")
              }
            >
              {anchors.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
              <option value="outline">角色轮廓</option>
            </select>
          </label>
          {point && (
            <div className="anchor-coordinates">
              {(["x", "y"] as const).map((axis) => (
                <label key={axis}>
                  {axis.toUpperCase()} %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    aria-label={`定位${axis.toUpperCase()}`}
                    value={Math.round(point[axis] * 1000) / 10}
                    onChange={(e) =>
                      onChange({
                        ...rig,
                        anchors: {
                          ...rig.anchors,
                          [selected]: {
                            ...point,
                            [axis]:
                              Math.max(
                                0,
                                Math.min(100, Number(e.target.value)),
                              ) / 100,
                          },
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          )}
          {selected === "outline" && (
            <div className="portrait-file-actions">
              <span>{rig.outline.length} 个轮廓点</span>
              <button
                className="icon-button compact"
                aria-label="撤销轮廓点"
                title="撤销轮廓点"
                onClick={() =>
                  onChange({ ...rig, outline: rig.outline.slice(0, -1) })
                }
              >
                <Undo2 size={16} />
              </button>
              <button
                className="icon-button compact"
                aria-label="清除轮廓"
                title="清除轮廓"
                onClick={() => onChange({ ...rig, outline: [] })}
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      <button className="commit-note" onClick={onClose}>
        <Check size={17} />
        完成
      </button>
    </dialog>
  );
}
