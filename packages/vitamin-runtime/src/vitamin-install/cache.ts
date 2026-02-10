export type InstallCache = {
  getJson: (key: string) => Promise<unknown | undefined>
  setJson: (key: string, value: unknown) => Promise<void>
  getArrayBuffer: (key: string) => Promise<ArrayBuffer | undefined>
  setArrayBuffer: (key: string, value: ArrayBuffer) => Promise<void>
}

export async function createInstallCache(
  kind: 'memory' | 'indexeddb',
  name = 'bun-install-cache',
): Promise<InstallCache> {
  if (kind === 'indexeddb') {
    const cache = await createIndexedDbCache(name)
    if (cache) return cache
  }
  return createMemoryCache()
}

function createMemoryCache(): InstallCache {
  const json = new Map<string, unknown>()
  const buffers = new Map<string, ArrayBuffer>()
  return {
    async getJson(key) {
      return json.get(key)
    },
    async setJson(key, value) {
      json.set(key, value)
    },
    async getArrayBuffer(key) {
      return buffers.get(key)
    },
    async setArrayBuffer(key, value) {
      buffers.set(key, value)
    },
  }
}

async function createIndexedDbCache(name: string): Promise<InstallCache | null> {
  if (!('indexedDB' in globalThis)) return null

  try {
    const db = await openDb(name)
    return {
      async getJson(key) {
        return await getFromStore(db, 'json', key)
      },
      async setJson(key, value) {
        await putToStore(db, 'json', key, value)
      },
      async getArrayBuffer(key) {
        const result = await getFromStore(db, 'arrayBuffer', key)
        return result instanceof ArrayBuffer ? result : undefined
      },
      async setArrayBuffer(key, value) {
        await putToStore(db, 'arrayBuffer', key, value)
      },
    }
  } catch {
    return null
  }
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('json')) db.createObjectStore('json')
      if (!db.objectStoreNames.contains('arrayBuffer')) db.createObjectStore('arrayBuffer')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getFromStore(db: IDBDatabase, storeName: string, key: string): Promise<unknown | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as unknown)
    req.onerror = () => reject(req.error)
  })
}

function putToStore(db: IDBDatabase, storeName: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}