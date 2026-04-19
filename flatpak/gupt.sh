#!/bin/sh
exec zypak-wrapper /app/lib/gupt/node_modules/electron/dist/electron \
  /app/lib/gupt "$@"
