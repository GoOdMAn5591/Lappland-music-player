/** English UI text, keyed by the Chinese source string used with t(). */
export const EN: Record<string, string> = {
  // ---------------------------------------------------------------- general
  无序酒馆: "The Unruly Tavern",
  无序酒馆出错了: "The tavern hit an error",
  "SOMETHING SPILLED · 洒了一杯": "SOMETHING SPILLED",
  页面出了点问题: "Something went wrong",
  "点「重新载入」通常就能恢复；同席的朋友重新载入后会自动回到座位上。如果反复出现，请把这一屏截图发给房主。":
    "Reloading usually fixes it, and guests at a shared table return to their seat automatically. If it keeps happening, send a screenshot of this screen to the host.",
  重新载入: "Reload",
  添加本地音频: "Add local audio",
  "导入菜单 JSON": "Import menu JSON",
  "这台设备暂时无法启用 3D 吧台（WebGL 不可用）。播放、酒单与导入功能仍可正常使用。":
    "This device can't show the 3D bar (WebGL is unavailable). Playback, the menu and imports still work.",
  "松手，把这些歌倒进吧台": "Drop to pour these songs onto the bar",
  音频只留在这台电脑的浏览器里: "Audio stays in this computer's browser",
  "把本地音频拖到吧台上，今晚第一杯就会滑到你面前。":
    "Drag local music onto the bar and tonight's first glass slides over to you.",

  // ------------------------------------------------------------ status line
  "正在连接朋友的酒馆……": "Connecting to your friend's tavern…",
  "酒窖已恢复 {ok} 首；{missing} 首需要重新导入音频。":
    "Cellar restored: {ok} tracks; {missing} need their audio re-imported.",
  "浏览器本地存储暂不可用。音频仍可在本次会话播放，请保留原文件并导出菜单。":
    "Browser storage is unavailable. Audio still plays this session; keep your original files and export the menu.",
  "菜单保存失败，可能是浏览器储存空间已满。": "Couldn't save the menu; browser storage may be full.",
  "歌曲已恢复，点击播放即可开席。": "Songs restored. Press play to start.",
  "本地酒窖已清空，角色图片和电脑中的原文件已保留。":
    "Local cellar cleared. The character image and the files on your computer are untouched.",
  "本地酒窖清空失败，未更改当前菜单。": "Couldn't clear the cellar; the menu is unchanged.",
  "已从本地酒窖移除 {title}，电脑原文件未更改。":
    "Removed {title} from the cellar. The file on your computer is untouched.",
  "删除未完成，当前音乐库已保留。": "Delete didn't finish; your library is unchanged.",
  "这杯酒的酒瓶还没回到吧台：请重新导入对应本地音频。":
    "This glass is missing its bottle: re-import the matching audio file.",
  "浏览器拦住了自动播放：点一下页面任意位置就能听到。":
    "The browser blocked autoplay: click anywhere on the page to hear it.",
  "浏览器没有允许自动播放，请再点一次播放按钮。":
    "The browser didn't allow autoplay. Press play once more.",
  "房主那边也缺这杯的原酒，换一杯吧。": "The host is missing this one's audio too. Pick another glass.",
  "这只酒杯还缺原酒：请重新导入对应本地音频。":
    "This glass is missing its audio: re-import the matching local file.",
  "传杯上桌：{title}": "Now serving: {title}",
  "同席时只能点房主酒窖里的歌。": "At a shared table you can only pick from the host's cellar.",
  "酒窖正在整理，请稍候再导入。": "The cellar is busy. Try importing again in a moment.",
  "没有识别到可播放的音频文件，支持 MP3、WAV、OGG、FLAC 等格式。":
    "No playable audio found. MP3, WAV, OGG, FLAC and similar formats work.",
  "正在把 {n} 首歌调成吧台上的酒杯...": "Mixing {n} songs into glasses on the bar…",
  无名调酒师: "Unknown artist",
  本地酒窖: "Local cellar",
  今日特调: "House special",
  浏览器容量不足: "Browser storage is full",
  浏览器无法保存音频文件: "The browser can't store audio files",
  "《{names}》{more}无法解码，已退回（文件可能损坏，或可转成 MP3 / WAV 再试）。":
    " “{names}”{more} couldn't be decoded and were sent back (the file may be damaged; try converting to MP3 / WAV).",
  "》《": "”, “",
  " 等 {n} 首": " ({n} files in total)",
  "已添加 {n} 只酒杯。": "Added {n} glasses.",
  "菜单保存失败，请先导出 JSON 并保留原音频。":
    " Saving the menu failed: export the JSON first and keep your original audio.",
  "{why}，{n} 首仅本次可播；刷新后需重新导入，菜单信息仍会尽量保存。":
    " {why}: {n} tracks only play this session and must be re-imported after a refresh. The menu is still saved where possible.",
  "音频与封面已存入本地酒窖，下次打开自动恢复。":
    " Audio and covers are saved in the local cellar and come back next time.",
  没有可添加的音频: "No audio to add.",
  "没有可添加的音频。": "No audio to add.",
  "吧台上还没有酒杯，先添加几首本地音乐。": "No glasses on the bar yet. Add some local music first.",
  "房主的吧台上还没有酒杯。": "The host's bar has no glasses yet.",
  "吧台上还没有可播放的酒杯。": "There's nothing playable on the bar yet.",
  "这首歌需要重新导入本地文件后才能播放。": "Re-import this song's local file to play it.",
  顺序传杯: "In order",
  随机上酒: "Shuffle",
  吧台轮转: "Repeat all",
  单杯续杯: "Repeat one",
  "杯子已经沿吧台重新摆好。": "The glasses have been rearranged along the bar.",
  "同席时酒杯顺序由房主来摆。": "At a shared table, the host arranges the glasses.",
  "只能在当前菜单里调整酒杯顺序。": "You can only reorder glasses within the current menu page.",
  "新开的菜单页，等你来写第一杯。": "A fresh menu page, waiting for its first drink.",
  "已开新菜单：{name}": "New menu page: {name}",
  给这页菜单换个名字: "Rename this menu page",
  "至少要留一页菜单。": "Keep at least one menu page.",
  "删除歌单「{name}」？歌曲文件和其他歌单不会被删除。":
    "Delete the playlist “{name}”? Song files and other playlists stay.",
  "菜单已改名：{name}": "Menu page renamed: {name}",
  "这页菜单已撕下，歌曲仍留在酒窖里。": "Page torn out. The songs are still in the cellar.",
  "菜单配置已导出；音频文件本体不会包含在 JSON 里。":
    "Menu exported. The JSON doesn't include the audio files themselves.",
  "菜单配置导入成功；缺失的音频会显示为待重新导入。":
    "Menu imported. Missing audio shows as waiting to be re-imported.",
  "这份 JSON 看起来不是有效的酒馆菜单配置。": "That JSON doesn't look like a valid tavern menu.",
  "网络有点卡，正在重新接酒……": "The connection hiccupped; pouring again…",
  "这首音频无法解码，请检查文件是否完整，或转换为 MP3 / WAV 后重新导入。":
    "This audio can't be decoded. Check that the file is complete, or convert it to MP3 / WAV and import again.",
  今晚还没有点单: "Nothing ordered yet tonight",
  等待调酒师入场: "Waiting for the bartender",

  // ------------------------------------------------------- character dialog
  角色构图: "Character framing",
  关闭角色设置: "Close character settings",
  缩放: "Size",
  角色缩放: "Character size",
  水平位置: "Horizontal position",
  角色水平位置: "Character horizontal position",
  垂直位置: "Vertical position",
  角色垂直位置: "Character vertical position",
  动作幅度: "Motion",
  角色动作幅度: "Character motion",
  恢复默认构图: "Reset framing",
  完成: "Done",
  "角色图片无法读取，请确认 public/assets/lappland 里的图片还在。":
    "Couldn't read the character image. Check that the picture in public/assets/lappland is still there.",

  // ------------------------------------------------------------- bar scene
  吧台上的酒杯: "Glasses on the bar",
  "空酒杯：添加本地歌曲": "Empty glass: add local songs",
  暂停: "Pause",
  播放: "Play",
  吧台还空着: "The bar is empty",
  等房主把歌摆上来: "Waiting for the host to set out songs",
  "拖入音乐，或点击添加本地歌曲": "Drop music here, or click to add local songs",
  "原名：{title}": "Original title: {title}",
  "点击酒杯暂停 · 拖动调整顺序": "Click the glass to pause · drag to reorder",
  "点击酒杯开始 · 拖动调整顺序": "Click the glass to play · drag to reorder",
  "点击上杯 · 拖动换位": "Click to serve · drag to move",

  // ---------------------------------------------------------------- cellar
  "藏酒目录 · {n}": "Cellar list · {n}",
  搜索本地酒窖: "Search the local cellar",
  "曲名 / 调酒师": "Title / artist",
  已保存: "Saved",
  仅本次会话: "This session only",
  需重新导入: "Needs re-import",
  "确认删除 {title}": "Confirm deleting {title}",
  同时从所有歌单移除: "Also removes it from every playlist",
  取消删除: "Cancel delete",
  "删除 {title}": "Delete {title}",
  从本地酒窖删除: "Delete from the local cellar",
  "酒窖暂空。": "The cellar is empty.",
  "持久化保护已开启。": "Persistent storage is on.",
  "浏览器暂未授予保护，文件仍保存在本机；空间紧张时可能被清理。":
    "The browser hasn't granted protection yet. Files are still saved locally but may be cleared when space runs low.",
  "浏览器不支持持久化保护，请保留原音频文件。":
    "This browser doesn't support persistent storage. Keep your original audio files.",
  关闭酒窖管理: "Close cellar manager",
  读取中: "Loading",
  "{n} 首已存入 · 含音频和封面": "{n} saved · audio and covers",
  本次可播放: "Playable now",
  "{n} 首": "{n} tracks",
  首: "tracks",
  存储状态: "Storage",
  音频存储不可用: "Audio storage unavailable",
  已获持久化保护: "Persistent storage granted",
  普通本地存储: "Regular local storage",
  "本站占用约 {used} / 可用配额 {quota}，包含角色素材等数据。":
    "This site uses about {used} of {quota} available, including the character art.",
  "音频仅保存在这个浏览器。清除网站数据、无痕模式或浏览器清理可能移除文件，请保留原件。":
    "Audio is only stored in this browser. Clearing site data, private windows or browser cleanup can remove it, so keep your originals.",
  申请持久化保护: "Request persistent storage",
  入场仪式: "Entrance",
  重播入场: "Replay the entrance",
  下次直接进入吧台: "Go straight to the bar next time",
  备份菜单: "Back up the menu",
  "导入 JSON": "Import JSON",
  "导出 JSON": "Export JSON",
  "JSON 只含歌单和调酒笔记，不含音频。包含音频的完整备份包尚未提供。":
    "The JSON only holds playlists and bartender's notes, not audio. Full backups with audio aren't available yet.",
  "清空本浏览器的全部歌曲、封面、歌单和笔记？原文件及角色图片不受影响。":
    "Clear every song, cover, playlist and note in this browser? Your original files and the character image are not affected.",
  "酒窖已清空。": "Cellar cleared.",
  "清空失败，原音乐库仍然保留。": "Clearing failed; your library is still there.",
  确认清空音乐库: "Confirm clearing the library",
  取消: "Cancel",
  清空本地酒窖: "Clear the local cellar",

  // ------------------------------------------------------- listen together
  同席: "Listen Together",
  "同席 · 一起听": "Listen Together",
  在座的人: "At the table",
  "（你）": " (you)",
  "正在接通外网（Cloudflare 临时隧道，大约 10 秒）……":
    "Opening the door to the internet (Cloudflare quick tunnel, about 10 s)…",
  "第一次使用：正在下载 Cloudflare 隧道工具（约 20 MB，只需一次）…":
    "First time: downloading Cloudflare's tunnel tool (about 20 MB, only once)…",
  外网没接通: "Couldn't reach the internet",
  隧道没有启动成功: "The tunnel didn't start.",
  "隧道没有启动成功。": "The tunnel didn't start.",
  重试: "Retry",
  "邀请链接 · 发给朋友，用浏览器打开就能入座": "Invite link · send it to friends; they open it in a browser to join",
  邀请链接: "Invite link",
  已复制: "Copied",
  复制邀请链接: "Copy invite link",
  "链接刚生成时，可能要等十几秒才能打开；每次开房都会换一个新链接。":
    "A fresh link can take 10–20 seconds to start working. Every new room gets a new link.",
  "你在 {host} 的酒馆": "You're at {host}'s tavern",
  还没入座: "Not seated yet",
  "和大家听同一首歌 · 谁都可以点歌、暂停、切歌、拖进度":
    "Everyone hears the same song · anyone can pick, pause, skip or seek",
  "网络断了一下，正在重新连接……": "Connection dropped; reconnecting…",
  "用房主发来的邀请链接入座。": "Use the invite link from the host to join.",
  离席: "Leave the table",
  "歌是房主的电脑实时传过来的，网速慢时会先缓冲一下再追上大家。音量只影响你自己。":
    "Songs stream live from the host's computer. On a slow connection it buffers first, then catches up. Volume only affects you.",
  "正在查看……": "Checking…",
  现在开不了房间: "Can't open a room right now",
  "同席需要用「{launcher}」打开酒馆。现在这个页面是开发模式（npm run dev）。":
    "Listen Together needs the tavern started with “{launcher}”. This page is running in dev mode (npm run dev).",
  开放同席: "Open the table",
  你的电脑就是酒馆: "Your computer is the tavern",
  "你的电脑就是酒馆，朋友不用装任何东西": "Your computer is the tavern; friends don't install anything",
  "点「开放同席」后会生成一个邀请链接，发给朋友，他们在任何地方用浏览器打开就能入座。":
    "“Open the table” creates an invite link. Send it to friends; they can join from anywhere in a browser.",
  "你正在放的歌会从这台电脑传给大家，所有人听到的进度是对齐的。":
    "The song you're playing streams from this computer, and everyone stays in sync.",
  "在座的人都能点歌、播放 / 暂停、切歌、拖进度；歌单只能你来改。":
    "Everyone at the table can pick songs, play / pause, skip and seek. Only you can edit playlists.",
  你的称呼: "Your name",
  房主: "Host",
  同席进行中: "Table is open",
  "{n} 人在座 · 关掉黑色窗口或点「打烊」房间就会关闭":
    "{n} at the table · closing the black window or “Close up” ends the room",
  "打烊（关闭房间）": "Close up (end the room)",
  "只有拿到链接的人能进来。链接里带着房间密钥，别发到公开的地方。":
    "Only people with the link can join. It contains the room key, so don't post it publicly.",
  "正在敲门……": "Knocking…",
  连接朋友的酒馆: "Connecting to your friend's tavern",
  "{host} 请你喝一杯": "{host} is buying you a drink",
  朋友: "A friend",
  "入座后会和大家一起听 {host} 正在放的歌。在座的每个人都可以点歌、暂停、切歌和拖进度。":
    "Take a seat to listen along with whatever {host} is playing. Everyone at the table can pick songs, pause, skip and seek.",
  怎么称呼你: "What should we call you?",
  客人: "Guest",
  入座: "Take a seat",
  这张邀请已经失效: "This invite has expired",
  酒馆打烊了: "The tavern has closed",
  敲不开门: "No one's answering",
  "房主可能已经关闭了房间，或者链接复制得不完整。请让他重新发一次邀请链接。":
    "The host may have closed the room, or the link was copied incompletely. Ask them to send the invite again.",
  "房主关闭了房间。": "The host closed the room.",
  "房主的酒馆现在连不上：可能他关掉了窗口，或者网络不通。":
    "Can't reach the host's tavern right now. They may have closed the window, or the network is down.",
  再敲一次: "Knock again",
  同席邀请: "Invitation",
  "INVITATION · 同席邀请": "INVITATION",
  "{n} 人在座": "{n} at the table",
  未入座: "Not seated",
  "开房间，朋友用链接入座": "Open a room; friends join with a link",
  "同席 · {names}": "At the table · {names}",
  "同席 · 正在重新连接": "Listen Together · reconnecting",
  "同席房间，{n} 人在座": "Listen Together room, {n} at the table",
  "{name} 入座了": "{name} took a seat",
  "{name} 离席了": "{name} left the table",
  "房间已在另一个标签页里打开。": "The room is open in another tab.",
  "{who} 点了《{title}》": "{who} ordered “{title}”",
  一杯: "a glass",
  "房间没能打开：请确认是用「{launcher}」启动的。":
    "Couldn't open the room. Make sure the tavern was started with “{launcher}”.",
  "{who} 端上了《{title}》": "{who} served “{title}”",
  "{who} 调了进度": "{who} moved the playhead",
  "{who} 继续播放": "{who} resumed",
  "{who} 暂停了": "{who} paused",
  "已入座 {host} 的酒馆": "You're seated at {host}'s tavern",
  "房间已经关闭了。": "The room has closed.",
  "房主暂时不在，稍后再试。": "The host stepped away. Try again shortly.",
  "手速太快啦，慢一点。": "Easy there, one at a time.",
  "这条指令没送到，网络好像不太稳。": "That didn't reach the host; the connection seems shaky.",
  "{who} 点了一杯": "{who} ordered a glass",
  "{who} 按了播放 / 暂停": "{who} pressed play / pause",
  "{who} 切到下一杯": "{who} skipped to the next glass",
  "{who} 换回上一杯": "{who} went back a glass",
  "{who} 拖了进度": "{who} moved the playhead",
  "{who} 换了上酒方式": "{who} changed the play mode",
  房主打烊了: "The host closed up",
  "房主离开了，房间已关闭": "The host left; the room is closed",
  "房主暂时离开，稍等片刻…": "The host stepped away; hang on a moment…",

  // ---------------------------------------------------------------- spotify
  "Spotify 酒单": "Spotify playlists",
  "关闭{title}": "Close {title}",

  // ------------------------------------------------------------------- HUD
  播放进度: "Playback position",
  "更多 · 角色 / 来源 / 同席": "More · character / sources / listen together",
  更多选项: "More options",
  "导出菜单 JSON": "Export menu JSON",
  不含音频: "No audio included",
  "存储、备份与入场": "Storage, backup & entrance",
  角色构图与动画: "Character framing & motion",
  画质: "Quality",
  自动: "Auto",
  高: "High",
  中: "Medium",
  低: "Low",
  酒馆工具: "Tavern tools",
  "酒单 · 歌单、搜索与调酒笔记": "Menu · playlists, search & bartender's notes",
  打开酒单: "Open the menu",
  "添加本地歌曲 · Ctrl/Cmd+O": "Add local songs · Ctrl/Cmd+O",
  添加本地歌曲: "Add local songs",
  导入菜单配置: "Import menu config",
  "导出菜单 JSON（不含音频）": "Export menu JSON (no audio)",
  导出菜单配置: "Export menu config",
  "本地酒窖 · 存储、备份与入场": "Local cellar · storage, backup & entrance",
  本地酒窖与入场设置: "Local cellar & entrance settings",
  "拉普兰德 · 构图与动作幅度": "Lappland · framing & motion",
  打开酒单侧栏: "Open the menu panel",
  酒单: "Menu",
  当前饮品: "Now serving",
  等房主摆上酒杯: "Waiting for the host's glasses",
  "{host} 的吧台上还没有歌": "{host}'s bar has no songs yet",
  "入座之后，就能和大家一起听": "Take a seat to listen along",
  "把本地音乐拖进酒馆，或点下面的铜钮添加 · MP3 / WAV / OGG / FLAC":
    "Drag local music into the tavern, or use the brass button below · MP3 / WAV / OGG / FLAC",
  选一杯酒: "Pick a glass",
  "调酒师 {name}": "Mixed by {name}",
  "产地 {name}": "From {name}",
  房主缺原酒: "Host is missing the audio",
  仅本次可播: "This session only",
  播放控制: "Playback controls",
  添加歌曲: "Add songs",
  "{mode} · 点击切换": "{mode} · click to change",
  切换播放模式: "Change play mode",
  上一杯: "Previous glass",
  上一首: "Previous track",
  "暂停 · 空格": "Pause · Space",
  "开席 · 空格": "Play · Space",
  下一杯: "Next glass",
  下一首: "Next track",
  "酒量 {level}% · 滚轮微调": "Pour {level}% · scroll to fine-tune",
  音量: "Volume",
  "语言 · Language": "语言 · Language",
  性能模式: "Performance mode",
  "低画质 · 20 帧 · 切走后停止渲染": "Low quality · 20 fps · stops drawing when you switch away",
  开: "On",
  关: "Off",

  // ------------------------------------------------------------ menu drawer
  "CARTE DU SOIR · 今夜酒单": "CARTE DU SOIR · TONIGHT'S MENU",
  关闭酒单: "Close the menu",
  "收起 · Esc": "Close · Esc",
  歌单分区: "Menu pages",
  新菜单名: "New page name",
  创建歌单: "Create playlist",
  新建歌单: "New playlist",
  新开一页菜单: "Start a new menu page",
  菜单名称: "Page name",
  保存菜单名称: "Save page name",
  取消改名: "Cancel rename",
  "撕下「{name}」？歌曲仍留在酒窖。": "Tear out “{name}”? The songs stay in the cellar.",
  撕下: "Tear out",
  留着: "Keep it",
  "这一页还没有题词。": "No inscription on this page yet.",
  重命名歌单: "Rename playlist",
  改名: "Rename",
  删除歌单: "Delete playlist",
  撕下这页: "Tear out this page",
  "搜索饮品 / 调酒师 / 口味": "Search drinks / artists / flavours",
  清除搜索: "Clear search",
  没有找到这款酒: "No such drink",
  这页菜单还没写字: "This page is still blank",
  "换个关键词，或清空搜索。": "Try another word, or clear the search.",
  "房主还没往这页菜单里放歌。": "The host hasn't put songs on this page yet.",
  "拖入 MP3、WAV、OGG 或 FLAC，或点这里添加本地歌曲。":
    "Drop MP3, WAV, OGG or FLAC files, or click here to add local songs.",
  编辑歌曲信息: "Edit song details",
  调酒笔记: "Bartender's notes",
  导入菜单: "Import menu",
  导出菜单: "Export menu",
  关闭编辑: "Close editor",
  回到酒单: "Back to the menu",
  "调酒笔记 · BARTENDER'S NOTE": "BARTENDER'S NOTE",
  饮品别名: "Drink name",
  口味标签: "Flavour tags",
  "烈酒, 低语, 午夜": "strong, whisper, midnight",
  "标签会改变酒色：烈/红 → 深红，甜/金 → 金黄，午夜/低语 → 紫黑，柔/蓝 → 透蓝，苦/烟 → 烟灰。":
    "Tags set the colour: strong/red → crimson, sweet/gold → golden, midnight/whisper → violet black, soft/blue → clear blue, bitter/smoke → smoke grey. (rock, jazz, night, blue, smoke… work too)",
  杯型: "Glass",
  酒色: "Colour",
  按标签: "By tags",
  放入菜单: "On menu pages",
  原曲名: "Original title",
  文件: "File",
  大小: "Size",
  状态: "Status",
  已存入本地酒窖: "Saved in the local cellar",
  仅本次会话可播: "Playable this session only",
  待重新导入: "Waiting for re-import",

  // ---------------------------------------------------------------- entrance
  酒馆木门场景: "Tavern door",
  酒窖苏醒中: "The cellar is waking",
  欢迎光临: "Welcome",
  进入酒馆: "Enter the tavern",
  下次直接进入: "Skip next time",
  跳过入场动画: "Skip the entrance",

  // ------------------------------------------------- drinks (data labels)
  高脚杯: "goblet",
  碟形杯: "coupe",
  马天尼杯: "martini",
  古典杯: "rocks",
  高球杯: "highball",
  白兰地杯: "snifter",
  香槟杯: "flute",
  尼克诺拉杯: "Nick & Nora",
  飓风杯: "hurricane",
  深红: "crimson",
  琥珀: "amber",
  紫黑: "violet black",
  金黄: "golden",
  透蓝: "clear blue",
  烟灰: "smoke grey",
  苦艾绿: "absinthe green",
  空杯: "empty glass",
  长饮: "long drink",
  短杯: "short pour",
  烈酒: "strong",
  低语: "whisper",
  // default menu pages
  未调配: "Unmixed",
  "还没有写进菜单的私藏。": "Private stock not on the menu yet.",
  午夜低语: "Midnight Whispers",
  "适合压低声音播放。": "Best played quietly.",
  私人珍藏: "Private Reserve",
  "只给熟客看的那一页。": "The page only regulars get to see.",
  "新到的酒先在这里醒一醒。": "New arrivals breathe here first.",

  // ---------------------------------------------------------------- Spotify
  "复制":
    "Copy",
  "你在 Spotify 页面上取消了授权。":
    "You cancelled the authorization on Spotify's page.",
  "这次登录等太久过期了，再点一次「登录 Spotify」。":
    "This sign-in waited too long and expired. Click “Sign in to Spotify” again.",
  "这个网址不是刚才那次登录的：再点一次「登录 Spotify」，复制新跳出来的网址。":
    "That address isn't from the sign-in you just started. Click “Sign in to Spotify” again and copy the new address.",
  "连不上 Spotify，检查一下网络。":
    "Can't reach Spotify. Check your connection.",
  "还没有 Spotify 应用的 Client ID。":
    "There's no Spotify app Client ID yet.",
  "授权没有完成（{why}）。再试一次。":
    "The authorization didn't finish ({why}). Try again.",
  "点下面的按钮，在弹出的小窗口里登录 Spotify 并同意授权。":
    "Click the button below, sign in to Spotify in the small window and agree.",
  "登录 Spotify":
    "Sign in to Spotify",
  "授权后小窗口会跳到一个打不开的页面（网址以 {prefix} 开头）——这是正常的。把那个窗口地址栏里的网址整个复制，粘贴到这里：":
    "After you agree, the small window jumps to a page that won't load (its address starts with {prefix}) — that's expected. Copy the whole address from that window's address bar and paste it here:",
  "粘贴 Spotify 跳转后的网址":
    "Paste the address Spotify sent you to",
  "完成登录":
    "Finish sign-in",
  "播放器就绪":
    "Player ready",
  "播放器加载中……":
    "Loading the player…",
  "播放时自动启动播放器":
    "The player starts when something plays",
  "已连接 · {name}":
    "Connected · {name}",
  "正在确认 Spotify 账号……":
    "Checking your Spotify account…",
  "这个账号还不能用":
    "This account can't be used yet",
  "Spotify 暂时连不上":
    "Spotify can't be reached right now",
  "这个 Spotify 账号还不在应用的用户名单里：请在开发者后台的 User Management 里加上它的邮箱。":
    "This Spotify account isn't on the app's user list yet: add its email under User Management in the developer dashboard.",
  "稍后再试":
    "Try again later",
  "Spotify 拒绝了读取歌单：这个账号可能不在应用的用户名单里。":
    "Spotify refused to share your playlists: this account may not be on the app's user list.",
  "没能读到你的歌单，稍后再试。":
    "Couldn't read your playlists. Try again later.",
  "认不出这个链接：在 Spotify 里点歌单的「分享 → 复制链接」再粘贴。":
    "That link wasn't recognized. In Spotify, use the playlist's “Share → Copy link” and paste it.",
  "「{name}」不是你建的歌单，Spotify 不让读取它的曲目。在 Spotify 里把歌全选 →「添加到歌单」→ 新建你自己的歌单，再放上来。":
    "“{name}” isn't your playlist, and Spotify won't share its songs. In Spotify, select all the songs → “Add to playlist” → a new playlist of your own, then pour that one.",
  "Spotify 上找不到这个歌单（可能是私密的或已删除）。":
    "Spotify can't find this playlist (it may be private or deleted).",
  "没能读取这个歌单，稍后再试。":
    "Couldn't read this playlist. Try again later.",
  "你在 Spotify 上点过❤的歌":
    "Songs you've ❤'d on Spotify",
  "{n} 首 · {owner}":
    "{n} songs · {owner}",
  "别人的歌单 · Spotify 不开放曲目":
    "Someone else's · Spotify doesn't share its songs",
  "已在酒单":
    "On the menu",
  "放上吧台":
    "Pour it",
  "选一个 Spotify 歌单":
    "Pick a Spotify playlist",
  "选一个歌单放上吧台":
    "Pick a playlist to pour",
  "刷新歌单列表":
    "Refresh the playlist list",
  "刷新":
    "Refresh",
  "我喜欢的歌曲":
    "Liked Songs",
  "正在读取你的歌单……":
    "Reading your playlists…",
  "或粘贴歌单链接 open.spotify.com/playlist/…":
    "Or paste a playlist link open.spotify.com/playlist/…",
  "Spotify 歌单链接":
    "Spotify playlist link",
  "Spotify 只开放你自己建的、或你参与协作的歌单的曲目。想用别人的歌单：在 Spotify 里把歌全选 →「添加到歌单」→ 新建一个你的歌单。":
    "Spotify only shares the songs of playlists you made or collaborate on. To use someone else's: in Spotify, select all the songs → “Add to playlist” → a new playlist of your own.",
  "第一次使用：建一个自己的 Spotify 应用":
    "First time: create your own Spotify app",
  "免费，大约 3 分钟，只需要做一次":
    "Free, about 3 minutes, only once",
  "打开 Spotify 开发者后台，用你的 Spotify 账号登录，点「Create app」。":
    "Open the Spotify developer dashboard, sign in with your Spotify account and click “Create app”.",
  "名字和描述随便填。「Redirect URIs」填下面这个地址（一字不差），「Which API/SDKs」勾选 Web API 和 Web Playback SDK，保存。":
    "Any name and description will do. Under “Redirect URIs” enter the address below exactly; under “Which API/SDKs” tick Web API and Web Playback SDK; save.",
  "打开应用的 Settings，复制「Client ID」粘贴到这里（不要 Client secret）：":
    "Open the app's Settings, copy the “Client ID” and paste it here (not the Client secret):",
  "Client ID 应该是 32 位的字母数字，再检查一下。":
    "A Client ID is 32 letters and digits. Check it again.",
  "保存":
    "Save",
  "想和朋友一起听：在应用的「User Management」里加上他们 Spotify 账号的名字和邮箱（开发中的应用最多 5 人）。":
    "To listen with friends: add their Spotify account names and emails under the app's “User Management” (an app in development allows up to 5 people).",
  "Client ID 是公开的应用编号，不是密码。酒馆不需要、也不会要你的 Client secret 或 Spotify 密码。":
    "A Client ID is the app's public number, not a password. The tavern never needs or asks for your Client secret or Spotify password.",
  "账号":
    "Account",
  "Spotify Premium（网页播放的要求）":
    "Spotify Premium (required for playback in a browser)",
  "浏览器":
    "Browser",
  "电脑上的 Chrome / Edge / Firefox":
    "Chrome / Edge / Firefox on a computer",
  "音频":
    "Audio",
  "Spotify 直接播到你的浏览器，不下载、不转播":
    "Streams from Spotify straight to your browser; never downloaded or relayed",
  "Spotify · 一起听":
    "Spotify · Listen together",
  "{host} 还没连上 Spotify":
    "{host} hasn't connected Spotify yet",
  "房主连好之后，这里就能用你自己的 Spotify 登录。":
    "Once the host connects, you can sign in with your own Spotify here.",
  "用你自己的 Spotify 一起听":
    "Listen along with your own Spotify",
  "Spotify 不允许把一个人的音乐转播给别人：每位朋友用自己的账号播放，酒馆负责把大家对齐到同一秒。":
    "Spotify doesn't allow one person's music to be relayed to others: every friend plays it with their own account, and the tavern keeps everyone on the same second.",
  "先确认 {host} 已经在 Spotify 开发者后台的 User Management 里加上了你的 Spotify 邮箱。":
    "First make sure {host} has added your Spotify email under User Management in the Spotify developer dashboard.",
  "在酒馆里继续听":
    "Keep listening in the tavern",
  "加好了，再试一次":
    "Added — try again",
  "重新加载播放器":
    "Reload the player",
  "退出 Spotify":
    "Sign out of Spotify",
  "歌从 Spotify 直接播到你的浏览器，用的是你自己的账号；房主那边只告诉你现在放哪首、到第几秒。":
    "Songs stream from Spotify straight to your browser on your own account; the host only tells you which song and which second.",
  "应用已就绪，连接你的 Spotify":
    "App ready — connect your Spotify",
  "更换":
    "Change",
  "连接 Spotify":
    "Connect Spotify",
  "会弹出 Spotify 的登录窗口，同意后自动回来。登录信息只存在这台电脑的浏览器里，随时可以退出。":
    "Spotify's sign-in opens in a small window and comes back by itself. The sign-in stays only in this computer's browser; you can sign out any time.",
  "再检查一次":
    "Check again",
  "音乐由 Spotify 提供，直接播到你的浏览器，酒馆不下载、不转播。同席时，朋友用他们自己的 Spotify 账号同步收听。":
    "Music is supplied by Spotify and streams straight to your browser; the tavern never downloads or relays it. At a shared table, friends listen in sync on their own Spotify accounts.",
  "Spotify 的歌要用你自己的 Spotify 账号听。":
    "Spotify songs play on your own Spotify account.",
  "已连接":
    "Connected",
  "去登录":
    "Sign in",
  "Spotify 的歌不经过你的电脑：朋友用自己的 Spotify Premium 登录（要先加进你应用的用户名单），酒馆把大家对齐到同一秒。":
    "Spotify songs don't go through your computer: friends sign in with their own Spotify Premium (add them to your app's user list first) and the tavern keeps everyone on the same second.",
  "Spotify 歌单":
    "Spotify playlists",
  "撕下「{name}」？Spotify 上的歌单不受影响。":
    "Tear out “{name}”? The playlist on Spotify is not affected.",
  "在 Spotify 打开这个歌单":
    "Open this playlist in Spotify",
  "在 Spotify 打开":
    "Open in Spotify",
  "从 Spotify 重新取歌":
    "Fetch the songs from Spotify again",
  "从 Spotify 刷新":
    "Refresh from Spotify",
  "正在从 Spotify 取歌……":
    "Fetching the songs from Spotify…",
  "连上 Spotify 后，这页会自动上酒":
    "Connect Spotify and this page fills itself",
  "这个歌单里还没有能播放的歌":
    "Nothing in this playlist can be played yet",
  "等房主那边取好歌。":
    "Waiting for the host to fetch the songs.",
  "歌单内容跟着 Spotify 走：在 Spotify 里加歌，回来点刷新。":
    "This page follows Spotify: add songs there, then refresh here.",
  "Spotify 未连接":
    "Spotify not connected",
  "在 Spotify 打开这首歌":
    "Open this song in Spotify",
  "用你自己的账号一起听":
    "Listen along on your own account",
  "点这里连接 Spotify":
    "Click to connect Spotify",
  "把你的 Spotify 歌单放上吧台":
    "Put your Spotify playlists on the bar",
  "房主的 Spotify 还没准备好":
    "The host's Spotify isn't ready yet",
  "这杯来自 Spotify，用你自己的 Spotify 登录就能一起听":
    "This one's from Spotify — sign in with your own Spotify to listen along",
  "登录":
    "Sign in",
  "你的 Spotify 账号还没被房主加进名单":
    "The host hasn't added your Spotify account to the list yet",
  "查看":
    "Details",
  "Spotify 正在你的其他设备上播放":
    "Spotify is playing on another of your devices",
  "在这里听":
    "Listen here",
  "浏览器要你点一下才肯出声":
    "Your browser wants a click before it plays sound",
  "点我出声":
    "Click for sound",
  "连接":
    "Connect",
  "《{album}》封面":
    "Cover of “{album}”",
  "由 Spotify 提供":
    "Supplied by Spotify",
  "这杯来自 Spotify：先在「Spotify 酒单」里连上你的 Spotify。":
    "This one's from Spotify: connect your Spotify in “Spotify playlists” first.",
  "Spotify 歌单的顺序跟着 Spotify 走，要调顺序请在 Spotify 里改。":
    "A Spotify page keeps Spotify's order; reorder it in Spotify.",
  "Spotify 在别处被暂停或换了设备，酒馆这边也先停下。":
    "Spotify was paused or moved to another device, so the tavern paused too.",
  "「{name}」从 Spotify 端上来了 {n} 杯。":
    "“{name}”: {n} glasses poured from Spotify.",
  "「{name}」里没有能在网页上播放的歌。":
    "Nothing in “{name}” can be played in a browser.",
  "Spotify 只允许读取你自己建的或协作的歌单，「{name}」读不到曲目。":
    "Spotify only shares playlists you made or collaborate on, so “{name}” has no songs here.",
  "Spotify 上找不到「{name}」了，可能已被删除。":
    "Spotify can't find “{name}” any more; it may have been deleted.",
  "没能从 Spotify 取到「{name}」，稍后在酒单里点刷新再试。":
    "Couldn't fetch “{name}” from Spotify. Try refresh in the menu later.",
  "Spotify 已授权":
    "Spotify authorized",
  "这次登录是从朋友的酒馆发起的：把下面这个网址整个复制，粘贴回那个页面的 Spotify 窗口里。":
    "This sign-in was started from a friend's tavern: copy this whole address and paste it back into the Spotify window on that page.",
  "已连上 Spotify":
    "Spotify connected",
  "可以关掉这个小窗口，回到酒馆了。":
    "You can close this small window and go back to the tavern.",
  "Spotify 没连上":
    "Spotify didn't connect",
  "这次登录等太久过期了，回酒馆重新点一次「连接 Spotify」。":
    "This sign-in waited too long and expired. Go back and click “Connect Spotify” again.",
  "授权没有完成（{why}）。回酒馆再试一次。":
    "The authorization didn't finish ({why}). Go back to the tavern and try again.",
  "回到酒馆":
    "Back to the tavern",
  "复制网址":
    "Copy address",
  "网页里播放 Spotify 需要 Premium 账号（Spotify 的规定）。":
    "Playing Spotify in a browser needs a Premium account (Spotify's rule).",
  "这个 Spotify 账号还不在房主应用的用户名单里：请房主在 Spotify 开发者后台的 User Management 里加上你的邮箱。":
    "This Spotify account isn't on the host's app user list yet: ask the host to add your email under User Management in the Spotify developer dashboard.",
  "Spotify 登录失效了，请重新连接。":
    "The Spotify sign-in expired. Please connect again.",
  "这个浏览器放不了 Spotify（需要受保护音频支持）：请用电脑上的 Chrome、Edge 或 Firefox。":
    "This browser can't play Spotify (it needs protected-audio support): use Chrome, Edge or Firefox on a computer.",
  "Spotify 暂时找不到酒馆这台播放器，稍等几秒再试。":
    "Spotify can't find the tavern's player yet. Wait a few seconds and try again.",
  "Spotify 播放器没加载出来：检查网络，或暂时关掉拦截广告 / 隐私类扩展。":
    "Spotify's player didn't load: check your connection, or pause ad-blocking / privacy extensions.",
  "Spotify 没能开始播放，再试一次。":
    "Spotify couldn't start playing. Try again.",
  "浏览器拦住了小窗口：点这里打开 Spotify 登录":
    "The browser blocked the small window: click here to open Spotify's sign-in",

  // ---------------------------------------------------------------- YouTube
  "正在读取 YouTube 歌单……":
    "Reading the YouTube playlist…",
  "读不到这个歌单：它可能是私密的，或者链接不完整。":
    "Couldn't read this playlist: it may be private, or the link is incomplete.",
  "正在给 {n} 个视频写上名字……":
    "Labelling {n} videos…",
  "YouTube 歌单":
    "YouTube playlists",
  "YouTube 播放器没加载出来：检查网络，或暂时关掉拦截广告的扩展。":
    "YouTube's player didn't load: check your connection, or pause ad-blocking extensions.",
  "正在查看这个视频……":
    "Looking at this video…",
  "这个视频已被删除，或者是私密的。":
    "This video was removed or is private.",
  "这个视频的作者不允许在别的网站播放，换一个吧。":
    "This video's owner doesn't allow it to play on other sites. Pick another.",
  "认不出这个链接：复制 YouTube 地址栏里的网址，或歌单 / 视频的「分享」链接。":
    "That link wasn't recognized. Copy the address from YouTube's address bar, or the playlist / video “Share” link.",
  "把 YouTube 歌单放上吧台":
    "Put YouTube playlists on the bar",
  "不用账号，同席的朋友也不用：每个人在自己的浏览器里看，酒馆把大家对齐到同一秒。":
    "No account needed, for you or your friends: everyone watches in their own browser and the tavern keeps everyone on the same second.",
  "粘贴 YouTube 歌单或视频链接":
    "Paste a YouTube playlist or video link",
  "YouTube 链接":
    "YouTube link",
  "酒单里的 YouTube 页":
    "YouTube pages on the menu",
  "资料已过期，需要重新读取":
    "Expired — needs reading again",
  "{n} 个视频 · {when}":
    "{n} videos · {when}",
  "今天读取":
    "read today",
  "{d} 天前读取":
    "read {d} days ago",
  "去看看":
    "Show",
  "吧台右下角会出现一块 YouTube 小屏幕：YouTube 规定播放器必须看得见，不能只放声音。":
    "A small YouTube screen appears in the corner of the bar: YouTube requires its player to stay visible, so it can't be sound only.",
  "YouTube 可能会插播广告（每个人各自的），广告播完酒馆会自动追上进度。":
    "YouTube may show ads (each person their own); after an ad the tavern catches you up automatically.",
  "有些视频的作者不允许在别的网站播放，轮到它时会自动跳过。":
    "Some owners don't allow their videos on other sites; those are skipped automatically.",
  "一个歌单最多读前 {n} 个视频。YouTube 规定读到的资料最多保存 30 天，过期后点「刷新」重新读取。":
    "Up to the first {n} videos of a playlist are read. YouTube lets apps keep what they read for 30 days at most; after that, press “Refresh” to read it again.",
  "视频由 YouTube 提供，直接在你的浏览器里播放，酒馆不下载、不转播。使用即表示同意":
    "Videos are provided by YouTube and play straight in your browser; the tavern never downloads or relays them. By using them you agree to the",
  "YouTube 服务条款":
    "YouTube Terms of Service",
  "，并适用":
    "; the",
  "Google 隐私权政策":
    "Google Privacy Policy",
  "。":
    " applies.",
  "可以粘贴歌单链接（含 list=），也可以粘贴单个视频，单个视频会放进「YouTube 点歌」页。":
    "Paste a playlist link (with list=) or a single video; single videos go onto the “YouTube Picks” page.",
  "没有声音？点一下画面里的播放键。":
    "No sound? Press play inside the video.",
  "YouTube 屏幕":
    "YouTube screen",
  "在 YouTube 打开":
    "Open on YouTube",
  "缩小屏幕":
    "Smaller screen",
  "放大屏幕":
    "Bigger screen",
  "撕下「{name}」？YouTube 上的视频不受影响。":
    "Tear out “{name}”? Nothing changes on YouTube.",
  "在 YouTube 打开这个歌单":
    "Open this playlist on YouTube",
  "从 YouTube 重新读取":
    "Read again from YouTube",
  "从 YouTube 刷新":
    "Refresh from YouTube",
  "这页的 YouTube 资料过期了":
    "This page's YouTube data expired",
  "这页还没有能播放的视频":
    "No playable videos on this page yet",
  "等房主那边放上视频。":
    "Waiting for the host to add videos.",
  "YouTube 规定读到的资料最多保存 30 天：点这里重新读取。":
    "YouTube lets apps keep what they read for 30 days at most: click to read it again.",
  "点这里粘贴 YouTube 歌单或视频链接。":
    "Click to paste a YouTube playlist or video link.",
  "不能在别的网站播放":
    "can't play on other sites",
  "在 YouTube 打开这个视频":
    "Open this video on YouTube",
  "从点歌单里拿掉":
    "Remove from YouTube Picks",
  "拿掉":
    "Remove",
  "不用账号，朋友也能一起看":
    "No account needed, friends can watch along",
  "YouTube 歌单的顺序跟着 YouTube 走，要调顺序请在 YouTube 里改。":
    "A YouTube playlist page keeps YouTube's order; reorder it on YouTube.",
  "Spotify 和 YouTube 的歌只待在它们自己的歌单页里。":
    "Spotify and YouTube songs stay on their own pages.",
  "这个 YouTube 视频已被删除或设为私密，跳过这一杯。":
    "This YouTube video was removed or made private; skipping it.",
  "这个视频的作者不允许在别的网站播放，跳过这一杯。":
    "This video's owner doesn't allow it on other sites; skipping it.",
  "YouTube 播放出错了，跳过这一杯。":
    "YouTube hit a playback error; skipping this one.",
  "「{name}」已从 YouTube 重新读取：{n} 杯。":
    "“{name}” read again from YouTube: {n} glasses.",
  "「{name}」从 YouTube 端上来了 {n} 杯。":
    "“{name}”: {n} glasses poured from YouTube.",
  "《{title}》已经在「{name}」里了。":
    "“{title}” is already on “{name}”.",
  "YouTube 点歌":
    "YouTube Picks",
  "《{title}》加进了 YouTube 点歌。":
    "“{title}” added to YouTube Picks.",
  "YouTube 视频也不经过你的电脑：朋友什么账号都不用，各自的浏览器里会出现同一块小屏幕。":
    "YouTube videos don't go through your computer either: friends need no account, and the same little screen appears in each of their browsers.",
  "B站":
    "Bilibili",
  "B站点歌":
    "Bilibili Picks",
  "B站歌单":
    "Bilibili",
  "B站上已失效":
    "Gone from Bilibili",
  "B站列表的顺序跟着 B站走，要调顺序请在 B站里改。":
    "A Bilibili list keeps Bilibili's order; reorder it on Bilibili.",
  "B站屏幕":
    "Bilibili screen",
  "B站播放器":
    "Bilibili player",
  "B站播放器没加载出来（网络，或这个视频在你所在的地区看不了），跳过这一杯。":
    "The Bilibili player didn't load (the network, or the video isn't available where you are). Skipping this glass.",
  "B站暂时拒绝了读取（访问太频繁），过一两分钟再试。":
    "Bilibili refused for now (too many requests). Try again in a minute or two.",
  "B站用户协议":
    "Bilibili Terms of Use",
  "B站给外链播放器的画质上限是 360P（登录了也一样，这是 B站的规定）。想看高清，点小屏幕上的「在 B站打开」。":
    "Bilibili caps embedded players at 360p (signed in or not — Bilibili's rule). For HD, use “Open on Bilibili” on the little screen.",
  "B站说这个视频 / 列表不存在了（被删、设为私密或还在审核）。":
    "Bilibili says this video / list doesn't exist (deleted, private or still under review).",
  "B站链接":
    "Bilibili link",
  "Spotify、YouTube 和 B站的歌只待在它们自己的歌单页里。":
    "Spotify, YouTube and Bilibili songs stay on their own pages.",
  "{kind} · {n} 个视频 · {when}":
    "{kind} · {n} videos · {when}",
  "{n} 个视频":
    "{n} videos",
  "《{title}》加进了 B站点歌。":
    "“{title}” added to Bilibili Picks.",
  "「{name}」从 B站端上来了 {n} 杯。":
    "“{name}”: {n} glasses poured from Bilibili.",
  "「{name}」已从 B站重新读取：{n} 杯。":
    "“{name}” read again from Bilibili: {n} glasses.",
  "不用登录，同席的朋友也不用：每个人在自己的浏览器里看，酒馆帮大家对齐进度。":
    "No sign-in, for you or your friends: everyone watches in their own browser and the tavern keeps you in step.",
  "从 B站刷新":
    "Refresh from Bilibili",
  "从 B站重新读取":
    "Read again from Bilibili",
  "分P视频":
    "Multi-part video",
  "单个视频会放进「B站点歌」页；合集、系列、收藏夹和分P视频会各自变成一页。":
    "Single videos go onto the “Bilibili Picks” page; collections, series, favourites and multi-part videos each become a page.",
  "合集":
    "Collection",
  "吧台右下角会出现一块 B站小屏幕，视频在里面播放。":
    "A little Bilibili screen appears at the bottom right of the bar; the video plays there.",
  "在 B站打开":
    "Open on Bilibili",
  "在 B站打开这个列表":
    "Open this list on Bilibili",
  "在 B站打开这个视频":
    "Open this video on Bilibili",
  "在 B站打开（高清）":
    "Open on Bilibili (HD)",
  "在 B站看高清":
    "Watch in HD on Bilibili",
  "已加进「B站点歌」。它属于合集「{title}」（{n} 个视频）。":
    "Added to “Bilibili Picks”. It's part of the collection “{title}” ({n} videos).",
  "把 B站视频放上吧台":
    "Put Bilibili videos on the bar",
  "撕下「{name}」？B站上的视频不受影响。":
    "Tear off “{name}”? The videos on Bilibili stay as they are.",
  "收藏夹":
    "Favourites",
  "收藏夹要设为公开才读得到。一个页面最多读前 {n} 个视频。":
    "Favourites folders must be public to be read. A page reads at most the first {n} videos.",
  "整个合集放上吧台":
    "Put the whole collection on the bar",
  "正在打开 B站播放器……":
    "Opening the Bilibili player…",
  "正在读取 B站……":
    "Reading Bilibili…",
  "没有声音？点小锁解锁，再点画面里的播放键。":
    "No sound? Click the little lock to unlock, then the play button in the picture.",
  "点画面：播放 / 暂停":
    "Click the picture: play / pause",
  "点这里粘贴 B站视频、合集或收藏夹链接。":
    "Click here to paste a Bilibili video, collection or favourites link.",
  "现在可以直接用 B站播放器（音量、播放键）。这里按的暂停和拖动不会同步给同席，用完点锁。":
    "You can use the Bilibili player directly now (volume, play). Pausing or seeking here isn't shared with Listen Together; click the lock when done.",
  "粘贴 B站视频、合集或收藏夹链接":
    "Paste a Bilibili video, collection or favourites link",
  "系列":
    "Series",
  "视频":
    "Video",
  "视频、合集、收藏夹，朋友也能一起看":
    "Videos, collections, favourites — friends can watch too",
  "视频由 B站提供，直接在你的浏览器里播放，酒馆不下载、不转播。":
    "Videos come from Bilibili and play straight in your browser; the tavern doesn't download or relay them.",
  "解锁 B站播放器":
    "Unlock the Bilibili player",
  "解锁，直接用 B站播放器":
    "Unlock: use the Bilibili player directly",
  "认不出这个链接：粘贴视频、合集、系列或公开收藏夹的链接（也可以是 b23.tv 分享链接）。付费视频和番剧放不了。":
    "That link isn't recognised: paste a video, collection, series or public favourites link (b23.tv share links work too). Paid videos and anime can't be played.",
  "请用酒馆的播放 / 暂停 / 拖动来控制，大家才会同步；B站播放器里按的不会同步给同席。":
    "Use the tavern's play / pause / seek so everyone stays in step; buttons pressed inside the Bilibili player aren't shared.",
  "读取 B站时出错了，过一会儿再试。":
    "Something went wrong reading Bilibili. Try again in a moment.",
  "读取 B站需要用「{launcher}」打开酒馆（开发模式读不了）。":
    "Reading Bilibili needs the tavern started with “{launcher}” (dev mode can't).",
  "这个列表里没有能放的视频。":
    "There's nothing playable in this list.",
  "这个收藏夹是私密的：在 B站把它设为公开，再粘贴一次。":
    "This favourites folder is private: make it public on Bilibili and paste it again.",
  "连不上 B站：检查这台电脑的网络。":
    "Can't reach Bilibili: check this computer's network.",
  "酒单里的 B站页":
    "Bilibili pages on the menu",
  "锁回去":
    "Lock",
  "锁回去，用酒馆的按钮":
    "Lock: back to the tavern's buttons",
  "音量请用电脑的音量键调：B站播放器不让网页调它的音量。":
    "Use your computer's volume keys: the Bilibili player doesn't let pages set its volume.",
};
