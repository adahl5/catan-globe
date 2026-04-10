/**
 * e2e/websocket.spec.ts
 *
 * End-to-end tests for the Express + WebSocket server (server.mjs).
 *
 * Strategy
 * --------
 * Playwright runs a real Chromium instance against the actual server.
 * All WebSocket interactions happen via `page.evaluate()` so they run inside
 * the browser's JS engine — the same environment the real app uses.
 *
 * HTTP navigation is intercepted with `page.route()` to serve a blank HTML
 * page, which means the tests don't require a production build in ./dist.
 * WebSocket connections are NOT affected by `page.route()` and reach the
 * server directly.
 *
 * Per-page state
 * --------------
 * Each page stores its WebSocket in `window.__ws` and accumulates received
 * messages in `window.__msgs`.  Helper functions below wrap the common
 * open → send → await-message pattern.
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_URL = 'ws://localhost:3001/ws'
const BASE_URL = 'http://localhost:3001'

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/**
 * Navigate the page to BASE_URL, intercepting the HTTP request so the test
 * does not depend on a built ./dist directory.  The page gets a valid HTTP
 * origin (`http://localhost:3001`) so the browser permits WebSocket
 * connections to the same host.
 */
async function setupPage(page: Page): Promise<void> {
  await page.route(
    (url) => url.href.startsWith(BASE_URL),
    (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
  )
  await page.goto(BASE_URL)
}

/**
 * Open a WebSocket from inside the page and wait for it to be connected.
 * The socket is stored in `window.__ws`; incoming messages are pushed onto
 * `window.__msgs` as parsed objects.
 */
async function openWs(page: Page): Promise<void> {
  await page.evaluate((url) => {
    ;(window as any).__msgs = []
    const ws = new WebSocket(url)
    ;(window as any).__ws = ws
    ws.onmessage = (e: MessageEvent) => {
      ;(window as any).__msgs.push(JSON.parse(e.data as string))
    }
    return new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('WebSocket connection failed'))
    })
  }, WS_URL)
}

/** Send a JSON message via the page's stored WebSocket. */
async function wsSend(page: Page, msg: Record<string, unknown>): Promise<void> {
  await page.evaluate((data) => {
    ;(window as any).__ws.send(JSON.stringify(data))
  }, msg)
}

/**
 * Wait until the page has received at least one message of `type`, then
 * return the first such message.
 */
async function waitForMessage(
  page: Page,
  type: string,
): Promise<Record<string, unknown>> {
  await page.waitForFunction(
    (t) => ((window as any).__msgs as any[])?.some((m) => m.type === t),
    type,
    { timeout: 8_000 },
  )
  return page.evaluate(
    (t) => ((window as any).__msgs as any[]).find((m) => m.type === t),
    type,
  )
}

