FROM node:22-bookworm-slim
WORKDIR /app

# Cài openssl cho Prisma
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl ca-certificates 2>&1 | tail -3 && rm -rf /var/lib/apt/lists/*

# Copy package + cài production deps
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3

# Copy source đã build
COPY dist ./dist
COPY prisma ./prisma

EXPOSE 7777
ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma generate && node dist/main.js"]
