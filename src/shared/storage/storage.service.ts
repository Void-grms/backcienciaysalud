export interface SaveOptions {
  contentType: string;
  /**
   * Carpeta logica donde almacenar el archivo (ej. "signatures", "logos").
   * Las implementaciones la usan como prefijo del storage key.
   */
  folder: string;
  /**
   * Nombre original opcional (solo informativo).
   */
  originalName?: string;
}

export interface StoredObject {
  buffer: Buffer;
  contentType: string;
  size: number;
}

// Interfaz portable entre `local` y `s3`. El backend solo depende de esto.
export abstract class StorageService {
  abstract save(buffer: Buffer, options: SaveOptions): Promise<string>;
  abstract get(key: string): Promise<StoredObject>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
}
