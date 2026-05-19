const http = require('http');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const net = require('net');

const HA_URL = process.env.HA_URL || 'http://homeassistant.local:8123';
const HA_TOKEN = process.env.HA_TOKEN || '';
const PORT = 7080;
const PUBLIC_ROOT = '/usr/src/app/public';
const MAX_BODY_SIZE = 1_000_000; // 1 MB

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

// Only allow light-related HA API paths
const ALLOWED_API_PATHS = [
  /^\/api\/states$/,
  /^\/api\/states\/light\./,
  /^\/api\/services\/light\//,
];

function isAllowedPath(pathname) {
  return ALLOWED_API_PATHS.some(r => r.test(pathname));
}

// ─── HTTP API Proxy ───────────────────────────────────────────────────────────
function proxyHARequest(method, haPath, body, res) {
  const targetUrl = new URL(haPath, HA_URL);
  const isHttps = targetUrl.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: parseInt(targetUrl.port) || (isHttps ? 443 : 80),
    path: targetUrl.pathname + (targetUrl.search || ''),
    method: method,
    headers: {
      'Authorization': `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', chunk => data += chunk);
    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    });
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to reach Home Assistant', detail: err.message }));
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

// ─── WebSocket Frame Codec ────────────────────────────────────────────────────
// Returns { frames: [...], remainder: Buffer } so the caller can track unconsumed bytes.
function decodeWSFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 2 > buffer.length) break;
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    const fin    = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let payloadLen = b1 & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }

    const dataOffset = offset + headerLen + (masked ? 4 : 0);
    if (dataOffset + payloadLen > buffer.length) break;

    const maskBytes = masked ? buffer.slice(offset + headerLen, offset + headerLen + 4) : null;
    const payload = Buffer.from(buffer.slice(dataOffset, dataOffset + payloadLen));
    if (masked && maskBytes) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= maskBytes[i % 4];
    }

    frames.push({ fin, opcode, payload });
    offset = dataOffset + payloadLen;
  }

  return { frames, remainder: buffer.slice(offset) };
}

function encodeWSFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = data.length;
  let header;

  const firstByte = 0x80 | opcode; // FIN + opcode

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = firstByte;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = firstByte;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = firstByte;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, data]);
}

// ─── WebSocket Proxy with Token Injection ────────────────────────────────────
function handleWebSocketUpgrade(req, clientSocket, head) {
  const targetUrl = new URL('/api/websocket', HA_URL);
  const isHttps = targetUrl.protocol === 'https:';
  const targetPort = parseInt(targetUrl.port) || (isHttps ? 443 : 80);

  const haSocket = isHttps
    ? tls.connect({ host: targetUrl.hostname, port: targetPort, servername: targetUrl.hostname })
    : net.createConnection(targetPort, targetUrl.hostname);

  haSocket.on('connect', () => {
    const upgradeReq = [
      `GET /api/websocket HTTP/1.1`,
      `Host: ${targetUrl.hostname}:${targetPort}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
      `Sec-WebSocket-Version: ${req.headers['sec-websocket-version'] || '13'}`,
      ``,
      ``,
    ].join('\r\n');
    haSocket.write(upgradeReq);
  });

  // tls.connect fires 'secureConnect', not 'connect'
  haSocket.on('secureConnect', () => {
    const upgradeReq = [
      `GET /api/websocket HTTP/1.1`,
      `Host: ${targetUrl.hostname}:${targetPort}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
      `Sec-WebSocket-Version: ${req.headers['sec-websocket-version'] || '13'}`,
      ``,
      ``,
    ].join('\r\n');
    haSocket.write(upgradeReq);
  });

  let haHandshakeDone = false;
  let haBuffer = Buffer.alloc(0);
  let clientBuffer = Buffer.alloc(0);
  let tokenInjected = false;

  // HA -> Client
  haSocket.on('data', (chunk) => {
    if (!haHandshakeDone) {
      haBuffer = Buffer.concat([haBuffer, chunk]);
      const headerEnd = haBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const headerStr = haBuffer.slice(0, headerEnd).toString();
      const acceptMatch = headerStr.match(/Sec-WebSocket-Accept: (.+)/i);
      const accept = acceptMatch ? acceptMatch[1].trim() : '';

      clientSocket.write(
        `HTTP/1.1 101 Switching Protocols\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );

      haHandshakeDone = true;
      const rest = haBuffer.slice(headerEnd + 4);
      if (rest.length > 0) clientSocket.write(rest);
      return;
    }
    clientSocket.write(chunk);
  });

  // Client -> HA (intercept auth frame, inject real token)
  clientSocket.on('data', (chunk) => {
    if (!haHandshakeDone) return;

    if (!tokenInjected) {
      clientBuffer = Buffer.concat([clientBuffer, chunk]);
      const { frames, remainder } = decodeWSFrames(clientBuffer);
      clientBuffer = remainder; // only keep unconsumed bytes

      for (const frame of frames) {
        if (frame.opcode === 0x1) {
          try {
            const msg = JSON.parse(frame.payload.toString('utf8'));
            if (msg.type === 'auth') {
              msg.access_token = HA_TOKEN;
              haSocket.write(encodeWSFrame(JSON.stringify(msg), 0x1));
              tokenInjected = true;
              // Forward any remaining buffered frames
              if (clientBuffer.length > 0) haSocket.write(clientBuffer);
              clientBuffer = Buffer.alloc(0);
              return;
            }
          } catch (e) {}
        }
        // Forward non-auth frames using original opcode
        haSocket.write(encodeWSFrame(frame.payload, frame.opcode));
      }
      return;
    }

    haSocket.write(chunk);
  });

  clientSocket.on('error', () => haSocket.destroy());
  haSocket.on('error', (err) => {
    console.error('HA WS socket error:', err.message);
    clientSocket.destroy();
  });
  clientSocket.on('close', () => haSocket.destroy());
  haSocket.on('close', () => clientSocket.destroy());
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // API proxy — whitelisted paths only
  if (pathname.startsWith('/api/')) {
    if (!isAllowedPath(pathname)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }

    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request too large' }));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      proxyHARequest(req.method, pathname + (parsedUrl.search || ''), body || null, res);
    });
    return;
  }

  // Static file serving — prevent path traversal
  const safePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_ROOT, safePath);

  if (!filePath.startsWith(PUBLIC_ROOT + path.sep) && filePath !== PUBLIC_ROOT) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback to index.html
      fs.readFile(path.join(PUBLIC_ROOT, 'index.html'), (err2, indexData) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexData);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('upgrade', handleWebSocketUpgrade);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Guest Lights running on http://0.0.0.0:${PORT}`);
  console.log(`Proxying HA API to: ${HA_URL}`);
});
