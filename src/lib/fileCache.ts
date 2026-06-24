// Simple, robust IndexedDB wrapper to store and cache file content (base64 dataUrl) locally for offline use.
// This allows files to be previewed, downloaded, and shared 100% offline.

const DB_NAME = 'secure-doc-vault-files';
const DB_VERSION = 1;
const STORE_NAME = 'file-data-cache';

let dbInstance: IDBDatabase | null = null;

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'fileId' });
      }
    };

    request.onsuccess = (event: any) => {
      dbInstance = event.target.result;
      resolve(dbInstance!);
    };

    request.onerror = (event: any) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
};

export const fileCache = {
  /**
   * Save a file's base64 data to the local offline cache.
   */
  async save(fileId: string, dataUrl: string): Promise<void> {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ fileId, dataUrl, cachedAt: Date.now() });

        request.onsuccess = () => resolve();
        request.onerror = (event: any) => reject(event.target.error);
      });
    } catch (err) {
      console.error('Failed to save file to IndexedDB:', err);
    }
  },

  /**
   * Get a file's base64 data from the local offline cache.
   */
  async get(fileId: string): Promise<string | null> {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(fileId);

        request.onsuccess = (event: any) => {
          const result = event.target.result;
          resolve(result ? result.dataUrl : null);
        };
        request.onerror = (event: any) => reject(event.target.error);
      });
    } catch (err) {
      console.error('Failed to get file from IndexedDB:', err);
      return null;
    }
  },

  /**
   * Delete a file from the local offline cache.
   */
  async delete(fileId: string): Promise<void> {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(fileId);

        request.onsuccess = () => resolve();
        request.onerror = (event: any) => reject(event.target.error);
      });
    } catch (err) {
      console.error('Failed to delete file from IndexedDB:', err);
    }
  },

  /**
   * Clear all cached files.
   */
  async clear(): Promise<void> {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = (event: any) => reject(event.target.error);
      });
    } catch (err) {
      console.error('Failed to clear IndexedDB cache:', err);
    }
  }
};
