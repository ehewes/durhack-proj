# One image, two processes: the API (default) and the worker
# (`bun apps/server/src/main.worker.ts`). The API also serves the Expo web build.
FROM oven/bun:1.4 AS install
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM install AS web
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/mobile apps/mobile
# Empty API URL: the web build calls the API on its own origin
ENV EXPO_PUBLIC_API_URL=""
RUN cd apps/mobile && CI=1 bun x expo export --platform web --output-dir dist

FROM oven/bun:1.4 AS server-deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production --filter @kip/server

FROM oven/bun:1.4-slim
WORKDIR /app
ENV NODE_ENV=production WEB_DIST=/app/web PORT=3000
COPY --from=server-deps /app/node_modules node_modules
COPY package.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY --from=web /app/apps/mobile/dist web
USER bun
EXPOSE 3000
CMD ["bun", "apps/server/src/main.api.ts"]
