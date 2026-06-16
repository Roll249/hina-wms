FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3

COPY .next ./.next
COPY public ./public
COPY next.config.* ./
COPY tsconfig.json ./

EXPOSE 3000
ENV PORT=4568
ENV HOSTNAME=0.0.0.0
CMD ["npm", "start"]
