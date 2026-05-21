#!/usr/bin/env node
// ─── Mock Home Assistant server ───────────────────────────────────────────────
// Speaks just enough of the HA HTTP + WebSocket API for the guest lights app.
//
// Usage:  node mock-ha.js [--port 8123]
//
// Endpoints implemented:
//   GET  /api/states                      → array of light states
//   POST /api/services/light/turn_on      → mutates state, broadcasts state_changed
//   POST /api/services/light/turn_off     → mutates state, broadcasts state_changed
//   GET  /api/websocket (upgrade)         → auth handshake + state_changed events

const http = require('http');
const net  = require('net');
const crypto = require('crypto');

const portArgIdx = process.argv.indexOf('--port');
const PORT = portArgIdx !== -1 ? parseInt(process.argv[portArgIdx + 1]) : 8123;

// ─── Entity definitions ───────────────────────────────────────────────────────
// color_modes: 'hs' = RGB colour wheel, 'color_temp' = warmth only, 'rgbww' = both
const ENTITY_DEFS = [
  // Dining table — CT only
  ...Array.from({ length: 14 }, (_, i) => ({
    id: `light.spisebord_${i + 1}`,
    color_mode: 'color_temp',
    min_mireds: 153, max_mireds: 500,
  })),
  // TV Lounge — RGB
  { id: 'light.tv_stue_sofabord',  color_mode: 'hs' },
  { id: 'light.tv_stue_hyggelys',  color_mode: 'hs' },
  { id: 'light.tv_stue_le_klint',  color_mode: 'color_temp', min_mireds: 153, max_mireds: 454 },
  // Guest Bedroom — CT
  { id: 'light.gaestevaerelse_syd',  color_mode: 'color_temp', min_mireds: 153, max_mireds: 500 },
  { id: 'light.standerlampe',        color_mode: 'color_temp', min_mireds: 153, max_mireds: 500 },
  { id: 'light.gaestevaerelse_nord', color_mode: 'color_temp', min_mireds: 153, max_mireds: 500 },
  // Stairwell — CT
  { id: 'light.trappeopgang_trappe', color_mode: 'color_temp', min_mireds: 153, max_mireds: 370 },
  { id: 'light.trappeopgang_repos',  color_mode: 'color_temp', min_mireds: 153, max_mireds: 370 },
  // Kids Bedroom — rgbww (colour + warmth)
  { id: 'light.c_e_camille', color_mode: 'rgbww', min_mireds: 153, max_mireds: 500 },
  { id: 'light.c_e_ebbe',    color_mode: 'rgbww', min_mireds: 153, max_mireds: 500 },
  // Crafts Table — hs
  { id: 'light.kreabord_hvid', color_mode: 'hs' },
  { id: 'light.kreabord_gul',  color_mode: 'hs' },
  { id: 'light.kreabord_gron', color_mode: 'hs' },
  // Lounge — rgbww
  { id: 'light.sofagruppe_beige',  color_mode: 'rgbww', min_mireds: 153, max_mireds: 500 },
  { id: 'light.sofagruppe_beige2', color_mode: 'rgbww', min_mireds: 153, max_mireds: 500 },
  { id: 'light.sofagruppe_rosa',   color_mode: 'rgbww', min_mireds: 153, max_mireds: 500 },
  { id: 'light.sofagruppe_gul',    color_mode: 'rgbww', min_mireds: 153, max_mireds: 500 },
  // Master Bedroom — CT
  { id: 'light.sovevaerelse_syd',  color_mode: 'color_temp', min_mireds: 153, max_mireds: 454 },
  { id: 'light.sovevaerelse_nord', color_mode: 'color_temp', min_mireds: 153, max_mireds: 454 },
  { id: 'light.lightstrip_elias',  color_mode: 'hs' },
  // Basement Bedroom — CT
  { id: 'light.standerlampe_kaelder', color_mode: 'color_temp', min_mireds: 153, max_mireds: 500 },
  { id: 'light.kaelder_o',            color_mode: 'color_temp', min_mireds: 153, max_mireds: 500 },
  { id: 'light.kaelder_v',            color_mode: 'color_temp', min_mireds: 153, max_mireds: 500 },
  // Barn
  { id: 'light.garage_lights',       color_mode: 'color_temp', min_mireds: 153, max_mireds: 370 },
  { id: 'light.workshop_lights',     color_mode: 'color_temp', min_mireds: 153, max_mireds: 370 },
  { id: 'light.upper_arena_lights',  color_mode: 'color_temp', min_mireds: 153, max_mireds: 370 },
  { id: 'light.lower_arena_lights',  color_mode: 'color_temp', min_mireds: 153, max_mireds: 370 },
];

// ─── In-memory state ──────────────────────────────────────────────────────────
function makeState(def) {
  const on = Math.random() > 0.5;
  const modes = def.color_mode === 'rgbww'
    ? ['rgbww', 'color_temp']
    : [def.color_mode];

  const attributes = {
    friendly_name: def.id.replace('light.', '').replace(/_/g, ' '),
    supported_color_modes: modes,
    supported_features: 44,
    brightness: on ? Math.round(Math.random() * 200 + 55) : null,
  };

  if (def.color_mode === 'color_temp' || def.color_mode === 'rgbww') {
    attributes.min_mireds = def.min_mireds;
    attributes.max_mireds = def.max_mireds;
    if (on) attributes.color_temp = Math.round(
      def.min_mireds + Math.random() * (def.max_mireds - def.min_mireds)
    );
  }

  if (def.color_mode === 'hs' || def.color_mode === 'rgbww') {
    if (on) {
      const h = Math.round(Math.random() * 360);
      const s = Math.round(Math.random() * 100);
      attributes.hs_color = [h, s];
      attributes.rgb_color = hsvToRgb(h, s / 100, 1);
    }
  }

  return {
    entity_id: def.id,
    state: on ? 'on' : 'off',
    attributes,
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };
}

