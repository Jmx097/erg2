import { OsEventTypeList, waitForEvenAppBridge, type EvenAppBridge, type EvenHubEvent } from "@evenrealities/even_hub_sdk";

export async function connectEvenBridge(): Promise<EvenAppBridge> {
  return waitForEvenAppBridge();
}

export function getEventType(event: EvenHubEvent): OsEventTypeList | undefined {
  return event.textEvent?.eventType ?? event.listEvent?.eventType ?? event.sysEvent?.eventType;
}

export function isClickEvent(event: EvenHubEvent): boolean {
  const eventType = getEventType(event);
  return (
    eventType === OsEventTypeList.CLICK_EVENT ||
    (eventType === undefined && Boolean(event.textEvent || event.listEvent || event.sysEvent?.eventSource !== undefined))
  );
}

export function isDoubleClickEvent(event: EvenHubEvent): boolean {
  return getEventType(event) === OsEventTypeList.DOUBLE_CLICK_EVENT;
}

export function isForegroundEnterEvent(event: EvenHubEvent): boolean {
  return getEventType(event) === OsEventTypeList.FOREGROUND_ENTER_EVENT;
}

export function isForegroundExitEvent(event: EvenHubEvent): boolean {
  return getEventType(event) === OsEventTypeList.FOREGROUND_EXIT_EVENT;
}

export function isAbnormalExitEvent(event: EvenHubEvent): boolean {
  return getEventType(event) === OsEventTypeList.ABNORMAL_EXIT_EVENT;
}
