FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY web-app/backend/package.json web-app/backend/package-lock.json ./
RUN npm ci
COPY web-app/backend/ ./
RUN npx prisma generate && npm run build

EXPOSE 3001
CMD ["npm", "run", "start"]
