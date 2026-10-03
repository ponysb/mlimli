#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
bin=${MLI_BIN_DIR:-"$HOME/.local/bin"}
mkdir -p "$bin"
chmod +x "$root/bin/mli" "$root/runtime/node"
if [ -f "$root/client/cli/bin/mli-tui" ]; then chmod +x "$root/client/cli/bin/mli-tui"; fi
if [ -e "$bin/mli" ] || [ -L "$bin/mli" ]; then
  existing=$(readlink "$bin/mli" 2>/dev/null || true)
  if [ "$existing" != "$root/bin/mli" ]; then
    printf '%s\n' "Refusing to replace existing command: $bin/mli" >&2
    exit 1
  fi
else
  ln -s "$root/bin/mli" "$bin/mli"
fi
printf '%s\n' "Installed: $bin/mli"
case ":$PATH:" in *":$bin:"*) ;; *) printf '%s\n' "Add $bin to PATH in your shell profile." ;; esac
