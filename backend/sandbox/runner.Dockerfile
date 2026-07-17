FROM node:22-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --workspace backend --omit=dev
COPY backend/src backend/src
COPY backend/sandbox backend/sandbox
ENV NODE_ENV=production
CMD ["node", "backend/sandbox/runner.js"]
