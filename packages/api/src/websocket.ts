import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import Redis from 'ioredis';
import { config } from './config.js';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  subscriptions: Set<string>;
}

// Available subscription channels
const CHANNELS = {
  BLOCKS: 'twilight:block:new',
  TRANSACTIONS: 'twilight:tx:new',
  DEPOSITS: 'twilight:deposit:new',
  WITHDRAWALS: 'twilight:withdrawal:new',
} as const;

export function createWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Redis subscriber for receiving events from indexer
  let redisSubscriber: Redis | null = null;

  try {
    redisSubscriber = new Redis(config.redisUrl);

    // Subscribe to all channels
    redisSubscriber.subscribe(
      CHANNELS.BLOCKS,
      CHANNELS.TRANSACTIONS,
      CHANNELS.DEPOSITS,
      CHANNELS.WITHDRAWALS
    );

    // Handle messages from Redis
    redisSubscriber.on('message', (channel, message) => {
      const data = JSON.parse(message);

      wss.clients.forEach((client) => {
        const ws = client as ExtendedWebSocket;
        if (ws.readyState === WebSocket.OPEN) {
          // Check if client is subscribed to this channel
          if (ws.subscriptions.has(channel) || ws.subscriptions.has('*')) {
            ws.send(
              JSON.stringify({
                type: channel.split(':').pop(),
                data,
                timestamp: new Date().toISOString(),
              })
            );
          }
        }
      });
    });

    redisSubscriber.on('error', (err) => {
      console.error('Redis subscriber error:', err);
    });
  } catch (error) {
    console.warn('Redis not available, WebSocket will work without real-time updates');
  }

  // Handle new connections
  wss.on('connection', (socket: WebSocket) => {
    const ws = socket as ExtendedWebSocket;
    ws.isAlive = true;
    ws.subscriptions = new Set(['*']); // Subscribe to all by default

    console.log('WebSocket client connected');

    // Handle pong responses
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.action) {
          case 'subscribe':
            // Subscribe to specific channel
            if (data.channel && Object.values(CHANNELS).includes(data.channel)) {
              ws.subscriptions.add(data.channel);
              ws.send(
                JSON.stringify({
                  type: 'subscribed',
                  channel: data.channel,
                })
              );
            }
            break;

          case 'unsubscribe':
            // Unsubscribe from specific channel
            if (data.channel) {
              ws.subscriptions.delete(data.channel);
              ws.send(
                JSON.stringify({
                  type: 'unsubscribed',
                  channel: data.channel,
                })
              );
            }
            break;

          case 'subscribe_all':
            ws.subscriptions.add('*');
            ws.send(JSON.stringify({ type: 'subscribed', channel: '*' }));
            break;

          case 'unsubscribe_all':
            ws.subscriptions.clear();
            ws.send(JSON.stringify({ type: 'unsubscribed', channel: '*' }));
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;

          default:
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Unknown action',
              })
            );
        }
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
          })
        );
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'connected',
        message: 'Connected to Twilight Explorer WebSocket',
        channels: Object.keys(CHANNELS).map((k) => k.toLowerCase()),
      })
    );
  });

  // Ping clients every 30 seconds to keep connections alive
  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as ExtendedWebSocket;
      if (!ws.isAlive) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
    if (redisSubscriber) {
      redisSubscriber.quit();
    }
  });

  return wss;
}

// Broadcast message to all connected clients
export function broadcast(wss: WebSocketServer, type: string, data: unknown): void {
  const message = JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString(),
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
