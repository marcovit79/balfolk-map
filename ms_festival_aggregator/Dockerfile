FROM docker.io/library/node:20-alpine AS builder
WORKDIR /workspace
COPY ms_festival_aggregator/package*.json ./ms_festival_aggregator/
RUN cd ms_festival_aggregator && npm install
COPY shared/ ./shared/
COPY ms_festival_aggregator/ ./ms_festival_aggregator/
RUN cd ms_festival_aggregator && npm run build

FROM docker.io/library/node:20-alpine
WORKDIR /workspace
COPY ms_festival_aggregator/package*.json ./ms_festival_aggregator/
RUN cd ms_festival_aggregator && npm install --omit=dev
COPY --from=builder /workspace/ms_festival_aggregator/dist ./ms_festival_aggregator/dist
COPY shared/ ./shared/
WORKDIR /workspace/ms_festival_aggregator
EXPOSE 3000
CMD ["sh", "-c", "node dist/ms_festival_aggregator/src/main || node dist/main"]
