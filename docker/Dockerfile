FROM docker.io/debian:trixie

# Define build-time variables (provided via Docker Compose)
ARG SBC_REF=master
ARG MODE=dev
ARG DOMAIN

# Define environment variables for runtime
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV SBC_REF=${SBC_REF}
ENV MODE=${MODE}
ENV DOMAIN=${DOMAIN}

RUN apt-get update && apt-get install -y curl

RUN apt-get update
RUN apt-get install -y ca-certificates curl gnupg nodejs npm nginx-extras git procps geoip-database

RUN git clone --recurse-submodules https://github.com/humlab-sead/sead_browser_client

WORKDIR /sead_browser_client

RUN git checkout $SBC_REF

# echo out DOMAIN so we know it is set
RUN echo "DOMAIN: $DOMAIN"
# echo out MODE so we know it is set
RUN echo "MODE: $MODE"

RUN npm install --include=dev && \
    if [ "$MODE" = "prod" ]; then \
        npm run build:prod && cp -R dist/* /var/www/html/; \
    elif [ "$MODE" = "dev" ]; then \
        npm run build:dev; \
    else \
        echo "Unsupported MODE: $MODE (expected 'prod' or 'dev')" >&2; \
        exit 1; \
    fi

# Build for production, otherwise, start dev server
CMD ["sh", "-c", "if [ \"$MODE\" = \"dev\" ]; then npm run dev -- --port 8090; else nginx -g 'daemon off;'; fi"]
