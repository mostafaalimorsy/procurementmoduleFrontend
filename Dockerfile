FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# One artifact, two product hosts: Compose runs this image as workspace-web and platform-web.
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:442753882674b49ae2c1de83ed67896131c0777f56df5005e356e62bc3f7e7ce
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
ENV PRODUCT_CONTEXT=workspace \
    WORKSPACE_PUBLIC_ORIGIN=http://localhost:4200 \
    PLATFORM_PUBLIC_ORIGIN=http://127.0.0.1:4201 \
    TRUSTED_INGRESS_CIDR=127.0.0.1/32
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/locale-map.conf nginx/common.conf nginx/workspace.conf nginx/platform.conf /etc/nginx/product/
COPY --from=build /app/dist/subcontractor-intelligence/browser /usr/share/nginx/html
EXPOSE 8080
