# Guest Lights — Home Assistant Add-on

Let guests control your lights without giving them access to Home Assistant.
Exposes a simple room-based UI on your local network — no login, no account,
no app required. Guests just open a URL.

---

## Installation

### Option A: Add from GitHub (recommended)

1. In HA: **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add: `https://github.com/JakobHP/guest-lights-ha`
3. Find **Guest Lights** in the store and click Install.
4. Go to the **Configuration** tab and fill in:
   ```
   ha_url: http://homeassistant.local:8123
   ha_token: <your long-lived token>
   ```
5. Start the add-on. The UI is available at `http://<your-ha-ip>:7080`

### Option B: Local install via SSH / Samba

1. Copy the `guest-lights-addon` folder to your HA host:
   ```
   /addons/guest_lights/
   ```
   (Via Samba: `\\homeassistant\addons\` or directly over SSH)
2. In HA: **Settings → Add-ons → Add-on Store → ⋮ → Check for updates**
3. Scroll to **Local add-ons** — Guest Lights should appear.
4. Install, configure, then Start.

---

## Configuration

| Key        | Description                                        | Example                           |
|------------|----------------------------------------------------|-----------------------------------|
| `ha_url`   | Local URL of your Home Assistant instance          | `http://homeassistant.local:8123` |
| `ha_token` | Long-lived access token (HA Profile → Security)    | `eyJhbG...`                       |

To create a token: open HA → click your avatar (bottom-left) → **Security** tab →
**Long-lived access tokens** → Create token → copy it.

---

## Features

- **Room cards** organised by area
- **Room-level controls**: master toggle, brightness, colour wheel or warmth slider
- **Per-bulb controls**: expand any room to adjust individual lights
- **Adaptive UI**: RGB bulbs show a colour wheel; white/CT bulbs show a warmth slider
- **Live sync** via WebSocket — changes from other sources (voice, automations) appear instantly
- **All Off** button always visible in the header
- Your HA token is never sent to the browser — the add-on injects it server-side

---

## Sharing access

Point guests to `http://<your-ha-ip>:7080` — or display it as a QR code.
No login or Home Assistant account required.

---

## Architecture

```
Guest browser
    │
    │  HTTP + WebSocket  (port 7080)
    ▼
Node.js proxy  (HA add-on container)
    │  — injects HA token on WebSocket auth handshake
    │  — only forwards /api/states and /api/services/light/*
    ▼
Home Assistant  (port 8123)
```
