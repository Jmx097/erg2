export function logLaptopBridgeEvent<T extends { event: string }>(entry: T): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      ...entry
    })
  );
}
