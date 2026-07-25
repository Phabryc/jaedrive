FROM node:20-alpine AS build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# Vite bakes VITE_* vars into the static bundle at build time (not readable at container
# runtime) - see cloud/DESIGN.md, must be supplied as Docker build args, not env vars.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
RUN npm run build

FROM node:20-alpine AS server-deps
# Alpine ships no OpenSSL by default - Prisma's schema/query engine binaries need libssl to
# even start, otherwise they crash before printing valid JSON (the exact
# "Could not parse schema engine response" error this fixes).
RUN apk add --no-cache openssl
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY --from=server-deps /app/server/dist ./server/dist
COPY --from=server-deps /app/server/prisma ./server/prisma
COPY --from=server-deps /app/server/package.json ./server/package.json
COPY --from=build /app/web/dist ./web/dist

WORKDIR /app/server
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
