import { parseMissionCatalog } from './mission-catalog.ts';
self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ catalog: parseMissionCatalog(event.data) });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
