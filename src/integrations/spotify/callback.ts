import { assetUrl } from "../../config";
import { t } from "../../i18n";
import { callbackTransaction, completeSignIn, isCallbackUrl, SpotifyAuthError } from "./auth";

/**
 * Spotify sends the browser back to http://127.0.0.1:5173/callback after
 * sign-in. That page finishes the sign-in before the bar is drawn:
 *  - in the small sign-in window it saves the tokens (the bar's tab picks
 *    them up) and closes itself;
 *  - after a full-page sign-in it tidies the address and opens the bar;
 *  - if this browser didn't start the sign-in (a friend whose own computer
 *    happens to run a tavern too), it shows the address to copy back.
 * Returns true when the page is handled and the bar shouldn't load.
 */
export async function handleSpotifyCallback(): Promise<boolean> {
  if (!isCallbackUrl(location.href)) return false;
  const href = location.href;
  const transaction = callbackTransaction(href);
  if (!transaction) {
    showCard(
      t("Spotify 已授权"),
      t("这次登录是从朋友的酒馆发起的：把下面这个网址整个复制，粘贴回那个页面的 Spotify 窗口里。"),
      href,
    );
    return true;
  }
  try {
    const mode = await completeSignIn(href);
    if (mode === "popup") {
      showCard(t("已连上 Spotify"), t("可以关掉这个小窗口，回到酒馆了。"));
      window.setTimeout(() => window.close(), 700);
      return true;
    }
    history.replaceState(null, "", assetUrl(""));
    try {
      sessionStorage.setItem("tavern-open-spotify", "1");
    } catch {
      /* the panel just stays closed */
    }
    return false;
  } catch (error) {
    const code = error instanceof SpotifyAuthError ? error.code : "exchange";
    showCard(
      t("Spotify 没连上"),
      code === "declined"
        ? t("你在 Spotify 页面上取消了授权。")
        : code === "expired"
          ? t("这次登录等太久过期了，回酒馆重新点一次「连接 Spotify」。")
          : t("授权没有完成（{why}）。回酒馆再试一次。", { why: (error as Error).message }),
    );
    const back = document.createElement("a");
    back.href = assetUrl("");
    back.textContent = t("回到酒馆");
    back.className = "callback-back";
    document.querySelector(".callback-card")?.append(back);
    return true;
  }
}

function showCard(title: string, text: string, copyValue?: string) {
  const root = document.getElementById("root") ?? document.body;
  root.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = `
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#120b0a;color:#f3e6c8;font:15px/1.6 system-ui,"Noto Serif SC",serif}
    .callback-card{max-width:440px;margin:24px;padding:28px 26px;border:1px solid rgba(242,202,123,.35);border-radius:14px;background:rgba(30,18,15,.92);box-shadow:0 20px 60px rgba(0,0,0,.6)}
    .callback-card h1{margin:0 0 10px;font-size:20px;color:#f2ca7b;letter-spacing:.06em}
    .callback-card p{margin:0 0 16px;color:#d9c9a8}
    .callback-card input{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:8px;border:1px solid rgba(242,202,123,.4);background:#0b0605;color:#f3e6c8;font:12px/1.4 ui-monospace,monospace}
    .callback-card button,.callback-back{display:inline-block;margin-top:12px;padding:8px 16px;border-radius:999px;border:1px solid #f2ca7b;background:#3a2412;color:#f2ca7b;font:inherit;cursor:pointer;text-decoration:none}`;
  document.head.append(style);
  const card = document.createElement("main");
  card.className = "callback-card";
  const h1 = document.createElement("h1");
  h1.textContent = title;
  const p = document.createElement("p");
  p.textContent = text;
  card.append(h1, p);
  if (copyValue) {
    const input = document.createElement("input");
    input.readOnly = true;
    input.value = copyValue;
    input.addEventListener("focus", () => input.select());
    const button = document.createElement("button");
    button.textContent = t("复制网址");
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyValue);
      } catch {
        input.select();
        document.execCommand("copy");
      }
      button.textContent = t("已复制");
    });
    card.append(input, button);
  }
  root.append(card);
}
