import {
  Database,
  DoorOpen,
  FileDown,
  FileUp,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CellarInventory } from "./CellarInventory";
import {
  inspectStorage,
  requestPersistence,
  type StorageInfo,
  type TavernTrack,
} from "../storage";
import {
  rememberEntrance,
  skipEntrancePreference,
} from "../entrance/TavernEntrance";

export const formatBytes = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${(bytes / 1024 ** 2).toFixed(2)} MB`;

export function LocalCellarManager({
  tracks,
  busy,
  onClear,
  onClose,
  onReplay,
  onExport,
  onImport,
  onDelete,
}: {
  tracks: TavernTrack[];
  busy: boolean;
  onClear: () => Promise<boolean>;
  onClose: () => void;
  onReplay: () => void;
  onExport: () => void;
  onImport: () => void;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<StorageInfo>();
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [skip, setSkip] = useState(skipEntrancePreference);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let alive = true;
    void inspectStorage().then((value) => {
      if (alive) setInfo(value);
    });
    return () => {
      alive = false;
    };
  }, [tracks]);
  const request = async () => {
    setWorking(true);
    const result = await requestPersistence();
    setInfo(await inspectStorage());
    setMessage(
      result === "persistent"
        ? "持久化保护已开启。"
        : result === "best-effort"
          ? "浏览器暂未授予保护，文件仍保存在本机；空间紧张时可能被清理。"
          : "浏览器不支持持久化保护，请保留原音频文件。",
    );
    setWorking(false);
  };
  return (
    <dialog
      ref={dialog}
      className="library-settings"
      onCancel={onClose}
      aria-labelledby="library-title"
    >
      <header className="drawer-heading">
        <div>
          <p className="eyebrow">THE PRIVATE CELLAR</p>
          <h2 id="library-title">本地酒窖</h2>
        </div>
        <button
          className="icon-button"
          aria-label="关闭酒窖管理"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </header>
      <section className="cellar-statistics">
        <Database size={25} />
        <div>
          <strong data-testid="library-bytes">
            {info ? formatBytes(info.bytes) : "读取中"}
          </strong>
          <span>{info?.files ?? 0} 首已存入 · 含音频和封面</span>
        </div>
        <dl>
          <div>
            <dt>本次可播放</dt>
            <dd>
              {tracks.filter((track) => track.status === "ready").length} 首
            </dd>
          </div>
          <div>
            <dt>需重新导入</dt>
            <dd>
              {tracks.filter((track) => track.status === "missing").length} 首
            </dd>
          </div>
          <div>
            <dt>仅本次会话</dt>
            <dd>
              {
                tracks.filter(
                  (track) => track.status === "ready" && !track.stored,
                ).length
              }{" "}
              首
            </dd>
          </div>
        </dl>
      </section>
      <CellarInventory tracks={tracks} busy={busy} onDelete={onDelete} />
      <section className="cellar-section">
        <div className="cellar-heading">
          <h3>存储状态</h3>
          <span
            className={
              info?.persistence === "persistent"
                ? "storage-protected"
                : "storage-caution"
            }
          >
            {!info
              ? "读取中"
              : !info.available
                ? "音频存储不可用"
                : info.persistence === "persistent"
                  ? "已获持久化保护"
                  : "普通本地存储"}
          </span>
        </div>
        {info?.quota ? (
          <>
            <meter min={0} max={info.quota} value={info.usage ?? 0} />
            <p>
              本站占用约 {formatBytes(info.usage ?? 0)} / 可用配额{" "}
              {formatBytes(info.quota)}，包含角色素材等数据。
            </p>
          </>
        ) : null}
        <p>
          音频仅保存在这个浏览器。清除网站数据、无痕模式或浏览器清理可能移除文件，请保留原件。
        </p>
        <button
          className="cellar-command"
          disabled={working || info?.persistence === "persistent"}
          onClick={() => void request()}
        >
          <ShieldCheck size={17} />
          申请持久化保护
        </button>
      </section>
      <section className="cellar-section">
        <div className="cellar-heading">
          <h3>入场仪式</h3>
          <button className="cellar-command" onClick={onReplay}>
            <DoorOpen size={17} />
            重播入场
          </button>
        </div>
        <label className="cellar-toggle">
          <input
            type="checkbox"
            checked={skip}
            onChange={(event) => {
              setSkip(event.target.checked);
              rememberEntrance(event.target.checked);
            }}
          />
          下次直接进入吧台
        </label>
      </section>
      <section className="cellar-section">
        <div className="cellar-heading">
          <h3>备份菜单</h3>
          <button className="cellar-command" onClick={onImport} disabled={busy}>
            <FileUp size={17} />
            导入 JSON
          </button>
          <button className="cellar-command" onClick={onExport}>
            <FileDown size={17} />
            导出 JSON
          </button>
        </div>
        <p>JSON 只含歌单和调酒笔记，不含音频。包含音频的完整备份包尚未提供。</p>
      </section>
      <section className="cellar-section cellar-danger">
        {confirm ? (
          <>
            <p>
              清空本浏览器的全部歌曲、封面、歌单和笔记？原文件及角色图片不受影响。
            </p>
            <div className="cellar-confirm">
              <button
                className="cellar-command"
                disabled={busy || working}
                onClick={async () => {
                  setWorking(true);
                  const ok = await onClear();
                  setWorking(false);
                  setConfirm(false);
                  setInfo(await inspectStorage());
                  setMessage(
                    ok ? "酒窖已清空。" : "清空失败，原音乐库仍然保留。",
                  );
                }}
              >
                <Trash2 size={17} />
                确认清空音乐库
              </button>
              <button
                className="cellar-command"
                onClick={() => setConfirm(false)}
              >
                取消
              </button>
            </div>
          </>
        ) : (
          <button
            className="cellar-command"
            disabled={busy || working}
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={17} />
            清空本地酒窖
          </button>
        )}
      </section>
      <p className="cellar-message" role="status">
        {message}
      </p>
    </dialog>
  );
}
