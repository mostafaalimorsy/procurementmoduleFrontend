FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# One artifact, two product hosts: Compose runs this image as workspace-web and platform-web.
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
# Phase 3 SI-002: the commit and release tag the image was built from; the base image's own source, url, description and creation
# labels are cleared or replaced so they do not describe this image.
ARG SOURCE_REVISION=unknown
ARG RELEASE_TAG=unreleased
LABEL org.opencontainers.image.revision=$SOURCE_REVISION \
      org.opencontainers.image.version=$RELEASE_TAG \
      org.opencontainers.image.title="Subtriva web" \
      org.opencontainers.image.description="Subtriva workspace and platform-console web hosts (nginx-unprivileged base)" \
      org.opencontainers.image.source="" \
      org.opencontainers.image.url="" \
      org.opencontainers.image.created=""
# The base's Alpine packages can trail the branch's security fixes until the next upstream rebuild (2026-11-04: brotli, expat, curl); take
# the current 3.24 packages at build time. The image's SBOM and digest record what was installed.
USER root
RUN apk upgrade --no-cache
USER 101
ENV PRODUCT_CONTEXT=workspace \
    WORKSPACE_PUBLIC_ORIGIN=http://localhost:4200 \
    PLATFORM_PUBLIC_ORIGIN=http://127.0.0.1:4201 \
    TRUSTED_INGRESS_CIDR=127.0.0.1/32
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/locale-map.conf nginx/common.conf nginx/workspace.conf nginx/platform.conf /etc/nginx/product/
COPY --from=build /app/dist/subcontractor-intelligence/browser /usr/share/nginx/html
EXPOSE 8080
