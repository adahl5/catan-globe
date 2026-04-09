/**
 * server.mjs — Express + WebSocket server for online multiplayer.
 *
 * - Serves the built Vite SPA from ./dist
 * - Manages game rooms over WebSocket at /ws
 * - Stores action history so late-joiners can replay and catch up
 *
 * Run:  node server.mjs
 * Env:  PORT (default 3000)
 */

import { createServer } from 'http'
import { fileURLToPath } from 'url'
import path from 'path'
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// HTTP / static
// ---------------------------------------------------------------------------

const app = express()
const distDir = path.join(__dirname, 'dist')

app.use(express.static(distDir))
// SPA fallback — let React Router / hash routing handle deep links
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))

// ---------------------------------------------------------------------------
// WebSocket room management
// ---------------------------------------------------------------------------

/**
 * @typedef {{ clients: Set<WebSocket>, actions: any[] }} Room
 * @type {Map<string, Room>}
 */
const rooms = new Map()

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // unambiguous chars
  let id = ''
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

function uniqueRoomId() {
  let id = generateRoomId()
  while (rooms.has(id)) id = generateRoomId()
  return id
}

function broadcastPlayerCount(room) {
  const count = room.clients.size
  const msg = JSON.stringify({ type: 'PLAYER_COUNT', count })
  for (const client of room.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  }
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws) => {
  /** @type {string | null} */
  let currentRoomId = null

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    // ── CREATE_ROOM ──────────────────────────────────────────────────────────
    if (msg.type === 'CREATE_ROOM') {
      const roomId = uniqueRoomId()
      rooms.set(roomId, { clients: new Set([ws]), actions: [] })
      currentRoomId = roomId
      ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomId, playerIndex: 0 }))

    // ── JOIN_ROOM ────────────────────────────────────────────────────────────
    } else if (msg.type === 'JOIN_ROOM') {
      const roomId = (msg.roomId ?? '').toUpperCase()
      const room = rooms.get(roomId)
      if (!room) {
        ws.send(JSON.stringify({ type: 'ERROR', message: `Room "${roomId}" not found.` }))
        return
      }
      currentRoomId = roomId
      const playerIndex = room.clients.size  // 0 = host already there; this joiner is 1, 2, 3…
      room.clients.add(ws)
      // Send full action history so the joiner can replay and reach current state
      ws.send(JSON.stringify({ type: 'ROOM_JOINED', roomId, history: room.actions, playerIndex }))
      broadcastPlayerCount(room)

    // ── GAME_ACTION ──────────────────────────────────────────────────────────
    } else if (msg.type === 'GAME_ACTION') {
      const room = rooms.get(currentRoomId)
      if (!room) return
      room.actions.push(msg.action)
      // Broadcast to ALL clients (including sender) — everyone applies it on receipt
      const out = JSON.stringify({ type: 'GAME_ACTION', action: msg.action })
      for (const client of room.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(out)
      }
    }
  })

  ws.on('close', () => {
    if (!currentRoomId) return
    const room = rooms.get(currentRoomId)
    if (!room) return
    room.clients.delete(ws)
    if (room.clients.size === 0) {
      rooms.delete(currentRoomId)
    } else {
      broadcastPlayerCount(room)
    }
  })

  ws.on('error', (err) => console.error('[ws] client error:', err.message))
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '3000', 10)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎲 Catan Globe server listening on port ${PORT}`)
})
