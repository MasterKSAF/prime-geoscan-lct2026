import { obstacleSourceSchema, parseObstacleKml } from './obstacle-layer';
self.onmessage = async (event: MessageEvent) => {
  try {
    const source = obstacleSourceSchema.parse(event.data);
    const catalog = parseObstacleKml(source.sourceText);
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(source.sourceText),
        ),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    self.postMessage({ catalog, hash });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
