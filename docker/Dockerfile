FROM docker.io/debian:trixie

# Define build-time variables (provided via Docker Compose)
ARG SBC_REF=master
ARG MODE=dev
ARG DOMAIN

# Define environment variables for runtime
ENV SBC_REF=${SBC_REF}
ENV MODE=${MODE}
ENV DOMAIN=${DOMAIN}

RUN apt-get update && apt-get install -y curl

RUN apt-get update
RUN apt-get install -y ca-certificates curl gnupg nodejs npm nginx-extras git procps geoip-database

RUN git clone --recurse-submodules https://github.com/humlab-sead/sead_browser_client

WORKDIR /sead_browser_client

RUN git checkout $SBC_REF

# replace all instances of "localhost" with the domain name in src/config/config-prod.json
RUN sed -i "s/localhost/$DOMAIN/g" src/config/config-prod.json

# echo out DOMAIN so we know it is set
RUN echo "DOMAIN: $DOMAIN"
# echo out MODE so we know it is set
RUN echo "MODE: $MODE"

RUN npm install && npm run build:prod && cp -R dist/* /var/www/html/

# Install webpack-dev-server for deMODEvelopment
RUN npm install --save-dev webpack-dev-server

# Build for production, otherwise, start dev server
CMD ["sh", "-c", "if [ \"$MODE\" = \"dev\" ]; then npm run dev -- --port 8090; else nginx -g 'daemon off;'; fi"]

