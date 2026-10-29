export interface PrivateObject {
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
}

export interface PrivateStoragePort {
  put(storageKey: string, source: Uint8Array): Promise<PrivateObject>;
  stat(storageKey: string): Promise<PrivateObject | null>;
  read(storageKey: string): AsyncIterable<Uint8Array>;
}
