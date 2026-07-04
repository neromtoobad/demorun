# DEMORUN container image.
# Multi-stage: compile TypeScript + build the native better-sqlite3 binary in
# the builder, then ship a lean runtime with only prod deps + ffmpeg.

# --- build stage ---
FROM node:20-slim AS builder
WORKDIR /app

# Install all deps (incl. dev) — this also compiles/fetches the better-sqlite3
# native binary for linux, which we carry into the runtime stage.
COPY package.json package-lock.json ./
RUN npm ci

# Compile TS -> dist
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies but keep the already-built better-sqlite3 binary.
RUN npm prune --omit=dev

# --- runtime stage ---
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg is the assembly engine in Phase 2 (concat + burned subtitles).
# Baked in now so the image is ready and the checklist item is satisfied.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Railway injects PORT; the app reads it (defaults to 3000 locally).
# DATABASE_PATH should point at the mounted volume, e.g. /data/demorun.db.
EXPOSE 3000
CMD ["node", "dist/index.js"]
