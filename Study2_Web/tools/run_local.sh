#!/bin/sh
# Test the task on this computer: starts a small web server for this folder
# and opens it in the browser. Stop with Ctrl+C.
#     sh tools/run_local.sh
# An iPad on the same Wi-Fi can open the address printed below as well.
cd "$(dirname "$0")/.." || exit 1
PORT=8000
IP=$(ipconfig getifaddr en0 2>/dev/null)
echo "Study 2 runs at http://localhost:$PORT"
[ -n "$IP" ] && echo "On an iPad on the same Wi-Fi: http://$IP:$PORT"
echo "Stop with Ctrl+C."
(sleep 1; open "http://localhost:$PORT") &
python3 -m http.server "$PORT" --bind 0.0.0.0
