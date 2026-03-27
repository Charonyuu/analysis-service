FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE ${PORT:-3099}

CMD ["node", "server/index.js"]
