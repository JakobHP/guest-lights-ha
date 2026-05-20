# Guest Lights — Home Assistant Add-on

A minimal, unauthenticated web app for guests to control lights by room.
Guests can toggle rooms, adjust brightness, pick colors, and control individual
bulbs — without needing a Home Assistant account.

---

## Installation (Sideload)

HA Add-on Store only accepts repos accessible via URL. The easiest sideload
method is to put this folder on a GitHub repo and point HA to it, **or** use
the local filesystem method below.

### Option A: GitHub repo (recommended)

1. Fork or push this entire `GuestWebApp` folder to a GitHub repo.
2. In HA: **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
3. Add your repo URL: `https://github.com/JakobHP/guest-lights-ha`
4. The **Guest Lights** add-on will appear — click Install.
5. Go to **Configuration** tab, fill in:
   ```
   ha_url: http://homeassistant.local:8123
   ha_token: <your long-lived token>
   ```
6. Start the add-on. Access the app at `http://homeassistant.local:7080`

### Option B: SSH / Samba local install

1. Copy the `guest-lights-addon` folder to your HA host at:
   ```
   /addons/guest_lights/
   ```
   (Via Samba share: `\\homeassistant\addons\` or SSH into the host)

2. In HA: **Settings → Add-ons → Add-on Store → ⋮ → Check for updates**
3. Scroll down to **Local add-ons** — Guest Lights should appear.
4. Install, configure (ha_url + ha_token), then Start.

---

## Configuration

| Key        | Description                                      | Example                              |
|------------|--------------------------------------------------|--------------------------------------|
| `ha_url`   | URL of your HA instance (LAN address)            | `http://homeassistant.local:8123`    |
| `ha_token` | Long-lived access token from HA Profile → Security | `eyJhbG...`                        |

**Creating a token:** HA → Profile (bottom-left avatar) → Security tab →
"Long-lived access tokens" → Create token → copy it.

---

## Features

- **Room cards** auto-populated from HA Areas
- **Room-level controls**: toggle all, master brightness, color wheel / warmth slider
- **Expand** any room to control individual bulbs
- **Adaptive controls**: RGB bulbs show color wheel; white/CT bulbs show warmth slider
- **Real-time sync** via WebSocket — changes made elsewhere reflect instantly
- **All Off** button in the header
- Token never exposed to guests — proxied server-side

---

## Accessing the app

`http://<your-ha-ip>:7080`

Share this URL (or a QR code) with guests. No login required.

---

## Architecture

```
Guest browser
    │
    │ HTTP + WS (port 7080)
    ▼
Node.js proxy (in HA add-on container)
    │  injects real HA token on WS auth
    │  forwards /api/* to HA
    ▼
Home Assistant (port 8123)
```
