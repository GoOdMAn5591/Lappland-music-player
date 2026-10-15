#!/bin/bash
# 无序酒馆 · Mac 一键启动：在「访达」里双击我。
# （第一次被拦住的话：按住 Control 点我 → 打开；详见 README 的「在 Mac 上用」。）

cd "$(dirname "$0")" || exit 1
printf '\033]0;无序酒馆 · Lappland\007'

# Node.js 可能装在「终端」默认找不到的地方（Homebrew、nvm、Volta……）
for dir in /opt/homebrew/bin /usr/local/bin "$HOME/.volta/bin" "$HOME/.local/bin"; do
  if [ -d "$dir" ]; then
    case ":$PATH:" in
      *":$dir:"*) ;;
      *) PATH="$dir:$PATH" ;;
    esac
  fi
done
export PATH
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi
if ! command -v node >/dev/null 2>&1 && command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)" >/dev/null 2>&1
fi

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  没有找到 Node.js。已经帮你打开下载页：下载 macOS 的 LTS 安装包（.pkg），装完再双击「启动酒馆」。"
  open "https://nodejs.org/zh-cn/download" >/dev/null 2>&1
  echo ""
  read -r -p "  按回车关闭 " _
  exit 1
fi

node scripts/launch.mjs
status=$?
if [ "$status" -ne 0 ]; then
  echo ""
  read -r -p "  按回车关闭 " _
fi
exit "$status"
