# Mobile Workspace

This workspace is now a runnable Expo/React Native shell for the production
mobile companion path.

## Run

```bash
cp .env.example .env
npm run dev
```

Useful variants:

```bash
npm run android
npm run ios
npm run web
```

## What It Does

- restores a stored device registration from secure storage on launch
- refreshes the session when needed
- requests a new websocket ticket and connects to the relay
- shows `Pair`, `Connecting`, `Connected`, and `Repair` screens
- handles `ready`, `reply.delta`, `reply.final`, `token.expiring`, `error`, and `revoked`
- uses a native BLE adapter path via `react-native-ble-plx`

## Environment Defaults

- `EXPO_PUBLIC_DEFAULT_RELAY_BASE_URL`
- `EXPO_PUBLIC_DEFAULT_DEVICE_DISPLAY_NAME`
- `EXPO_PUBLIC_G2_BLE_DEVICE_NAME_PREFIX`
- `EXPO_PUBLIC_G2_BLE_SERVICE_UUID`
- `EXPO_PUBLIC_G2_BLE_RX_CHARACTERISTIC_UUID`
- `EXPO_PUBLIC_G2_BLE_TX_CHARACTERISTIC_UUID`
- `EXPO_PUBLIC_G2_BLE_SCAN_TIMEOUT_MS`

These only seed the pairing form. They are not credentials.

## Key Modules

- `App.tsx`: app shell and screen rendering
- `src/app/use-mobile-companion-app.ts`: UI state orchestration
- `src/mobile-companion.ts`: pairing, restore, refresh, connect, repair logic
- `src/websocket-session.ts`: websocket lifecycle, resume, and reconnect behavior
- `src/adapters/expo-secure-storage.ts`: secure storage adapter for Expo
- `src/adapters/native-websocket.ts`: RN websocket runtime adapter
- `src/adapters/react-native-ble-bridge.ts`: native BLE scan/connect/read/write adapter
- `src/ble.ts`: BLE boundary and fallback no-op bridge

## Notes

- Access tokens stay in memory only.
- Long-lived registration material is stored with Expo Secure Store.
- BLE requires a development build or prebuilt native app. It will not work in
  Expo Go because `react-native-ble-plx` uses custom native code.
- Real device message I/O still depends on providing the G2 service and
  characteristic UUIDs through environment config.
