FROM debian:bullseye

# Define build-time variables (provided via Docker Compose)
ARG SBC_REF=main
ARG MODE=dev

# Define environment variables for runtime
ENV SBC_REF=$SBC_REF
ENV MODE=$MODE

RUN apt-get update && apt-get install -y curl

RUN apt-get update
RUN apt-get install -y ca-certificates curl gnupg
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

ENV NODE_MAJOR=22
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list

RUN apt-get update

RUN apt-get update && apt-get install -y nodejs nginx-extras git procps geoip-database

RUN git clone --recurse-submodules https://github.com/humlab-sead/sead_browser_client

WORKDIR /sead_browser_client

RUN git checkout $SBC_REF

RUN npm install && npm run build:dev && cp -R dist/* /var/www/html/

# Install webpack-dev-server for deMODEvelopment
RUN npm install --save-dev webpack-dev-server

# Build for production, otherwise, start dev server
CMD ["sh", "-c", "if [ \"$MODE\" = \"dev\" ]; then npm run dev -- --port 80; else nginx -g 'daemon off;'; fi"]