const entities = {};
ENTITY_DEFS.forEach(def => { entities[def.id] = makeState(def); });

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

// ─── WebSocket clients ────────────────────────────────────────────────────────
const wsClients = new Set();

function broadcast(payload) {
  const frame = encodeWSFrame(JSON.stringify(payload));
  wsClients.forEach(sock => {
    if (!sock.destroyed) sock.write(frame);
  });
}

function emitStateChanged(entityId, oldState, newState) {
  broadcast({
    type: 'event',
    event: {
      event_type: 'state_changed',
      data: { entity_id: entityId, old_state: oldState, new_state: newState },
    },
  });
}

// ─── Service handling ─────────────────────────────────────────────────────────
function applyService(service, body) {
  const ids = Array.isArray(body.entity_id) ? body.entity_id : [body.entity_id];
  ids.forEach(id => {
    const def = ENTITY_DEFS.find(d => d.id === id);
    if (!def) return;
    const old = JSON.parse(JSON.stringify(entities[id]));

    if (service === 'turn_off') {
      entities[id].state = 'off';
      entities[id].attributes.brightness = null;
    } else {
      entities[id].state = 'on';
      if (body.brightness_pct !== undefined)
        entities[id].attributes.brightness = Math.round(body.brightness_pct / 100 * 255);
      if (body.color_temp !== undefined)
        entities[id].attributes.color_temp = body.color_temp;
      if (body.hs_color !== undefined) {
        entities[id].attributes.hs_color = body.hs_color;
        entities[id].attributes.rgb_color = hsvToRgb(
          body.hs_color[0], body.hs_color[1] / 100, 1
        );
      }
      if (entities[id].attributes.brightness === null)
        entities[id].attributes.brightness = 255;
    }

    entities[id].last_updated = new Date().toISOString();
    emitStateChanged(id, old, JSON.parse(JSON.stringify(entities[id])));
  });
}

// ─── WebSocket codec ──────────────────────────────────────────────────────────
function encodeWSFrame(payload) {
  const data = Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, data]);
}

function decodeWSFrame(buffer) {
  if (buffer.length < 2) return null;
  const masked = (buffer[1] & 0x80) !== 0;
  let payloadLen = buffer[1] & 0x7f;
  let offset = 2;
  if (payloadLen === 126) { payloadLen = buffer.readUInt16BE(2); offset = 4; }
  else if (payloadLen === 127) { payloadLen = Number(buffer.readBigUInt64BE(2)); offset = 10; }
  const maskBytes = masked ? buffer.slice(offset, offset + 4) : null;
  if (masked) offset += 4;
  if (offset + payloadLen > buffer.length) return null;
  const payload = Buffer.from(buffer.slice(offset, offset + payloadLen));
  if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= maskBytes[i % 4];
  return { payload: payload.toString('utf8'), consumed: offset + payloadLen };
}

// ─── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;

  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readBody = (cb) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => cb(Buffer.concat(chunks).toString()));
  };

  // States
  if (req.method === 'GET' && pathname === '/api/states') {
    return json(200, Object.values(entities));
  }

  // Light services
  if (req.method === 'POST' && pathname.startsWith('/api/services/light/')) {
    const service = pathname.split('/').pop();
    return readBody(body => {
      try { applyService(service, JSON.parse(body)); } catch {}
      json(200, []);
    });
  }

  // Scene — just acknowledge, optionally could mutate brightness/color
  if (req.method === 'POST' && pathname === '/api/services/scene/turn_on') {
    return readBody(() => json(200, []));
  }

  json(404, { error: 'Not found' });
});

// ─── WebSocket upgrade ────────────────────────────────────────────────────────
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  // HA auth flow
  socket.write(encodeWSFrame(JSON.stringify({ type: 'auth_required', ha_version: '2024.1.0' })));

  let authed = false;
  let buf = Buffer.alloc(0);

  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length > 0) {
      const frame = decodeWSFrame(buf);
      if (!frame) break;
      buf = buf.slice(frame.consumed);

      try {
        const msg = JSON.parse(frame.payload);
        if (!authed) {
          if (msg.type === 'auth') {
            authed = true;
            socket.write(encodeWSFrame(JSON.stringify({ type: 'auth_ok', ha_version: '2024.1.0' })));
            wsClients.add(socket);
            console.log(`[mock-ha] WS client connected (${wsClients.size} total)`);
          }
        }
        // Silently ignore subscribe_events and other commands
      } catch {}
    }
  });

  socket.on('close', () => {
    wsClients.delete(socket);
    console.log(`[mock-ha] WS client disconnected (${wsClients.size} remaining)`);
  });
  socket.on('error', () => wsClients.delete(socket));
});

server.listen(PORT, () => {
  console.log(`[mock-ha] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[mock-ha] ${Object.keys(entities).length} entities, ${Object.values(entities).filter(e => e.state === 'on').length} initially on`);
});
