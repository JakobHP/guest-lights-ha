#!/usr/bin/with-contenv bashio

export HA_URL=$(bashio::config 'ha_url')
export HA_TOKEN=$(bashio::config 'ha_token')

bashio::log.info "Starting Guest Lights server on port 7080..."
bashio::log.info "Connecting to Home Assistant at: ${HA_URL}"

exec node /usr/src/app/server.js
