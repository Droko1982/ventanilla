FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 4000
# Migraciones versionadas con auto-baseline seguro (sin --accept-data-loss).
CMD ["sh", "-c", "(npx prisma migrate resolve --applied 0_init || true) && npx prisma migrate deploy && node dist/index.js"]
