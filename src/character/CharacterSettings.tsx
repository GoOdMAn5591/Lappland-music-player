import { useEffect, useRef } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { defaultRig, type PortraitRig } from "./portrait";
import { t } from "../i18n";

/** Composition of the bundled character: size, position and motion strength. */
export function CharacterSettings({
  rig,
  onChange,
  onClose,
}: {
  rig: PortraitRig;
  onChange: (rig: PortraitRig) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const adjust = (key: "zoom" | "x" | "y" | "motion", value: number) =>
    onChange({ ...rig, [key]: value });
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
          <h2 id="character-settings-title">{t("角色构图")}</h2>
        </div>
        <button
          className="icon-button compact"
          aria-label={t("关闭角色设置")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="portrait-adjustments">
        <label>
          {t("缩放")} <output>{rig.zoom.toFixed(2)}×</output>
          <input
            aria-label={t("角色缩放")}
            type="range"
            min="0.5"
            max="3"
            step="0.01"
            value={rig.zoom}
            onChange={(e) => adjust("zoom", Number(e.target.value))}
          />
        </label>
        <label>
          {t("水平位置")}{" "}
          <input
            aria-label={t("角色水平位置")}
            type="range"
            min="-60"
            max="60"
            step="1"
            value={rig.x}
            onChange={(e) => adjust("x", Number(e.target.value))}
          />
        </label>
        <label>
          {t("垂直位置")}{" "}
          <input
            aria-label={t("角色垂直位置")}
            type="range"
            min="-60"
            max="60"
            step="1"
            value={rig.y}
            onChange={(e) => adjust("y", Number(e.target.value))}
          />
        </label>
        <label>
          {t("动作幅度")}{" "}
          <input
            aria-label={t("角色动作幅度")}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={rig.motion}
            onChange={(e) => adjust("motion", Number(e.target.value))}
          />
        </label>
        <button
          className="ghost-action"
          onClick={() => onChange(defaultRig())}
        >
          <RotateCcw size={16} />
          {t("恢复默认构图")}
        </button>
      </div>
      <button className="commit-note" onClick={onClose}>
        <Check size={17} />
        {t("完成")}
      </button>
    </dialog>
  );
}
