# Build the static site, then serve it with an unprivileged nginx on port 8080.
FROM node:22-alpine AS build
WORKDIR /src
COPY scripts ./scripts
COPY site ./site
RUN node scripts/build.mjs

FROM nginxinc/nginx-unprivileged:1.27-alpine
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="GTHA Metro Map Creator" \
      org.opencontainers.image.description="Schematic metro map editor for the Greater Toronto and Hamilton Area" \
      org.opencontainers.image.source="https://github.com/Ding-Ding-Projects/gtha-metro-map-creator" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/site /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
