FROM node:24-bookworm-slim AS web
WORKDIR /source
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web
RUN npm install -g @openai/codex@0.155.1

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /source
COPY global.json ./
COPY backend ./backend
RUN dotnet restore backend/Underwriting.Api --locked-mode
RUN dotnet publish backend/Underwriting.Api --no-restore -c Release -o /published

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=web /usr/local/bin/node /usr/local/bin/node
COPY --from=web /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex \
    && mkdir -p /data /home/app/.codex && chown -R app:app /data /home/app/.codex
COPY --from=backend /published ./backend
COPY --from=web /source/dist ./dist
COPY package.json ./
USER app
ENV FCT_PROJECT_ROOT=/app FCT_DOTNET_DATA_DIR=/data CODEX_HOME=/home/app/.codex
# Loopback binding is intentional. See docs/OPERATIONS.md for host-network requirements.
EXPOSE 4317
ENTRYPOINT ["dotnet", "/app/backend/Underwriting.Api.dll"]
