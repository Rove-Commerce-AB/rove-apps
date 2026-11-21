FROM node:20-bookworm-slim
WORKDIR /app

# webanalyze binary (Wappalyzer-style tech detection for Radar)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL -o /tmp/webanalyze.tgz \
    https://github.com/rverton/webanalyze/releases/download/v0.4.6/webanalyze_Linux_x86_64.tar.gz \
  && tar -xzf /tmp/webanalyze.tgz -C /usr/local/bin webanalyze \
  && chmod +x /usr/local/bin/webanalyze \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* /tmp/webanalyze.tgz

ENV RADAR_WEBANALYZE_BIN=/usr/local/bin/webanalyze
ENV RADAR_WEBANALYZE_APPS=/app/tools/webanalyze/technologies.json

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Refresh tech definitions after COPY so they are not wiped by the repo tree
RUN mkdir -p /app/tools/webanalyze \
  && cd /app/tools/webanalyze \
  && webanalyze -update

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "8080"]