/** Return every message received by the page so far. */
async function allMessages(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => (window as any).__msgs ?? [])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('WebSocket server', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page)
  })

  // ── Room creation ──────────────────────────────────────────────────────────

  test('CREATE_ROOM responds with ROOM_CREATED', async ({ page }) => {
    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })

    const msg = await waitForMessage(page, 'ROOM_CREATED')

    expect(msg.type).toBe('ROOM_CREATED')
    // Room IDs use the unambiguous character set defined in server.mjs
    expect(msg.roomId).toMatch(/^[A-Z2-9]{6}$/)
    expect(msg.playerIndex).toBe(0)
  })

  test('each CREATE_ROOM produces a unique room ID', async ({ page, context }) => {
    const page2 = await context.newPage()
    await setupPage(page2)

    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId: id1 } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    await openWs(page2)
    await wsSend(page2, { type: 'CREATE_ROOM' })
    const { roomId: id2 } = (await waitForMessage(page2, 'ROOM_CREATED')) as { roomId: string }

    expect(id1).not.toBe(id2)
  })

  // ── Joining ────────────────────────────────────────────────────────────────

  test('JOIN_ROOM responds with ROOM_JOINED containing an empty history', async ({
    page,
    context,
  }) => {
    const page2 = await context.newPage()
    await setupPage(page2)

    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    await openWs(page2)
    await wsSend(page2, { type: 'JOIN_ROOM', roomId })

    const joined = await waitForMessage(page2, 'ROOM_JOINED')
    expect(joined.type).toBe('ROOM_JOINED')
    expect(joined.roomId).toBe(roomId)
    expect(joined.playerIndex).toBe(1)
    expect(joined.history).toEqual([])
  })

  test('JOIN_ROOM with an unknown room ID responds with ERROR', async ({ page }) => {
    await openWs(page)
    await wsSend(page, { type: 'JOIN_ROOM', roomId: 'ZZZZZZ' })

    const msg = await waitForMessage(page, 'ERROR')
    expect(msg.type).toBe('ERROR')
    expect(msg.message).toContain('ZZZZZZ')
  })

  test('JOIN_ROOM normalises the room ID to upper-case', async ({ page, context }) => {
    const page2 = await context.newPage()
    await setupPage(page2)

    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    // Send the room ID in lower-case — server should still accept it
    await openWs(page2)
    await wsSend(page2, { type: 'JOIN_ROOM', roomId: roomId.toLowerCase() })

    const joined = await waitForMessage(page2, 'ROOM_JOINED')
    expect(joined.roomId).toBe(roomId)
  })

  // ── Player count ───────────────────────────────────────────────────────────

  test('PLAYER_COUNT is broadcast to all clients when a player joins', async ({
    page,
    context,
  }) => {
    const page2 = await context.newPage()
    await setupPage(page2)

    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    await openWs(page2)
    await wsSend(page2, { type: 'JOIN_ROOM', roomId })

    const [countForHost, countForJoiner] = await Promise.all([
      waitForMessage(page, 'PLAYER_COUNT'),
      waitForMessage(page2, 'PLAYER_COUNT'),
    ])

    expect(countForHost.count).toBe(2)
    expect(countForJoiner.count).toBe(2)
  })

  test('PLAYER_COUNT drops to 1 when a player disconnects', async ({ page, context }) => {
    const page2 = await context.newPage()
    await setupPage(page2)

    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    await openWs(page2)
    await wsSend(page2, { type: 'JOIN_ROOM', roomId })
    // Wait for the join broadcast to land on the host before disconnecting
    await waitForMessage(page, 'PLAYER_COUNT')

    // Close page2's WebSocket — the server's close handler fires
    await page2.evaluate(() => (window as any).__ws.close())

    // Host should eventually receive an updated PLAYER_COUNT of 1
    await page.waitForFunction(
      () =>
        ((window as any).__msgs as any[])
          .filter((m) => m.type === 'PLAYER_COUNT')
          .some((m) => m.count === 1),
      { timeout: 8_000 },
    )

    const msgs = await allMessages(page)
    const last = msgs.filter((m) => m.type === 'PLAYER_COUNT').at(-1)
    expect(last?.count).toBe(1)
  })

  // ── Game actions ───────────────────────────────────────────────────────────

  test('GAME_ACTION is echoed back to the sender', async ({ page, context }) => {
    const page2 = await context.newPage()
    await setupPage(page2)

    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    await openWs(page2)
    await wsSend(page2, { type: 'JOIN_ROOM', roomId })
    await waitForMessage(page2, 'ROOM_JOINED')

    const action = { type: 'ROLL_DICE', value: 7 }
    await wsSend(page, { type: 'GAME_ACTION', action })

    const echo = await waitForMessage(page, 'GAME_ACTION')
    expect(echo.action).toEqual(action)
  })

  test('GAME_ACTION is broadcast to all other clients in the room', async ({
    page,
    context,
  }) => {
    const page2 = await context.newPage()
    await setupPage(page2)

    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    await openWs(page2)
    await wsSend(page2, { type: 'JOIN_ROOM', roomId })
    await waitForMessage(page2, 'ROOM_JOINED')

    const action = { type: 'PLACE_ROAD', edge: 12 }
    await wsSend(page, { type: 'GAME_ACTION', action })

    // Both the sender and the other client must receive the action
    const [recv1, recv2] = await Promise.all([
      waitForMessage(page, 'GAME_ACTION'),
      waitForMessage(page2, 'GAME_ACTION'),
    ])

    expect(recv1.action).toEqual(action)
    expect(recv2.action).toEqual(action)
  })

  test('GAME_ACTION is not delivered to clients in other rooms', async ({ page, context }) => {
    const page2 = await context.newPage()
    const page3 = await context.newPage()
    await setupPage(page2)
    await setupPage(page3)

    // Room A
    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId: roomA } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    // Room B (separate room)
    await openWs(page2)
    await wsSend(page2, { type: 'CREATE_ROOM' })
    await waitForMessage(page2, 'ROOM_CREATED')

    // page3 joins room A
    await openWs(page3)
    await wsSend(page3, { type: 'JOIN_ROOM', roomId: roomA })
    await waitForMessage(page3, 'ROOM_JOINED')

    // page sends an action in room A
    const action = { type: 'BUILD_CITY', vertex: 3 }
    await wsSend(page, { type: 'GAME_ACTION', action })

    // page3 (room A) must receive it
    const recv = await waitForMessage(page3, 'GAME_ACTION')
    expect(recv.action).toEqual(action)

    // page2 (room B) must NOT receive it — wait briefly then check
    await page2.waitForTimeout(300)
    const msgs2 = await allMessages(page2)
    expect(msgs2.every((m) => m.type !== 'GAME_ACTION')).toBe(true)
  })

  // ── Late-join history ──────────────────────────────────────────────────────

  test('late joiner receives full action history in ROOM_JOINED', async ({
    page,
    context,
  }) => {
    const page2 = await context.newPage()
    await setupPage(page2)

    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    // Host dispatches two actions before anyone else is in the room
    const action1 = { type: 'START_GAME', seed: 1 }
    const action2 = { type: 'PLACE_SETTLEMENT', vertex: 5 }

    await wsSend(page, { type: 'GAME_ACTION', action: action1 })
    await wsSend(page, { type: 'GAME_ACTION', action: action2 })

    // Wait until both echo back to the host so we know the server has stored them
    await page.waitForFunction(
      () =>
        ((window as any).__msgs as any[]).filter((m) => m.type === 'GAME_ACTION').length >= 2,
      { timeout: 8_000 },
    )

    // Now the late joiner connects
    await openWs(page2)
    await wsSend(page2, { type: 'JOIN_ROOM', roomId })

    const joined = await waitForMessage(page2, 'ROOM_JOINED')

    expect(Array.isArray(joined.history)).toBe(true)
    const history = joined.history as unknown[]
    expect(history).toHaveLength(2)
    expect(history[0]).toEqual(action1)
    expect(history[1]).toEqual(action2)
  })

  // ── Room lifecycle ─────────────────────────────────────────────────────────

  test('room is deleted after the last client disconnects', async ({ page, context }) => {
    const page2 = await context.newPage()
    await setupPage(page2)

    // Create a room and grab its ID
    await openWs(page)
    await wsSend(page, { type: 'CREATE_ROOM' })
    const { roomId } = (await waitForMessage(page, 'ROOM_CREATED')) as { roomId: string }

    // Close the only client's WebSocket — room should be deleted on the server
    await page.evaluate(() => (window as any).__ws.close())
    // Give the server a moment to run the close handler
    await page.waitForTimeout(200)

    // Attempting to join the now-deleted room must return an ERROR
    await openWs(page2)
    await wsSend(page2, { type: 'JOIN_ROOM', roomId })

    const err = await waitForMessage(page2, 'ERROR')
    expect(err.type).toBe('ERROR')
    expect(err.message).toContain(roomId)
  })
})
