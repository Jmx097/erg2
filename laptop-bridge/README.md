# Laptop Bridge

This workspace runs on the local laptop that can see Bluetooth hardware. It is
the thin bridge between nearby Xreal G2 glasses and the VPS-hosted OpenClaw
service.

## What It Does

- connects to the glasses locally over BLE
- normalizes device events into a small shared schema
- forwards those events to the VPS over HTTPS
- exposes a tiny local health surface for debugging
- keeps raw BLE payload logging behind a debug flag

## Modes

- `mock`: no hardware required; emits synthetic connection, telemetry, and
  control events so upstream integration can be tested locally
- `xreal_g2_ble_stub`: real adapter scaffold with TODO points for BLE service,
  RX, and TX UUIDs; safe to run before hardware details are finalized

## Run

```bash
cp .env.example .env
npm run dev
```

Health endpoint:

```bash
curl http://127.0.0.1:8791/health
```

## Key Env

- `LAPTOP_BRIDGE_ID`
- `LAPTOP_BRIDGE_DEVICE_ID`
- `LAPTOP_BRIDGE_ADAPTER_MODE`
- `LAPTOP_BRIDGE_VPS_BASE_URL`
- `LAPTOP_BRIDGE_VPS_TOKEN`
- `LAPTOP_BRIDGE_G2_NAME_PREFIX`
- `LAPTOP_BRIDGE_G2_SERVICE_UUID`
- `LAPTOP_BRIDGE_G2_RX_CHARACTERISTIC_UUID`
- `LAPTOP_BRIDGE_G2_TX_CHARACTERISTIC_UUID`

## Debug Flow

1. run in `mock` mode to validate upstream transport and VPS ingest
2. switch to `xreal_g2_ble_stub` mode once the laptop can access the glasses
3. fill in BLE UUID config when the real G2 service and characteristic values
   are known
4. enable `LAPTOP_BRIDGE_RAW_BLE_DEBUG=true` only when raw payload tracing is needed
