FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Bağımlılıklar önce kurulur; kaynak değişince katman önbelleği korunur.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# anasayfa.html importmap'i /node_modules/three/... yolundan okuduğu için
# node_modules imajda kalmalı, prune edilmemeli.
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
