FROM ghcr.io/home-assistant/base:latest

LABEL \
  io.hass.name="Guest Lights" \
  io.hass.description="Unauthenticated guest web app for light control" \
  io.hass.type="app" \
  io.hass.version="1.0.0" \
  io.hass.arch="aarch64|amd64|armhf|armv7|i386"

RUN apk add --no-cache nodejs

COPY rootfs /

RUN chmod +x /usr/bin/run.sh

WORKDIR /usr/src/app

CMD ["/usr/bin/run.sh"]
