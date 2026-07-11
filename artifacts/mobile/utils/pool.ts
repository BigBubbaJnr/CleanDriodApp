/**
 * CleanDroid — async concurrency pool.
 *
 * Processes `items` with `fn` using at most `concurrency` workers running in
 * parallel. Workers pull from a shared atomic index, so the pool stays full
 * until the queue is drained. Per-item errors are swallowed and forwarded to
 * logError so a single bad asset cannot abort the whole batch.
 *
 * Usage:
 *   const results = await runWithPool(assets, async (asset) => {
 *     return await getFileInfo(asset.uri);
 *   }, POOL_CONCURRENCY);
 *
 * Returns an array of T | undefined (undefined on per-item error).
 */

import { logError } from './logger';

export async function runWithPool<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<(R | undefined)[]> {
  if (items.length === 0) return [];

  const results: (R | undefined)[] = new Array(items.length).fill(undefined);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        logError('pool', err);
        results[idx] = undefined;
      }
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, worker));

  return results;
}
