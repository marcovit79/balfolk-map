# Stage 1: Build Vue.js Frontend
FROM docker.io/library/node:20-alpine AS frontend-builder
WORKDIR /workspace
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY shared/ ./shared/
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Stage 2: Nginx API Gateway & Reverse Proxy
FROM docker.io/library/nginx:alpine
COPY api_gateway/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-builder /workspace/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
