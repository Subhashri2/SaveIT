
import { SavedItem } from "../types";

const DB_NAME = 'SaveItDB';
const STORE_NAME = 'items';
const DB_VERSION = 2;

class Database {
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getAllItems(): Promise<SavedItem[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveItem(item: SavedItem): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteItem(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

const db = new Database();

export const backendAPI = {
  items: {
    getAll: async (): Promise<SavedItem[]> => {
      return await db.getAllItems();
    },
    save: async (item: SavedItem): Promise<void> => {
      if (item.sequenceNumber === -1) {
        const all = await db.getAllItems();
        // Robust sequence: max + 1
        const maxSeq = all.reduce((max, i) => Math.max(max, i.sequenceNumber || 0), 0);
        item.sequenceNumber = maxSeq + 1;
      }
      await db.saveItem(item);
    },
    delete: async (id: string): Promise<void> => {
      await db.deleteItem(id);
    },
    updateEnrichment: async (id: string, aiData: any): Promise<void> => {
      const all = await db.getAllItems();
      const item = all.find(i => i.id === id);
      if (item) {
        const updatedItem = {
          ...item,
          title: (item.title === "Instagram Reel" || item.title === "Capturing...") && aiData.suggestedTitle 
            ? aiData.suggestedTitle 
            : item.title,
          tags: Array.from(new Set([...item.tags, ...aiData.tags])),
          topic: aiData.topic,
          summary: aiData.summary,
          engagementScore: aiData.engagementScore || item.engagementScore,
          isEnriching: false
        };
        await db.saveItem(updatedItem);
      }
    }
  }
};
