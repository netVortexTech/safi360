import { openDB, type IDBPDatabase } from 'idb';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

export type PhotoPhase = 'before' | 'after';

export interface QueuedPhoto {
  id: string;
  bookingId: string;
  staffId: string;
  tenantId: string;
  phase: PhotoPhase;
  blob: Blob;
  fileName: string;
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  progress: number;
  attempts: number;
  remotePath: string | null;
  error: string | null;
  createdAt: string;
}

const DB_NAME = 'safi360-field';
const STORE = 'photos';

interface FieldPhotoDB {
  photos: {
    key: string;
    value: QueuedPhoto;
    indexes: { booking: string; phase: string };
  };
}

async function dbPromise(): Promise<IDBPDatabase<FieldPhotoDB>> {
  const db = await openDB<FieldPhotoDB>(DB_NAME, 1, {
    upgrade(dbInner) {
      if (!dbInner.objectStoreNames.contains(STORE)) {
        const store = dbInner.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('booking', 'bookingId');
        store.createIndex('phase', 'phase', { unique: false });
      }
    },
  });
  return db;
}

export async function queuePhoto(photo: QueuedPhoto): Promise<void> {
  const db = await dbPromise();
  await db.put(STORE, photo);
}

export async function removePhoto(id: string): Promise<void> {
  const db = await dbPromise();
  await db.delete(STORE, id);
}

export async function listPhotos(bookingId?: string, phase?: PhotoPhase): Promise<QueuedPhoto[]> {
  const db = await dbPromise();
  const all = await db.getAll(STORE);
  return all.filter((item) => {
    if (bookingId && item.bookingId !== bookingId) return false;
    if (phase && item.phase !== phase) return false;
    return true;
  });
}

export async function updatePhoto(id: string, patch: Partial<QueuedPhoto>): Promise<QueuedPhoto | null> {
  const db = await dbPromise();
  const current = await db.get(STORE, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await db.put(STORE, next);
  return next;
}
