FROM node:22-alpine

WORKDIR /app

COPY . .
RUN npm install
RUN npm run build
RUN npm prune --production

ENTRYPOINT [ "node", "packages/orchestrator/dist/index.js" ]
