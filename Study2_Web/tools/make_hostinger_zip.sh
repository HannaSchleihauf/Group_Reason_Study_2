#!/bin/sh
# Pack the website (without tools, Code.gs and the claude.ai page) as
# ../Study2_Web_hostinger.zip, to upload and extract in a folder on a web
# host such as Hostinger (index.html at the top of the zip).
#     sh tools/make_hostinger_zip.sh
cd "$(dirname "$0")/.." || exit 1
TMP=$(mktemp -d)
rsync -a --exclude tools --exclude google_sheets --exclude claude_page.html \
      --exclude _headers --exclude .DS_Store ./ "$TMP/"
# ask search engines not to list the study (Apache / LiteSpeed)
cat > "$TMP/.htaccess" <<'HT'
<IfModule mod_headers.c>
  Header set X-Robots-Tag "noindex, nofollow"
</IfModule>
HT
OUT="$(cd .. && pwd)/Study2_Web_hostinger.zip"
rm -f "$OUT"
(cd "$TMP" && zip -qr -X "$OUT" . -x '.DS_Store')
rm -rf "$TMP"
echo "Website packed as $OUT"
