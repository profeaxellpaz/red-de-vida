// db.js — Capa de datos local (IndexedDB). Todo se guarda dentro del teléfono.
const DB = (() => {
  const NAME = 'red_de_vida';
  const VERSION = 2;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const txU = e.target.transaction;

        if (!db.objectStoreNames.contains('colaboradores')) {
          const s = db.createObjectStore('colaboradores', { keyPath: 'id' });
          s.createIndex('activo', 'activo', { unique: false });
        }
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'clave' });
        }
        if (!db.objectStoreNames.contains('eventos')) {
          const s = db.createObjectStore('eventos', { keyPath: 'id' });
          s.createIndex('fecha', 'fecha', { unique: false });
        }
        // Registros ahora se asocian a un evento. Recreamos para los índices nuevos.
        if (db.objectStoreNames.contains('registros')) {
          db.deleteObjectStore('registros');
        }
        const r = db.createObjectStore('registros', { keyPath: 'id' });
        r.createIndex('eventoId', 'eventoId', { unique: false });
        r.createIndex('colaboradorId', 'colaboradorId', { unique: false });
        r.createIndex('evento_colab', ['eventoId', 'colaboradorId'], { unique: false });
        void txU;
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }
  function reqP(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function put(store, obj) { return reqP((await tx(store, 'readwrite')).put(obj)); }
  async function get(store, key) { return reqP((await tx(store, 'readonly')).get(key)); }
  async function del(store, key) { return reqP((await tx(store, 'readwrite')).delete(key)); }
  async function all(store) { return reqP((await tx(store, 'readonly')).getAll()); }
  async function byIndex(store, index, value) {
    const s = await tx(store, 'readonly');
    return reqP(s.index(index).getAll(value));
  }
  async function byRange(store, index, lower, upper) {
    const s = await tx(store, 'readonly');
    return reqP(s.index(index).getAll(IDBKeyRange.bound(lower, upper)));
  }
  async function clear(store) { return reqP((await tx(store, 'readwrite')).clear()); }

  async function getConfig() {
    const rows = await all('config');
    const cfg = {};
    rows.forEach((r) => (cfg[r.clave] = r.valor));
    return cfg;
  }
  async function setConfig(clave, valor) { return put('config', { clave, valor }); }

  async function exportAll() {
    const [colaboradores, eventos, registros, config] = await Promise.all([
      all('colaboradores'), all('eventos'), all('registros'), all('config')
    ]);
    return { app: 'Red de Vida', version: VERSION, exportado: new Date().toISOString(),
      colaboradores, eventos, registros, config };
  }

  async function importAll(data, { reemplazar = true } = {}) {
    if (!data || data.app !== 'Red de Vida') throw new Error('Archivo de respaldo no válido.');
    if (reemplazar) {
      await Promise.all([clear('colaboradores'), clear('eventos'), clear('registros'), clear('config')]);
    }
    for (const c of data.colaboradores || []) await put('colaboradores', c);
    for (const ev of data.eventos || []) await put('eventos', ev);
    for (const r of data.registros || []) await put('registros', r);
    for (const k of data.config || []) await put('config', k);
  }

  return { open, put, get, del, all, byIndex, byRange, clear, getConfig, setConfig, exportAll, importAll };
})();
