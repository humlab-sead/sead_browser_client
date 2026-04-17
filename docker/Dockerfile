FROM docker.io/debian:trixie

# Define build-time variables (provided via Docker Compose)
ARG SBC_REF=master
ARG DOMAIN

# Define environment variables for runtime
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV SBC_REF=${SBC_REF}
ENV DOMAIN=${DOMAIN}

RUN apt-get update
RUN apt-get install -y ca-certificates curl gnupg nodejs npm nginx-extras git procps geoip-database

RUN git clone --recurse-submodules https://github.com/humlab-sead/sead_browser_client

WORKDIR /sead_browser_client

RUN git checkout $SBC_REF

# echo out DOMAIN so we know it is set
RUN echo "DOMAIN: $DOMAIN"

RUN npm install --include=dev && \
    npm run build:prod && \
    cp -R dist/* /var/www/html/

# Base image always serves static assets via nginx.
# Development mode is provided via docker-compose.override.yml.
CMD ["nginx", "-g", "daemon off;"]
