const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8000', 10);
const GATEWAY_HOST = process.env.GATEWAY_HOST || 'localhost';
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '8080', 10);

const WWW_DIR = path.resolve(__dirname, '..', 'www');
const EMULATOR_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function serveFile(res, filePath, defaultType = 'text/plain') {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || defaultType;
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  fs.createReadStream(filePath).pipe(res);
}

function proxyRequest(req, res) {
  const options = {
    hostname: GATEWAY_HOST,
    port: GATEWAY_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${GATEWAY_HOST}:${GATEWAY_PORT}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] Unable to connect to Gateway at ${GATEWAY_HOST}:${GATEWAY_PORT}:`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Bad Gateway',
      message: `Could not connect to API Gateway at ${GATEWAY_HOST}:${GATEWAY_PORT}. Ensure the docker stack is running.`,
      details: err.message
    }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // 1. API proxy
  if (urlPath.startsWith('/api/')) {
    return proxyRequest(req, res);
  }

  // 2. Cordova Mock
  if (urlPath === '/cordova.js' || urlPath === '/app/cordova.js') {
    return serveFile(res, path.join(EMULATOR_DIR, 'cordova-mock.js'), 'application/javascript');
  }

  // 3. Simulator UI
  if (urlPath === '/' || urlPath === '/index.html') {
    return serveFile(res, path.join(EMULATOR_DIR, 'index.html'), 'text/html');
  }

  // 4. App Assets (/app/*)
  if (urlPath.startsWith('/app/')) {
    let relative = urlPath.replace(/^\/app\//, '');
    if (relative === '' || relative.endsWith('/')) {
      relative += 'index.html';
    }
    const safePath = path.normalize(relative).replace(/^(\.\.[\/\\])+/, '');
    const targetPath = path.join(WWW_DIR, safePath);
    return serveFile(res, targetPath);
  }

  // 5. Direct asset fallback from www/
  const fallbackPath = path.join(WWW_DIR, path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, ''));
  if (fs.existsSync(fallbackPath) && !fs.statSync(fallbackPath).isDirectory()) {
    return serveFile(res, fallbackPath);
  }

  // Default: redirect to simulator
  res.writeHead(302, { Location: '/' });
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`📱 Festival Maps Mobile Simulator running!`);
  console.log(`URL:                http://localhost:${PORT}`);
  console.log(`API Gateway Target: http://${GATEWAY_HOST}:${GATEWAY_PORT}`);
  console.log(`Serving Web App:    ${WWW_DIR}`);
  console.log(`Press Ctrl+C to stop.`);
  console.log(`=======================================================`);
});

// Handle graceful shutdown on Ctrl+C (SIGINT) and SIGTERM
const shutdown = () => {
  console.log('\nStopping Mobile Simulator server...');
  server.close(() => {
    console.log('Mobile Simulator server stopped.');
    process.exit(0);
  });
  // Force exit after 1 second if any keep-alive socket is pending
  setTimeout(() => process.exit(0), 1000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
