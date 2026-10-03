// On-device persistence.
//
// IndexedDB is the primary store; a localStorage-backed shim keeps the app
// working in private-browsing modes where IndexedDB is unavailable. Nothing
// here ever leaves the device.

const DB_NAME = 'neural-swarm'
const DB_VERSION = 1
const STORES = ['kv', 'chats', 'runs', 'vault', 'flows', 'models']

let dbPromise = null
let memoryFallback = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'))
    req.onblocked = () => reject(new Error('indexedDB blocked'))
  }).catch((err) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

// ------------------------------------------------------ localStorage shim

function memory() {
  if (memoryFallback) return memoryFallback
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(DB_NAME) || '{}')
    } catch {
      return {}
    }
  }
  memoryFallback = {
    async put(store, value) {
      const all = read()
      all[store] = all[store] || {}
      all[store][value.id] = value
      localStorage.setItem(DB_NAME, JSON.stringify(all))
      return value
    },
    async get(store, id) {
      return read()[store]?.[id] ?? null
    },
    async all(store) {
      return Object.values(read()[store] || {})
    },
    async del(store, id) {
      const all = read()
      if (all[store]) delete all[store][id]
      localStorage.setItem(DB_NAME, JSON.stringify(all))
    },
    async clear() {
      localStorage.removeItem(DB_NAME)
    },
  }
  return memoryFallback
}

async function tx(store, mode, fn) {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const t = db.transaction(store, mode)
      const req = fn(t.objectStore(store))
      t.oncomplete = () => resolve(req?.result)
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  } catch {
    return null // signal the caller to fall back
  }
}

// ---------------------------------------------------------------- public API

export const store = {
  async put(storeName, value) {
    const row = { ...value, id: value.id || crypto.randomUUID() }
    const res = await tx(storeName, 'readwrite', (os) => os.put(row))
    if (res === null) await memory().put(storeName, row)
    return row
  },

  async get(storeName, id) {
    const res = await tx(storeName, 'readonly', (os) => os.get(id))
    if (res === null) return memory().get(storeName, id)
    return res ?? null
  },

  async all(storeName) {
    const res = await tx(storeName, 'readonly', (os) => os.getAll())
    if (res === null || res === undefined) return memory().all(storeName)
    return res
  },

  async del(storeName, id) {
    const res = await tx(storeName, 'readwrite', (os) => os.delete(id))
    if (res === null) await memory().del(storeName, id)
  },

  async clearAll() {
    for (const s of STORES) {
      const res = await tx(s, 'readwrite', (os) => os.clear())
      if (res === null) await memory().clear()
    }
  },
}

// ------------------------------------------------------------- domain helpers

export const listChats = () => store.all('chats').then((r) => r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)))
export const saveChat = (chat) => store.put('chats', { ...chat, updatedAt: Date.now() })
export const deleteChat = (id) => store.del('chats', id)

export const listRuns = () => store.all('runs').then((r) => r.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
export const saveRun = (run) => store.put('runs', run)
export const deleteRun = (id) => store.del('runs', id)

export const listVault = () => store.all('vault').then((r) => r.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
export const saveVaultItem = (item) => store.put('vault', item)
export const deleteVaultItem = (id) => store.del('vault', id)

export const listFlows = () => store.all('flows').then((r) => r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)))
export const saveFlow = (flow) => store.put('flows', { ...flow, updatedAt: Date.now() })
export const deleteFlow = (id) => store.del('flows', id)

const SETTINGS_ID = '__settings__'
export const DEFAULT_SETTINGS = {
  id: SETTINGS_ID,
  keys: {},
  baseOverrides: {},
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-5',
  maximized: [],
  maxTokens: 8192,
  maxAgents: 6,
  pin: '',
  haptics: true,
  forge: { personality: '', tone: '', constraints: [] },
}

export async function loadSettings() {
  const saved = await store.get('kv', SETTINGS_ID)
  if (!saved) return { ...DEFAULT_SETTINGS }
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    keys: { ...(saved.keys || {}) },
    forge: { ...DEFAULT_SETTINGS.forge, ...(saved.forge || {}) },
    baseOverrides: { ...(saved.baseOverrides || {}) },
  }
}

export const saveSettings = (settings) => store.put('kv', { ...settings, id: SETTINGS_ID })

export const loadDiscovered = () => store.get('models', 'discovered').then((r) => r?.byProvider || {})
export const saveDiscovered = (byProvider) => store.put('models', { id: 'discovered', byProvider, at: Date.now() })
