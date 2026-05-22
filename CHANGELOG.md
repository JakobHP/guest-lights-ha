# Changelog

All notable changes to Guest Lights are documented here.

---

## [1.7.0] — 2026-05-22

### Fixed
- **WebSocket backoff broken** — `retryCount` was declared inside `connectWSLive`, resetting to 0 on every reconnect call. Moved to module scope (`_wsRetryCount`); resets to 0 on successful `auth_ok`. Exponential backoff and the 10-retry cap now work correctly.
- **`ws.onerror` never set** — browser WebSocket errors were silently swallowed. Handler added; errors are now logged to the console.
- **Color wheel hammering HA** — dragging the colour wheel fired a `setHsColor` API call on every pointer event. Debounced to 80 ms (matching the CT and brightness sliders); preview swatch still updates instantly.
- **Per-bulb toggle stuck after first click** — the click handler closed over the `entity` variable captured at build time. After the first click, `state.entities[id]` is replaced with a new object via spread, but the closure kept reading the original stale reference — so every subsequent click sent the same on/off command. Fixed by reading `state.entities[entityId]` live inside the handler.

### Added
- **All Off undo toast** — tapping All Off now snapshots which lights were on, turns everything off, and shows a slide-up toast with an Undo button for 5 seconds. Tapping Undo restores previously-on lights.

---

## [1.6.0] — 2026-05-21

### Added
- **Pinnable rooms** — tap the pin icon on any card to move it to a Pinned section at the top of the page; persists across reloads via localStorage.
- **Dark/light theme toggle** — manual toggle in the header; defaults to dark; persisted to localStorage.
- **Dining Room scene buttons** — Normal, Dreamy Dusk, Emerald Flicker, Savanna Sunset preset scenes.
- **Expandable card sections** — brightness always visible; colour wheel and warmth slider revealed on expand; individual bulbs in a separate tinted zone.
- **Single-bulb rooms** — redundant per-bulb controls suppressed automatically.
- **Local dev environment** — `docker-compose.yml` with a mock HA server for development without a live Home Assistant instance.

### Changed
- Warmth slider direction corrected: right is always warmer (lower mireds inverted at send and display time).
- Scene card expand arrow hidden when there is nothing to expand.
- Header layout: All Off button on the left, theme toggle on the right.

---

## [1.5.0] — 2026-05-20

### Added
- Stdout usage logging on the proxy server — logs every API call and WebSocket `call_service` command with a timestamp and client IP.

---

## [1.4.0] — 2026-05-20

### Added
- Light theme alongside the existing dark theme; toggled via a button in the header; selection persisted to localStorage.

---

## [1.3.0] — 2026-05-20

### Added
- Dining Room scene card with preset scene buttons replacing per-bulb controls.
- Collapsible colour/CT section on room cards.

### Fixed
- Warmth slider now correctly controls `rgbww`/`rgbw` bulbs (was a no-op).
- Warmth slider inverted so dragging right increases warmth.
- CT and brightness sliders now sync from live WebSocket state updates.

---

## [1.2.0] — 2026-05-20

### Changed
- Dining Room brightness and colour controls restored below scene buttons.

---

## [1.1.0] — 2026-05-20

### Changed
- Repository and add-on URLs corrected for public release.
- README reworded for a public audience.
- Sensor-controlled rooms removed from the guest UI (entryway, bathrooms, stairwell).

---

## [1.0.0] — 2026-05-19

### Added
- Initial release.
- Room cards organised by floor with master on/off toggle and brightness slider.
- Per-bulb controls accessible by expanding a room card.
- Adaptive UI: RGB bulbs show a colour wheel; white/CT bulbs show a warmth slider.
- Live state sync via WebSocket — changes from other sources appear instantly.
- All Off button in the header.
- Node.js proxy server: HA token injected server-side, never sent to the browser; API whitelist limits exposure to light and state endpoints only.
- Security hardening: CORS, request body limit, path traversal protection, WebSocket token validation.

