/**
 * Await a pause without repeating `new Promise(r => setTimeout(r, ms))` everywhere.
 * Usage: await sleep(1200);
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));
