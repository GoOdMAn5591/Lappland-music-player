#!/bin/bash
# 在 Mac 桌面放一个「无序酒馆」图标，以后双击它就能开门。运行一次就行。

cd "$(dirname "$0")" || exit 1
project="$(pwd)"
desktop="$HOME/Desktop"
target="$desktop/无序酒馆.command"

if [ ! -d "$desktop" ]; then
  echo "  没找到桌面文件夹：$desktop"
  read -r -p "  按回车关闭 " _
  exit 1
fi

# 一个小启动器：记住酒馆文件夹的位置，然后交给「启动酒馆.command」
{
  echo '#!/bin/bash'
  echo '# 无序酒馆 · 桌面快捷方式（由「创建桌面快捷方式.command」生成）'
  printf 'project=%q\n' "$project"
  echo 'if [ ! -f "$project/启动酒馆.command" ]; then'
  echo '  echo "  找不到酒馆文件夹了（是不是挪了位置？）：$project"'
  echo '  echo "  去新位置再双击一次「创建桌面快捷方式.command」就好。"'
  echo '  read -r -p "  按回车关闭 " _'
  echo '  exit 1'
  echo 'fi'
  echo 'exec /bin/bash "$project/启动酒馆.command"'
} > "$target" || {
  echo ""
  echo "  写不进桌面。如果弹出「终端想访问桌面文件夹」，请点「好」再运行一次。"
  read -r -p "  按回车关闭 " _
  exit 1
}
chmod +x "$target"

# 换上酒杯图标（做不到也不要紧，图标是默认的而已）
icon="$project/scripts/tavern.png"
if [ -f "$icon" ] && command -v osascript >/dev/null 2>&1; then
  osascript -l JavaScript - "$icon" "$target" >/dev/null 2>&1 <<'JS' || true
function run(argv) {
  ObjC.import("AppKit");
  const image = $.NSImage.alloc.initWithContentsOfFile(argv[0]);
  if (!image || image.isNil()) return false;
  return $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, argv[1], 0);
}
JS
fi

echo ""
echo "  桌面上已经放好「无序酒馆」了：$target"
echo "  以后双击它就能开门。"
echo ""
read -r -p "  按回车关闭 " _
