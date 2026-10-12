import { DoorOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TavernController } from "../app/useTavernController";
import { t } from "../i18n";

/** The card a friend sees after opening an invite link, until they take a seat. */
export function RoomJoin({ model }: { model: TavernController }) {
  const { room } = model;
  const [name, setName] = useState(room.defaultName || "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (room.status === "invite") input.current?.focus({ preventScroll: true });
  }, [room.status]);

  const retry = () => location.reload();
  let body;
  if (room.status === "checking")
    body = (
      <>
        <h2>{t("正在敲门……")}</h2>
        <p className="room-progress">
          <LoaderCircle size={16} className="spin" />
          {t("连接朋友的酒馆")}
        </p>
      </>
    );
  else if (room.status === "invite" || room.status === "joining")
    body = (
      <>
        <h2>{t("{host} 请你喝一杯", { host: room.hostName || t("朋友") })}</h2>
        <p>
          {t("入座后会和大家一起听 {host} 正在放的歌。在座的每个人都可以点歌、暂停、切歌和拖进度。", { host: room.hostName || t("房主") })}
        </p>
        <form
          className="room-form"
          onSubmit={(event) => {
            event.preventDefault();
            room.join(name);
          }}
        >
          <label>
            <span>{t("怎么称呼你")}</span>
            <input
              ref={input}
              value={name}
              maxLength={16}
              placeholder={t("客人")}
              onChange={(event) => setName(event.target.value)}
              aria-label={t("你的称呼")}
            />
          </label>
          <button
            className="commit-note"
            type="submit"
            disabled={room.status === "joining"}
          >
            {room.status === "joining" ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <DoorOpen size={16} />
            )}
            {t("入座")}
          </button>
        </form>
      </>
    );
  else
    body = (
      <>
        <h2>
          {room.status === "invalid"
            ? t("这张邀请已经失效")
            : room.status === "closed"
              ? t("酒馆打烊了")
              : t("敲不开门")}
        </h2>
        <p>
          {room.status === "invalid"
            ? t("房主可能已经关闭了房间，或者链接复制得不完整。请让他重新发一次邀请链接。")
            : room.status === "closed"
              ? room.message || t("房主关闭了房间。")
              : t("房主的酒馆现在连不上：可能他关掉了窗口，或者网络不通。")}
        </p>
        <button className="commit-note" onClick={retry}>
          <RefreshCw size={16} />
          {t("再敲一次")}
        </button>
      </>
    );

  return (
    <div className="room-join" role="dialog" aria-modal="true" aria-label={t("同席邀请")}>
      <div className="room-join-card">
        <p className="eyebrow">{t("INVITATION · 同席邀请")}</p>
        {body}
      </div>
    </div>
  );
}
