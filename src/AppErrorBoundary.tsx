import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "./i18n";

/** Shows what went wrong instead of leaving a blank black page. */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(t("无序酒馆出错了"), error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="room-join" role="alert" translate="no">
        <div className="room-join-card">
          <p className="eyebrow">{t("SOMETHING SPILLED · 洒了一杯")}</p>
          <h2>{t("页面出了点问题")}</h2>
          <p>
            {t("点「重新载入」通常就能恢复；同席的朋友重新载入后会自动回到座位上。如果反复出现，请把这一屏截图发给房主。")}
          </p>
          <pre className="error-detail">{String(error.message || error).slice(0, 400)}</pre>
          <button className="commit-note" onClick={() => location.reload()}>
            {t("重新载入")}
          </button>
        </div>
      </div>
    );
  }
}
