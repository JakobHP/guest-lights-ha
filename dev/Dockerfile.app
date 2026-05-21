FROM node:20-alpine

WORKDIR /app

# Copy the server and public files
COPY guest-lights-app/rootfs/usr/src/app/ .

ENV PUBLIC_ROOT=/app/public

EXPOSE 7080

CMD ["node", "server.js"]
