# Lappland Music Player / 无序酒馆

在浏览器本地运行的沉浸式音乐播放器：拉普兰德位于金色酒柜前，歌曲变成沿半圆吧台轮转的酒杯。Vite + React + TypeScript + Three.js，无音频上传服务。

当前仓库按所有者选择设为 **Private**，没有部署网站。MIT 适用于代码，不代表第三方角色图片也采用 MIT。

## 安装与运行

需要 Node.js 22.12+（推荐当前 LTS）及 npm。私有仓库克隆需要有访问权限并登录 GitHub。

```sh
git clone https://github.com/GoOdMAn5591/Lappland-music-player.git
cd Lappland-music-player
npm ci
npm run dev
```

打开终端显示的地址，默认 `http://127.0.0.1:5173/`。端口被占用时 Vite 会选择下一端口。日常使用请固定浏览器和地址：`localhost`、`127.0.0.1`、不同端口属于不同存储来源。

可以把整个项目文件夹复制到另一台电脑，再执行 `npm ci` 和 `npm run dev`。不需要复制 `node_modules`、`dist` 或机器专用路径。默认图片在 `public/assets/lappland/lappland-cutout-transparent.png`，应用使用支持 Vite base 的资源地址。

```sh
npm run build
npm run preview
```

`preview` 只是本地预览。本项目未配置 GitHub Pages、Vercel 或 Netlify。未来部署子目录可设置 `VITE_BASE_PATH=/Lappland-music-player/` 后构建，发布前再次审查素材权限。私有仓库不等于部署后的网站也私有。

## 使用本地酒窖

- 首次打开可进入或跳过酒馆大门；跳过选择会记住，可在酒窖管理中重播。
- 点击上传图标或拖入音频。支持 MP3，WAV、OGG、FLAC 等由浏览器解码能力决定。metadata 失败会回退到文件名。
- 点击酒杯播放、上一杯 / 下一杯切歌；液体和灯影响应本地音频。酒单支持搜索、创建 / 重命名 / 删除歌单、拖拽排序、编辑饮品别名、标签与歌单归属。
- 空格播放 / 暂停，左右键快退 / 快进 5 秒，Ctrl/Cmd+O 添加音频。输入框和模态窗口不会被播放快捷键打断。
- 顶部「本地」查看已存歌曲、音频与封面占用空间、持久化保护，删除单曲或清空酒窖。删除不影响电脑原文件。
- JSON 导入 / 导出保存歌单、排序、metadata 和笔记，**不包含音频与封面 Blob**。跨电脑迁移请同时保留原音频并重新导入；原文件名、大小和修改时间共同用于匹配。完整音频备份包尚未实现。

音频 Blob、封面、metadata、歌单和编辑信息保存在 IndexedDB，启动自动恢复。导入申请 `navigator.storage.persist()`，浏览器可能拒绝。容量不足 / 禁用存储时退回会话播放与 metadata 尽力保存，并显示重新导入状态。清理网站数据、无痕会话结束仍可能失去内容，请保留原件。**GitHub 不会自动备份浏览器里的音乐库。**

## 完成度

| 功能                                              | 状态                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| 入场门铃、开门、记住跳过、重播                    | 已实现；声音只在用户操作后触发                                            |
| 半圆吧台、酒墙、实体酒杯、弧线传杯、液体惯性      | 已实现；响应式与减少动态效果支持                                          |
| 指定 PNG、局部网格形变、呼吸 / 头发 / 手部 / 视差 | 已实现的伪 Live2D，不是真正 Cubism 模型                                   |
| 本地播放、封面、IndexedDB、歌单编辑、单曲删除     | 已实现                                                                    |
| Spotify                                           | 实验面板、PKCE 辅助函数、目录和播放接口；**无登录 / 目录读取 / SDK 播放** |
| 多人房间                                          | 离线面板、协议与 WebSocket 占位；**无服务器 / 房间 / 联机**               |
| 完整音频备份包                                    | 未实现，仅支持配置 JSON                                                   |

## Spotify 配置

没有 Spotify Developer App 也能使用完整本地功能，保持默认开关关闭即可。开发者可将 `.env.example` 复制为 `.env.local`：

```dotenv
VITE_SPOTIFY_CLIENT_ID=
VITE_SPOTIFY_REDIRECT_URI=
VITE_ENABLE_SPOTIFY=false
VITE_ENABLE_MULTIPLAYER=false
```

**开关设为 `true` 不会自动获得 Spotify 播放或联机功能**，目前只更新实验面板状态。还需实现 OAuth 回调、Token 交换 / 刷新、目录适配器和 Web Playback SDK 端口，详见 [Spotify 设计](docs/spotify.md)。不要把 Client Secret 或 Token 放入任何 `VITE_*` 变量、前端代码或 Git。

Web Playback SDK 完整播放需要 Premium 及应用访问资格，非 Premium 不能绕过限制。metadata 读取也取决于实际端点、权限和应用模式。Spotify 音频不下载、不缓存为 Blob、不进入本地 Web Audio 分析器、不转播。[官方 SDK 指南](https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started)、[PKCE 指南](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)。

未来多人只考虑各成员分别授权 / 播放，同步 URI、状态和时间戳。这个技术方案**不代表已获平台批准**，同步听歌、音乐响应视觉效果与公开上线前都需复核 [Spotify Developer Policy](https://developer.spotify.com/policy)，当前均未开启。

## 素材与许可

项目所有者于 2026-10-05 确认获得指定透明 PNG 的公开分发授权，仓库记录此声明而非独立法律核验。角色、商标和图片不由 MIT 再授权，复用者须确认适用范围。参见 [素材清单](ASSETS.md) 与 [图片说明](public/assets/lappland/README.md)。

其他木纹、酒瓶、玻璃、门铃与环境效果由代码生成，没有下载官方拆包 Live2D、音乐或视频。授权分层素材 / Cubism 模型可通过 `src/character/runtime.ts` 的接口扩展，当前未打包 Cubism SDK。

## 开发测试

```sh
npm ci
npx playwright install chromium
npm run dev
# 另一个终端，保持开发服务器运行：
npm test
```

测试使用隔离浏览器和程序生成 WAV，不碰日常浏览器音乐库。Windows 优先使用已安装 Edge / Chrome，CI 使用 Playwright Chromium。`APP_URL` 可覆盖测试地址；开发模块断言要求根目录 Vite 开发服务器。截图位于忽略的 `test-results/`。

GitHub Actions 执行构建与测试，**不发布网站**。详见 [测试说明](docs/testing.md)、[架构](docs/architecture.md)、[多人计划](docs/multiplayer.md)、[贡献指南](CONTRIBUTING.md)。
