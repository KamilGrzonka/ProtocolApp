FROM node:20-slim

RUN apt-get update \
  && apt-get install --yes --no-install-recommends libreoffice-writer fonts-dejavu-core fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node server.cjs ./

USER node
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.cjs"]
