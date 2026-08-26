'use strict';

const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { registerSocketServer } = require('./src/server/socket');

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer);
  registerSocketServer(io);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (${dev ? 'development' : 'production'})`);
  });
});
