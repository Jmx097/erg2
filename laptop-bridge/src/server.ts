import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import { loadLaptopBridgeConfig } from "./config.js";
import { startHealthServer } from "./health-app.js";
import { logLaptopBridgeEvent } from "./logger.js";
import { LaptopBridgeRuntime } from "./bridge-runtime.js";
import { MockG2BleAdapter } from "./adapters/mock-g2-ble-adapter.js";
import { XrealG2BleAdapterStub } from "./adapters/xreal-g2-ble-adapter.js";

export interface StartedLaptopBridgeServer {
  runtime: LaptopBridgeRuntime;
  server: Server;
  port: number;
  close(): Promise<void>;
}

export async function startLaptopBridgeServer(): Promise<StartedLaptopBridgeServer> {
  const config = loadLaptopBridgeConfig();
  const adapter =
    config.adapterMode === "mock"
      ? new MockG2BleAdapter()
      : new XrealG2BleAdapterStub({
          deviceNamePrefix: config.g2NamePrefix,
          serviceUuid: config.g2ServiceUuid,
          rxCharacteristicUuid: config.g2RxCharacteristicUuid,
          txCharacteristicUuid: config.g2TxCharacteristicUuid,
          rawBleDebug: config.rawBleDebug
        });

  const runtime = new LaptopBridgeRuntime(config, adapter);
  await runtime.start();
  const server = await startHealthServer(config.port, runtime);

  logLaptopBridgeEvent({
    event: "laptop_bridge_started",
    bridgeId: config.bridgeId,
    port: config.port,
    mode: config.adapterMode,
    upstreamBaseUrl: config.vpsBaseUrl
  });

  return {
    runtime,
    server,
    port: config.port,
    async close() {
      await runtime.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startLaptopBridgeServer().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
