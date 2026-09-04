import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'tweezy.savedFilters';

export interface SavedFilter<T> {
  id: string;
  name: string;
  savedAt: string;
  state: T;
}

function makeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function listSavedFilters<T>(): Promise<SavedFilter<T>[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Storage unavailable (private mode, cleared site data) - an empty list
    // just means "저장된 필터 없음", not a crash.
    return [];
  }
}

export async function saveFilter<T>(name: string, state: T): Promise<SavedFilter<T>[]> {
  const list = await listSavedFilters<T>();
  const next = [...list, { id: makeId(), name, savedAt: new Date().toISOString(), state }];
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort persistence; the caller still gets the in-memory list back.
  }
  return next;
}

export async function deleteSavedFilter<T>(id: string): Promise<SavedFilter<T>[]> {
  const list = await listSavedFilters<T>();
  const next = list.filter((entry) => entry.id !== id);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort; see saveFilter.
  }
  return next;
}
