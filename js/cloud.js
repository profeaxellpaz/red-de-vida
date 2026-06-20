// cloud.js — Capa de datos en la nube (Supabase). Reemplaza a la base local.
// Expone el MISMO objeto `DB` (mismos métodos) que usaba la versión offline,
// para que app.js no cambie su forma de pedir/guardar datos.
const sb = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

// Si la librería de Supabase no cargó (sin internet en la primera apertura),
// dejamos un cliente "nulo" que avisa con un error claro en vez de fallar mudo.
function sinConexion() {
  return { error: { message: 'No se pudo conectar (revise su internet).' } };
}

// Mapeo entre nombres de campo de la app (camelCase) y columnas SQL (snake_case)
const MAP = {
  eventos: { horaEntrada: 'hora_entrada', horaSalida: 'hora_salida' },
  registros: { eventoId: 'evento_id', colaboradorId: 'colaborador_id', minutosTarde: 'minutos_tarde' }
};
function toDB(store, obj) {
  const m = MAP[store]; const o = {};
  for (const k in obj) o[(m && m[k]) || k] = obj[k];
  return o;
}
function fromDB(store, row) {
  if (!row) return row;
  const m = MAP[store]; if (!m) return { ...row };
  const inv = {}; for (const k in m) inv[m[k]] = k;
  const o = {}; for (const k in row) o[inv[k] || k] = row[k];
  return o;
}

const Auth = {
  async session() { if (!sb) return null; const { data } = await sb.auth.getSession(); return data.session; },
  async login(password) {
    if (!sb) return sinConexion();
    return sb.auth.signInWithPassword({ email: ACCESO_EMAIL, password });
  },
  async logout() { if (!sb) return; return sb.auth.signOut(); },
  onChange(cb) { if (sb) sb.auth.onAuthStateChange((_e, s) => cb(s)); }
};

const DB = (() => {
  async function open() { return true; } // compatibilidad (no hace falta abrir nada)

  async function all(store) {
    const { data, error } = await sb.from(store).select('*');
    if (error) throw error;
    return data.map((r) => fromDB(store, r));
  }
  async function get(store, id) {
    const { data, error } = await sb.from(store).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? fromDB(store, data) : null;
  }
  async function put(store, obj) {
    const { error } = await sb.from(store).upsert(toDB(store, obj));
    if (error) throw error;
    return obj.id;
  }
  async function del(store, id) {
    const { error } = await sb.from(store).delete().eq('id', id);
    if (error) throw error;
  }
  async function byIndex(store, index, value) {
    let q = sb.from(store).select('*');
    if (index === 'eventoId') q = q.eq('evento_id', value);
    else if (index === 'colaboradorId') q = q.eq('colaborador_id', value);
    else if (index === 'evento_colab') q = q.eq('evento_id', value[0]).eq('colaborador_id', value[1]);
    else if (index === 'fecha') q = q.eq('fecha', value);
    else if (index === 'activo') q = q.eq('activo', value);
    const { data, error } = await q;
    if (error) throw error;
    return data.map((r) => fromDB(store, r));
  }
  async function byRange(store, index, lower, upper) {
    const { data, error } = await sb.from(store).select('*').gte(index, lower).lte(index, upper);
    if (error) throw error;
    return data.map((r) => fromDB(store, r));
  }
  async function clear(store) {
    const { error } = await sb.from(store).delete().not('id', 'is', null);
    if (error) throw error;
  }

  async function getConfig() {
    const { data, error } = await sb.from('config').select('*');
    if (error) throw error;
    const c = {}; (data || []).forEach((r) => (c[r.clave] = r.valor));
    return c;
  }
  async function setConfig(clave, valor) {
    const { error } = await sb.from('config').upsert({ clave, valor: String(valor) });
    if (error) throw error;
  }

  async function exportAll() {
    const [colaboradores, eventos, registros, config] = await Promise.all([
      all('colaboradores'), all('eventos'), all('registros'),
      getConfig().then((c) => Object.entries(c).map(([clave, valor]) => ({ clave, valor })))
    ]);
    return { app: 'Red de Vida', version: 'cloud', exportado: new Date().toISOString(),
      colaboradores, eventos, registros, config };
  }
  async function importAll(data, { reemplazar = true } = {}) {
    if (!data || data.app !== 'Red de Vida') throw new Error('Archivo de respaldo no válido.');
    if (reemplazar) {
      // registros primero (dependen de eventos/colaboradores)
      await clear('registros'); await clear('eventos'); await clear('colaboradores');
    }
    for (const c of data.colaboradores || []) await put('colaboradores', c);
    for (const ev of data.eventos || []) await put('eventos', ev);
    for (const r of data.registros || []) await put('registros', r);
    for (const k of data.config || []) await setConfig(k.clave, k.valor);
  }

  return { open, all, get, put, del, byIndex, byRange, clear, getConfig, setConfig, exportAll, importAll };
})();
