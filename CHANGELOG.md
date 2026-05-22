# Changelog

All notable changes to Guest Lights are documented here.

---

## [1.6.0] — 2025

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

## [1.5.0]

### Added
- Stdout usage logging on the proxy server — logs every API call and WebSocket `call_service` command with a timestamp and client IP.

---

## [1.4.0]

### Added
- Light theme alongside the existing dark theme; toggled via a button in the header; selection persisted to localStorage.

---

## [1.3.0]

### Added
- Dining Room scene card with preset scene buttons replacing per-bulb controls.
- Collapsible colour/CT section on room cards.

### Fixed
- Warmth slider now correctly controls `rgbww`/`rgbw` bulbs (was a no-op).
- Warmth slider inverted so dragging right increases warmth.
- CT and brightness sliders now sync from live WebSocket state updates.

---

## [1.2.0]

### Changed
- Dining Room brightness and colour controls restored below scene buttons.

---

## [1.1.0]

### Changed
- Repository and add-on URLs corrected for public release.
- README reworded for a public audience.
- Sensor-controlled rooms removed from the guest UI (entryway, bathrooms, stairwell).

---

## [1.0.0]

### Added
- Initial release.
- Room cards organised by floor with master on/off toggle and brightness slider.
- Per-bulb controls accessible by expanding a room card.
- Adaptive UI: RGB bulbs show a colour wheel; white/CT bulbs show a warmth slider.
- Live state sync via WebSocket — changes from other sources appear instantly.
- All Off button in the header.
- Node.js proxy server: HA token injected server-side, never sent to the browser; API whitelist limits exposure to light and state endpoints only.
- Security hardening: CORS, request body limit, path traversal protection, WebSocket token validation.
