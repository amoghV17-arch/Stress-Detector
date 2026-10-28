/**
 * sessionArchive.js — IndexedDB persistence for StressKB sessions.
 * Wraps idb-keyval with in-memory fallback for SSR and Node.js testing.
 */

import { get, set, del, entries, clear } from 'idb-keyval';

// In-memory store for SSR or environments without IndexedDB (e.g. Node unit tests)
const memoryStore = new Map();

const isBrowser = typeof window !== 'undefined' && 'indexedDB' in window;

export async function saveSessionToArchive(session) {
  if (!session) return;
  const meta = session.meta || {};
  const id = meta.session_id || `session_${Date.now()}`;
  const record = {
    id,
    session,
    savedAt: new Date().toISOString(),
    userId: meta.user_id || 'u01',
    mode: meta.mode || 'RUN',
    condition: meta.condition || 'calm',
    durationSeconds: session.task?.elapsed_s || 150,
    totalKeystrokes: session.task?.total_chars || 0,
    validWindows: session.windows ? session.windows.filter(w => w.valid === 1).length : 0,
  };

  if (isBrowser) {
    await set(`stresskb_session_${id}`, record);
  } else {
    memoryStore.set(`stresskb_session_${id}`, record);
  }
  return record;
}

export async function getAllArchivedSessions() {
  if (isBrowser) {
    try {
      const allEntries = await entries();
      return allEntries
        .filter(([key]) => typeof key === 'string' && key.startsWith('stresskb_session_'))
        .map(([, val]) => val)
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    } catch (err) {
      console.warn('Failed to load from IndexedDB, using fallback:', err);
      return Array.from(memoryStore.values()).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    }
  }

  return Array.from(memoryStore.values()).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

export async function deleteArchivedSession(id) {
  const key = id.startsWith('stresskb_session_') ? id : `stresskb_session_${id}`;
  if (isBrowser) {
    await del(key);
  }
  memoryStore.delete(key);
}

export async function clearArchivedSessions() {
  if (isBrowser) {
    try {
      const allEntries = await entries();
      for (const [key] of allEntries) {
        if (typeof key === 'string' && key.startsWith('stresskb_session_')) {
          await del(key);
        }
      }
    } catch (err) {
      console.warn('Failed to clear IndexedDB:', err);
    }
  }
  memoryStore.clear();
}
