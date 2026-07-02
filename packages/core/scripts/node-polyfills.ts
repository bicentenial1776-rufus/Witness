import WebSocket from 'ws';

// supabase-js initializes a realtime client even when unused; Node 20 has
// no global WebSocket (that lands in Node 22), so it throws on import
// without this. Node-only — the Expo app has its own global WebSocket.
if (!globalThis.WebSocket) {
  // @ts-expect-error -- ws's WebSocket is not structurally identical to lib.dom's, close enough here.
  globalThis.WebSocket = WebSocket;
}
