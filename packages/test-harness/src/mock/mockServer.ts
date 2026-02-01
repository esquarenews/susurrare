import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { URL } from 'url';

export interface MockServerOptions {
  partials?: string[];
  finalText?: string;
  delayMs?: number;
}

export const startMockTranscriptionServer = async (options: MockServerOptions = {}) => {
  const partials = options.partials ?? ['Hello', 'Hello world'];
  const finalText = options.finalText ?? 'Hello world from mock';
  const delayMs = options.delayMs ?? 10;

  const server = createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end();
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/transcriptions' && req.method === 'POST') {
      if (url.searchParams.get('error') === 'timeout') {
        return;
      }
      if (url.searchParams.get('error') === 'fail') {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'mock failure' }));
        return;
      }
      let body = Buffer.alloc(0);
      req.on('data', (chunk) => {
        body = Buffer.concat([body, chunk]);
      });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ text: finalText, bytes: body.length }));
      });
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.searchParams.get('error') === 'fail') {
      socket.close(1011, 'mock failure');
      return;
    }
    if (url.searchParams.get('error') === 'timeout') {
      return;
    }
    let index = 0;
    const sendNext = () => {
      if (index < partials.length) {
        socket.send(
          JSON.stringify({ kind: 'partial', text: partials[index], timestamp: Date.now() })
        );
        index += 1;
        setTimeout(sendNext, delayMs);
      } else {
        socket.send(
          JSON.stringify({ kind: 'final', text: finalText, timestamp: Date.now() })
        );
        setTimeout(() => socket.close(), delayMs);
      }
    };
    setTimeout(sendNext, delayMs);
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to start mock server');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const close = async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { baseUrl, close };
};
