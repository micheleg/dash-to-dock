#!/usr/bin/env bash
#
# Copyright (C) 2026 Marco Trevisan (Treviño) <mail@3v1n0.net>
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later
# version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
# details.
#
# You should have received a copy of the GNU General Public License along with
# this program. If not, see <https://www.gnu.org/licenses/>.

# Regenerate the shexli baseline from a shexli JSON report, using the helper
# shipped with the shexli-ci action so the logic stays in sync with what CI
# uses. The helper is downloaded and run, forwarding all the arguments.
#
# Usage:
#   shexli --format json <package.zip> > report.json
#   ./update_baseline.sh [report.json] [shexli-baseline.json]
#
# Environment:
#   SHEXLI_CI_REF       git ref of shexli-ci to fetch (default: main)
#   SHEXLI_CI_RAW_BASE  raw base URL (default: the 3v1n0/shexli-ci repo)

set -euo pipefail

REF="${SHEXLI_CI_REF:-main}"
BASE="${SHEXLI_CI_RAW_BASE:-https://raw.githubusercontent.com/3v1n0/shexli-ci}"
URL="$BASE/$REF/update_baseline.py"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

echo "Fetching $URL"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$tmp"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$tmp" "$URL"
else
  echo "Neither curl nor wget is available to download $URL" >&2
  exit 2
fi

python3 "$tmp" "$@"
