#!/bin/sh
# Copy the website (without tools, Code.gs and the claude.ai page) to
# docs/ at the top of the Study 2 repository: the folder GitHub Pages
# serves (Settings > Pages > main, /docs).
#     sh tools/make_site_folder.sh
cd "$(dirname "$0")/.." || exit 1
OUT=../docs
mkdir -p "$OUT"
rsync -a --delete --exclude tools --exclude google_sheets --exclude claude_page.html \
      --exclude _headers --exclude .DS_Store --exclude .git --exclude .gitignore \
      --exclude .nojekyll ./ "$OUT/"
# ask search engines not to list the site
printf '/*\n  X-Robots-Tag: noindex, nofollow\n' > "$OUT/_headers"
# GitHub Pages: serve the files as they are (no Jekyll)
touch "$OUT/.nojekyll"
echo "Website copied to $OUT"
