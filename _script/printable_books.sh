#!/usr/bin/env bash
cat <<EOF > hugo/content/portable-docker/single.md
---
layout: "book"
url: "/portable-docker/single.html"
section: "portable-docker"
# single-page render experiment: keep building it at the url above, but hide it
# from the sidebar tree and the prev/next reading order (it's not a real chapter)
_build:
  list: never
  render: always
---
EOF
