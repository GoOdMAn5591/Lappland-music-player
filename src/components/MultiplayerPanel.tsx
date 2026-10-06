import { DoorOpen, Plus, Users } from "lucide-react";
import { features } from "../config";
import { OfflineAdapter } from "../multiplayer/adapter";
import { IntegrationDialog } from "./IntegrationDialog";

const offline = new OfflineAdapter();
export function MultiplayerPanel({ onClose }: { onClose: () => void }) {
  return (
    <IntegrationDialog
      title="同席房间"
      eyebrow="OFFLINE / FUTURE RELEASE"
      onClose={onClose}
    >
      <div className="integration-status">
        <Users size={28} />
        <div>
          <strong>离线酒馆</strong>
          <small>
            {features.multiplayer
              ? "实验开关已开启，尚未连接房间服务"
              : "房间服务尚未启用"}
          </small>
        </div>
      </div>
      <dl className="integration-facts">
        <div>
          <dt>房间码</dt>
          <dd>未创建</dd>
        </div>
        <div>
          <dt>在线成员</dt>
          <dd>{offline.state.members.length}</dd>
        </div>
        <div>
          <dt>音频上传</dt>
          <dd>关闭</dd>
        </div>
      </dl>
      <div className="room-actions">
        <button className="cellar-command" disabled>
          <Plus size={16} />
          创建房间
        </button>
        <button className="cellar-command" disabled>
          <DoorOpen size={16} />
          加入房间
        </button>
      </div>
      <p className="integration-note">
        第一版只预留状态同步协议与适配层。本地音频不上传；未来 Spotify
        同席需要各自授权与播放资格，且须先复核平台政策。
      </p>
    </IntegrationDialog>
  );
}
