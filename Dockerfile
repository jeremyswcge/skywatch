FROM node:18-alpine
LABEL maintainer="SKYWATCH"
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/status || exit 1
CMD ["node", "server.js"]
