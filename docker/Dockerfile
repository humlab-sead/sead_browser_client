# Built from the checkout it sits in: the build context is the repository root, so
# this builds whatever is checked out - sead-deployment checks out the release's tag.
#   podman build -f docker/Dockerfile --build-arg DOMAIN=sead.local .

# ── build: node, the dependencies and the webpack build ──────────────────────
# Also the image the dev container runs, with the checkout mounted over the copy
# of the source made here (see compose.override.yml in sead-deployment).
FROM docker.io/debian:trixie AS build

RUN apt-get update && apt-get install -y nodejs npm

ENV NODE_OPTIONS=--max-old-space-size=4096

WORKDIR /sead_browser_client

# The dependencies first, so they are only installed again when the lockfile changes
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

# Read by prepare-config.js, which writes them into the client's config
ARG DOMAIN
ARG SCHEME=https
ARG MODE=prod
#The SEAD release the client is deployed in and the versions of its components, which
#the About dialog shows
ARG SEAD_RELEASE=
ARG JAS_RELEASE=
ARG SEAD_QUERY_API_RELEASE=
ARG SEAD_CHANGE_CONTROL_RELEASE=
ENV DOMAIN=${DOMAIN}
ENV SCHEME=${SCHEME}
ENV SEAD_RELEASE=${SEAD_RELEASE}
ENV JAS_RELEASE=${JAS_RELEASE}
ENV SEAD_QUERY_API_RELEASE=${SEAD_QUERY_API_RELEASE}
ENV SEAD_CHANGE_CONTROL_RELEASE=${SEAD_CHANGE_CONTROL_RELEASE}

RUN echo "DOMAIN: $DOMAIN, SCHEME: $SCHEME, MODE: $MODE, SEAD_RELEASE: $SEAD_RELEASE" \
    && npm run build:${MODE}

# ── runtime: nginx serving the built client ──────────────────────────────────
FROM docker.io/debian:trixie

RUN apt-get update && apt-get install -y ca-certificates curl nginx-extras procps geoip-database

COPY --from=build /sead_browser_client/dist/ /var/www/html/

# What was built, as 'git describe' put it; reported by 'deploy.sh versions'
ARG SOURCE_VERSION=
ENV SOURCE_VERSION=${SOURCE_VERSION}

CMD ["nginx", "-g", "daemon off;"]
