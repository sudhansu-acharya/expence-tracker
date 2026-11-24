#!/bin/bash
cd "$(dirname "$0")"
PORT=8080
echo "Starting CashewFlow locally at http://localhost:$PORT ..."
(sleep 1 && open "http://localhost:$PORT") &
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx >/dev/null 2>&1; then
  npx --yes serve . -l "$PORT"
else
  echo "Please install Python 3 or Node.js to run locally."
  read -r -p "Press Enter to exit..."
fi
