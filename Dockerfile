# ===========================================
# Stage 1: Builder
# ===========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# ===========================================
# Stage 2: Runtime (Nginx)
# ===========================================
FROM nginx:alpine AS runner

# Install curl for health checks and gettext for envsubst
RUN apk add --no-cache curl gettext

# Copy custom nginx config template (will be processed at runtime)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Change ownership of nginx directories
RUN chown -R appuser:appgroup /usr/share/nginx/html && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/log/nginx && \
    chown -R appuser:appgroup /etc/nginx/conf.d && \
    chown -R appuser:appgroup /etc/nginx/templates

# Create entrypoint script for dynamic port substitution
RUN echo '#!/bin/sh\n\
set -e\n\
\n# Default PORT to 8080 if not set\n\
export PORT=${PORT:-8080}\n\
\n# Substitute $PORT in nginx config template using envsubst\n\
envsubst \"$PORT\" < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf\n\
\n# Execute the command\n\
exec "$@"\n\
' > /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# Switch to non-root user
USER appuser

# Expose port (documentation only, actual port comes from $PORT)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Use entrypoint for dynamic port substitution
ENTRYPOINT ["/docker-entrypoint.sh"]

# Start nginx
CMD ["nginx", "-g", "daemon off;"]