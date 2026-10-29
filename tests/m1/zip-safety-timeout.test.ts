import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ terminated: false, tempDir: '' }));
vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    constructor(_url: URL, options: { workerData: { tempDir: string } }) { super(); state.tempDir = options.workerData.tempDir; }
    async terminate() {
      expect(await readdir(state.tempDir)).toEqual([]);
      state.terminated = true;
      return 0;
    }
  }
}));
import { scanArchiveFile } from '../../apps/api/src/scanning/scanner.js';

afterEach(() => vi.useRealTimers());
it('terminates a timed-out worker before removing its temporary directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zip-timeout-'));
  try {
    vi.useFakeTimers();
    const promise = scanArchiveFile({ archivePath: join(root, 'unused.zip'), filename: 'unused.zip', id: 'id', versionId: 'version', createdAt: 'now', tempRoot: root });
    await vi.waitFor(() => expect(state.tempDir).not.toBe(''));
    await vi.advanceTimersByTimeAsync(5000);
    expect((await promise).status).toBe('timed_out');
    expect(state.terminated).toBe(true);
    expect(await readdir(root)).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
