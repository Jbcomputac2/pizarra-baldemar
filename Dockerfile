# --- Pizarra Prof. Baldemar — imagen estática con Nginx ---
FROM nginx:1.27-alpine

# Copiamos config y archivos
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/    /usr/share/nginx/html/

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
