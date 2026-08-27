// IndexedDB persistence helper for storing audio/video clone voice profiles (audio base64, preview, refText, metadata)

export interface SavedVoiceProfile {
  id: string;
  name: string;
  createdAt: number;
  fileName: string;
  fileSizeFormatted: string;
  duration: number;
  isVideo: boolean;
  base64: string;
  refText: string;
  tags?: string[];
}

const DB_NAME = 'VoiceCloneDB';
const DB_VERSION = 1;
const STORE_NAME = 'voice_profiles';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB không được hỗ trợ trên trình duyệt này'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getAllSavedVoices(): Promise<SavedVoiceProfile[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const list = (req.result || []) as SavedVoiceProfile[];
        // Sắp xếp mới nhất lên đầu
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(list);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Lỗi đọc danh sách giọng đã lưu từ IndexedDB:', err);
    return [];
  }
}

export async function saveVoiceProfile(profile: SavedVoiceProfile): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(profile);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVoiceProfile(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
