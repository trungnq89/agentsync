#!/bin/sh
set -e
# Apply migrations, then start the web server.
(cd /tools && node_modules/.bin/tsx src/db/migrate.ts)
exec node /app/server.js
