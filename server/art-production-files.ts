import { rename } from 'node:fs/promises';

export async function retryArtFileOperation<T>(operation: () => Promise<T>,
  delay: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= 9 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await delay(Math.min(1000, 50 * 2 ** attempt));
    }
  }
}

/** Windows readers and antivirus can briefly hold an atomic-replacement target. */
export async function replaceArtFile(source: string, target: string,
  move: typeof rename = rename,
  delay: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
): Promise<void> {
  await retryArtFileOperation(() => move(source, target), delay);
}
