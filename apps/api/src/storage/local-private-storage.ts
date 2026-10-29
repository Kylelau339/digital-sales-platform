import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { PrivateObject, PrivateStoragePort } from './private-storage.port.js';
import { assertSafeStorageKey } from './safe-storage-key.js';

export class LocalPrivateStorage implements PrivateStoragePort {
  constructor(private readonly root: string) { mkdirSync(resolve(root), { recursive: true }); }
  private path(key: string): string { return resolve(this.root, assertSafeStorageKey(key)); }
  async put(storageKey: string, source: Uint8Array): Promise<PrivateObject> {
    const target = this.path(storageKey); mkdirSync(dirname(target), { recursive: true });
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    await new Promise<void>((resolvePromise, reject) => { const stream = createWriteStream(temp, { flags: 'wx', mode: 0o600 }); stream.on('error', reject).on('finish', resolvePromise); stream.end(source); });
    const sha256 = createHash('sha256').update(source).digest('hex');
    await rename(temp, target);
    return { storageKey, sizeBytes: source.byteLength, sha256, mimeType: 'application/octet-stream' };
  }
  async stat(storageKey: string): Promise<PrivateObject | null> {
    const target = this.path(storageKey); if (!existsSync(target)) return null;
    const info = statSync(target); const hash = createHash('sha256');
    for await (const chunk of createReadStream(target)) hash.update(chunk);
    return { storageKey, sizeBytes: info.size, sha256: hash.digest('hex'), mimeType: 'application/octet-stream' };
  }
  async *read(storageKey: string): AsyncIterable<Uint8Array> {
    const target = this.path(storageKey); assertSafeStorageKey(storageKey);
    const stream = createReadStream(target); for await (const chunk of stream) yield chunk as Uint8Array;
  }
  async readBuffer(storageKey: string): Promise<Buffer> { return readFile(this.path(storageKey)); }
  async remove(storageKey: string): Promise<void> { await rm(this.path(storageKey), { force: true }); }
}
