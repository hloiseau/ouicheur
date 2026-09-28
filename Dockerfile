FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-fund
COPY . .
RUN npm run build \
    && mkdir -p third-party-licenses \
    && npm sbom --sbom-format=cyclonedx > third-party-licenses/npm-sbom.cdx.json \
    && npm prune --omit=dev --no-fund \
    && node scripts/licenses.mjs

FROM node:24.21.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 DATA_DIR=/app/data
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/lib ./lib
COPY --from=build --chown=node:node /app/scripts/manage.ts ./scripts/manage.ts
COPY --from=build --chown=node:node /app/scripts/start.mjs /app/scripts/prepare-setup.ts /app/scripts/maintenance.ts ./scripts/
COPY --from=build --chown=node:node /app/scripts/install-browser.mjs ./scripts/
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/third-party-licenses ./third-party-licenses
COPY --from=build --chown=node:node /app/LICENSE /app/THIRD_PARTY_NOTICES.md ./
RUN node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start.mjs"]
