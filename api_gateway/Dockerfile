# Stage 1: Build Vue.js Frontend
FROM docker.io/library/node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Nginx API Gateway & Reverse Proxy
FROM docker.io/library/nginx:alpine
COPY api_gateway/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
