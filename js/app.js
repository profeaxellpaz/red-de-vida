// app.js — Lógica de Red de Vida (Asistencia por eventos). Funciona sin internet.
(() => {
  'use strict';

  // ---------- Utilidades ----------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));
  const pad = (n) => String(n).padStart(2, '0');

  const hoyISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const horaActual = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtFechaLarga = (d = new Date()) =>
    d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtFechaISO = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CR',
      { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmt12h = (hhmm) => {
    if (!hhmm) return '';
    let [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return `${h}:${pad(m)} ${ap}`;
  };
  const iniciales = (nombre) =>
    nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), 2200);
  }

  // ---------- Modal ----------
  const Modal = {
    open(html) {
      const m = $('#modal');
      m.innerHTML = `<div class="sheet"><button class="close" aria-label="Cerrar">&times;</button>${html}</div>`;
      m.hidden = false;
      $('.close', m).onclick = () => Modal.close();
      m.onclick = (e) => { if (e.target === m) Modal.close(); };
      return m;
    },
    close() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
  };

  // ---------- Config ----------
  const Cfg = {
    data: { empresa: 'Red de Vida' },
    async load() {
      const c = await DB.getConfig();
      this.data.empresa = c.empresa || this.data.empresa;
      $('#empresaNombre').textContent = this.data.empresa;
    },
    async save(patch) {
      Object.assign(this.data, patch);
      await Promise.all(Object.entries(patch).map(([k, v]) => DB.setConfig(k, v)));
      $('#empresaNombre').textContent = this.data.empresa;
    }
  };

  function tickReloj() {
    $('#relojFecha').textContent = `${fmtFechaLarga()} · ${horaActual()}`;
  }

  async function regDe(eventoId, colaboradorId) {
    const r = await DB.byIndex('registros', 'evento_colab', [eventoId, colaboradorId]);
    return r[0] || null;
  }

  // ================= VISTAS =================
  const Vistas = {};

  // ---------- INICIO ----------
  Vistas.inicio = async () => {
    const colabs = (await DB.all('colaboradores')).filter((c) => c.activo);
    const eventos = (await DB.all('eventos')).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const hoy = hoyISO();
    const proximos = eventos.filter((e) => e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const prox = proximos[0];

    let proxCard = '';
    if (prox) {
      proxCard = `
        <div class="card" data-pasar="${prox.id}" style="cursor:pointer">
          <small class="muted">Próximo evento</small>
          <div class="flex-between mt">
            <div><b style="font-size:1.05rem">${esc(prox.nombre)}</b>
            <div class="muted">${fmtFechaISO(prox.fecha)} · ${fmt12h(prox.horaEntrada)} – ${fmt12h(prox.horaSalida)}</div></div>
            <span class="btn sm">Pasar lista →</span>
          </div>
        </div>`;
    }

    return `
      <h2 class="section-title">Resumen</h2>
      <div class="grid2">
        <div class="card stat brand"><div class="num">${colabs.length}</div><div class="lbl">Colaboradores activos</div></div>
        <div class="card stat ok"><div class="num">${eventos.length}</div><div class="lbl">Eventos creados</div></div>
      </div>
      ${proxCard}
      <button class="btn block mt" data-goto="eventos">📅 Ver eventos</button>
      ${colabs.length === 0
        ? `<div class="empty mt"><div class="big">👥</div><p>Aún no hay colaboradores.</p>
           <button class="btn" data-goto="colaboradores">Agregar colaboradores</button></div>`
        : (eventos.length === 0
          ? `<div class="empty mt"><div class="big">📅</div><p>Crea tu primer evento para pasar lista.</p>
             <button class="btn" data-goto="eventos">Crear evento</button></div>` : '')}
    `;
  };

  // ---------- EVENTOS ----------
  Vistas.eventos = async () => {
    const eventos = (await DB.all('eventos')).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.horaEntrada.localeCompare(a.horaEntrada));
    const items = await Promise.all(eventos.map(async (e) => {
      const regs = await DB.byIndex('registros', 'eventoId', e.id);
      const marcados = regs.length;
      return `<div class="item">
        <div class="avatar">📅</div>
        <div class="info">
          <b>${esc(e.nombre)}</b>
          <small>${fmtFechaISO(e.fecha)} · ${fmt12h(e.horaEntrada)}–${fmt12h(e.horaSalida)} · ${marcados} marcados</small>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn sm" data-pasar="${e.id}">Pasar lista</button>
          <button class="btn sm ghost" data-editar-evento="${e.id}">Editar</button>
        </div>
      </div>`;
    }));

    return `
      <div class="flex-between">
        <h2 class="section-title">Eventos</h2>
        <button class="btn sm" data-nuevo-evento>＋ Nuevo</button>
      </div>
      ${eventos.length ? `<div class="list">${items.join('')}</div>`
        : `<div class="empty"><div class="big">📅</div><p>Sin eventos.<br>Crea el primero (Escuela de Formación, Celebración, etc.).</p>
           <button class="btn" data-nuevo-evento>＋ Crear evento</button></div>`}
    `;
  };

  // ---------- PASAR LISTA (sub-vista de un evento) ----------
  async function renderPasarLista(eventoId) {
    vistaActual = 'eventos';
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.vista === 'eventos'));
    const main = $('#vista');
    const ev = await DB.get('eventos', eventoId);
    if (!ev) { render('eventos'); return; }
    const colabs = (await DB.all('colaboradores')).filter((c) => c.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    const regs = await DB.byIndex('registros', 'eventoId', eventoId);
    const mapa = Object.fromEntries(regs.map((r) => [r.colaboradorId, r]));

    let presentes = 0, tardes = 0, ausentes = 0;
    const items = colabs.map((c) => {
      const r = mapa[c.id];
      let estado = '<span class="chip gray">Sin marcar</span>';
      let accion = `<button class="btn sm ok" data-presente="${c.id}">Presente</button>
        <button class="btn sm warn" data-tarde="${c.id}">Tardía</button>
        <button class="btn sm bad" data-ausente="${c.id}">Ausente</button>`;
      if (r && r.ausente) {
        ausentes++;
        const chip = r.justificada ? '<span class="chip gray">Ausente justif.</span>' : '<span class="chip bad">Ausente injustif.</span>';
        estado = `${chip}${r.motivo ? ` <small class="muted">· ${esc(r.motivo)}</small>` : ''}`;
        accion = '';
      } else if (r && r.tarde) {
        tardes++;
        estado = '<span class="chip warn">Tardía</span>';
        accion = '';
      } else if (r) {
        presentes++;
        estado = '<span class="chip ok">Presente</span>';
        accion = '';
      }
      return `<div class="item item-marcaje">
        <div class="avatar">${iniciales(c.nombre)}</div>
        <div class="info"><b>${esc(c.nombre)}</b><br><small>${estado}</small></div>
        <div class="acciones-marcaje">
          ${accion}
          <button class="btn sm ghost" data-editar-reg="${c.id}" title="Editar">✎</button>
        </div>
      </div>`;
    });

    main.innerHTML = `
      <button class="btn sm ghost" data-volver style="margin-bottom:10px">← Eventos</button>
      <div class="card">
        <b style="font-size:1.1rem">${esc(ev.nombre)}</b>
        <div class="muted">${fmtFechaISO(ev.fecha)}</div>
        ${ev.notas ? `<div class="muted mt">📝 ${esc(ev.notas)}</div>` : ''}
      </div>
      <div class="grid3">
        <div class="card stat ok"><div class="num">${presentes}</div><div class="lbl">Presentes</div></div>
        <div class="card stat warn"><div class="num">${tardes}</div><div class="lbl">Tardías</div></div>
        <div class="card stat bad"><div class="num">${ausentes}</div><div class="lbl">Ausentes</div></div>
      </div>
      ${colabs.length ? `<div class="list">${items.join('')}</div>`
        : `<div class="empty"><div class="big">👥</div><p>No hay colaboradores activos.</p>
           <button class="btn" data-goto="colaboradores">Agregar colaboradores</button></div>`}
    `;

    // eventos
    $('[data-volver]', main).onclick = () => render('eventos');
    $$('[data-goto]', main).forEach((b) => (b.onclick = () => render(b.dataset.goto)));
    $$('[data-presente]', main).forEach((b) => (b.onclick = async () => { await marcarPresente(ev, b.dataset.presente); renderPasarLista(eventoId); }));
    $$('[data-tarde]', main).forEach((b) => (b.onclick = async () => { await marcarTarde(ev, b.dataset.tarde); renderPasarLista(eventoId); }));
    $$('[data-ausente]', main).forEach((b) => (b.onclick = () => editarRegistro(ev, b.dataset.ausente, true)));
    $$('[data-editar-reg]', main).forEach((b) => (b.onclick = () => editarRegistro(ev, b.dataset.editarReg)));
  }

  // ---------- COLABORADORES ----------
  Vistas.colaboradores = async () => {
    const colabs = (await DB.all('colaboradores')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const items = colabs.map((c) => `
      <div class="item">
        <div class="avatar" style="${c.activo ? '' : 'background:#94a3b8'}">${iniciales(c.nombre)}</div>
        <div class="info">
          <b>${esc(c.nombre)} ${c.activo ? '' : '<span class="chip gray">Inactivo</span>'}</b>
          <small>${esc(c.puesto || 'Sin puesto')}${c.cedula ? ' · ' + esc(c.cedula) : ''}</small>
        </div>
        <button class="btn sm ghost" data-editar-colab="${c.id}">Editar</button>
      </div>`).join('');

    return `
      <div class="flex-between">
        <h2 class="section-title">Equipo</h2>
        <button class="btn sm" data-nuevo-colab>＋ Nuevo</button>
      </div>
      ${colabs.length ? `<div class="list">${items}</div>`
        : `<div class="empty"><div class="big">👥</div><p>Sin colaboradores.<br>Agrega el primero.</p>
           <button class="btn" data-nuevo-colab>＋ Agregar colaborador</button></div>`}
    `;
  };

  // ---------- REPORTES ----------
  Vistas.reportes = async () => {
    const colabs = (await DB.all('colaboradores')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const [ini, fin] = rangoMes();
    const optColab = colabs.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');

    return `
      <h2 class="section-title">Reportes</h2>
      <div class="card">
        <label>Periodo rápido</label>
        <div class="row">
          <button class="btn ghost sm" data-periodo="semana">Semana</button>
          <button class="btn sm" data-periodo="mes">Mes</button>
          <button class="btn ghost sm" data-periodo="cuatri">Cuatrimestre</button>
        </div>
        <div class="row mt">
          <div><label>Desde</label><input type="date" id="repIni" value="${ini}"></div>
          <div><label>Hasta</label><input type="date" id="repFin" value="${fin}"></div>
        </div>
        <label>Tipo de informe</label>
        <select id="repTipo">
          <option value="colaborador">Resumen por colaborador</option>
          <option value="totales">Totales generales</option>
          <option value="evento">Resumen por evento</option>
          <option value="detalle">Detalle completo</option>
        </select>
        <label>Colaborador (opcional)</label>
        <select id="repColab"><option value="">Todos</option>${optColab}</select>
        <div class="row mt">
          <button class="btn" id="repGenerar">📊 Generar</button>
        </div>
        <div class="row mt">
          <button class="btn ok sm" id="repWA">📋 Copiar WhatsApp</button>
          <button class="btn warn sm" id="repPDF">🖨️ PDF</button>
          <button class="btn ghost sm" id="repCSV">⬇ CSV</button>
        </div>
      </div>
      <div id="repResultado"></div>
    `;
  };

  // ---------- AJUSTES ----------
  Vistas.ajustes = async () => {
    const c = Cfg.data;
    return `
      <h2 class="section-title">Ajustes</h2>
      <div class="card">
        <label>Nombre de la empresa</label>
        <input id="setEmpresa" value="${esc(c.empresa)}">
        <button class="btn block mt" id="setGuardar">Guardar ajustes</button>
      </div>
      <div class="card">
        <h3 style="margin:0 0 6px">Respaldo de datos</h3>
        <p class="muted" style="margin:0 0 12px">Tus datos viven solo en este dispositivo. Haz respaldos periódicos.</p>
        <button class="btn block" id="setExport">⬇ Descargar respaldo (.json)</button>
        <button class="btn block ghost mt" id="setImport">⬆ Restaurar desde respaldo</button>
        <input type="file" id="fileImport" accept="application/json" hidden>
      </div>
      <div class="card">
        <h3 style="margin:0 0 6px;color:var(--bad)">Zona peligrosa</h3>
        <button class="btn block bad" id="setBorrar">Borrar TODOS los datos</button>
      </div>
      <p class="muted" style="text-align:center;font-size:.75rem">Red de Vida · funciona sin internet</p>
    `;
  };

  // ================= RENDER =================
  let vistaActual = 'inicio';
  async function render(vista) {
    vistaActual = vista;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.vista === vista));
    const main = $('#vista');
    main.innerHTML = '<div class="empty"><div class="big">⏳</div></div>';
    main.innerHTML = await Vistas[vista]();
    enlazar(vista);
  }

  // ================= ACCIONES =================
  async function marcarPresente(evento, colaboradorId) {
    let reg = await regDe(evento.id, colaboradorId);
    reg = reg || { id: uid(), eventoId: evento.id, colaboradorId };
    reg.ausente = false; reg.tarde = false; reg.justificada = false; reg.motivo = '';
    await DB.put('registros', reg);
    toast('Marcado presente');
  }

  async function marcarTarde(evento, colaboradorId) {
    let reg = await regDe(evento.id, colaboradorId);
    reg = reg || { id: uid(), eventoId: evento.id, colaboradorId };
    reg.ausente = false; reg.tarde = true; reg.justificada = false; reg.motivo = '';
    await DB.put('registros', reg);
    toast('Marcado tardía');
  }

  // Corregir un marcaje (presente / tardía / ausente)
  async function editarRegistro(evento, colaboradorId, comoAusente = false) {
    const colab = await DB.get('colaboradores', colaboradorId);
    const reg = (await regDe(evento.id, colaboradorId)) || { id: uid(), eventoId: evento.id, colaboradorId };
    const estadoActual = comoAusente ? 'ausente' : (reg.ausente ? 'ausente' : (reg.tarde ? 'tarde' : 'presente'));
    Modal.open(`
      <h3>Editar marcaje</h3>
      <p class="muted" style="margin-top:-6px">${esc(colab.nombre)} · ${esc(evento.nombre)}</p>
      <label>Estado</label>
      <select id="edEstado">
        <option value="presente" ${estadoActual === 'presente' ? 'selected' : ''}>Presente</option>
        <option value="tarde" ${estadoActual === 'tarde' ? 'selected' : ''}>Tardía</option>
        <option value="ausente" ${estadoActual === 'ausente' ? 'selected' : ''}>Ausente</option>
      </select>
      <div id="edAus">
        <label>Tipo de ausencia</label>
        <select id="edTipoAus">
          <option value="injustificada" ${!reg.justificada ? 'selected' : ''}>Injustificada</option>
          <option value="justificada" ${reg.justificada ? 'selected' : ''}>Justificada</option>
        </select>
        <label>Motivo (opcional)</label>
        <input id="edMotivo" value="${esc(reg.motivo || '')}" placeholder="Ej: cita médica, permiso...">
      </div>
      <button class="btn block mt" id="edGuardar">Guardar</button>
    `);
    const tog = () => { $('#edAus').style.display = $('#edEstado').value === 'ausente' ? 'block' : 'none'; };
    $('#edEstado').onchange = tog; tog();
    $('#edGuardar').onclick = async () => {
      const estado = $('#edEstado').value;
      reg.ausente = estado === 'ausente';
      reg.tarde = estado === 'tarde';
      reg.justificada = estado === 'ausente' && $('#edTipoAus').value === 'justificada';
      reg.motivo = estado === 'ausente' ? $('#edMotivo').value.trim() : '';
      await DB.put('registros', reg);
      Modal.close(); toast('Marcaje actualizado'); renderPasarLista(evento.id);
    };
  }

  // Formulario de evento (nuevo / editar)
  async function formEvento(id) {
    const e = id ? await DB.get('eventos', id) : { fecha: hoyISO(), horaEntrada: '19:00', horaSalida: '21:00' };
    Modal.open(`
      <h3>${id ? 'Editar' : 'Nuevo'} evento</h3>
      <label>Nombre del evento *</label>
      <input id="eNombre" value="${esc(e.nombre || '')}" placeholder="Ej: Escuela de Formación">
      <label>Fecha *</label>
      <input type="date" id="eFecha" value="${e.fecha || hoyISO()}">
      <div class="row">
        <div><label>Entrada</label><input type="time" id="eEnt" value="${e.horaEntrada || '19:00'}"></div>
        <div><label>Salida</label><input type="time" id="eSal" value="${e.horaSalida || '21:00'}"></div>
      </div>
      <label>Notas (opcional)</label>
      <input id="eNotas" value="${esc(e.notas || '')}" placeholder="Ej: en el salón principal">
      <button class="btn block mt" id="eGuardar">Guardar evento</button>
      ${id ? `<button class="btn block bad mt" id="eEliminar">Eliminar evento</button>` : ''}
    `);

    $('#eGuardar').onclick = async () => {
      const nombre = $('#eNombre').value.trim();
      const fecha = $('#eFecha').value;
      if (!nombre) { toast('El nombre es obligatorio.'); return; }
      if (!fecha) { toast('La fecha es obligatoria.'); return; }
      const obj = {
        id: id || uid(), nombre, fecha,
        horaEntrada: $('#eEnt').value || '00:00',
        horaSalida: $('#eSal').value || '00:00',
        notas: $('#eNotas').value.trim()
      };
      await DB.put('eventos', obj);
      Modal.close(); toast('Evento guardado'); render('eventos');
    };
    const elim = $('#eEliminar');
    if (elim) elim.onclick = async () => {
      if (!confirm(`¿Eliminar "${e.nombre}" y todos sus registros de asistencia? No se puede deshacer.`)) return;
      const regs = await DB.byIndex('registros', 'eventoId', id);
      for (const r of regs) await DB.del('registros', r.id);
      await DB.del('eventos', id);
      Modal.close(); toast('Evento eliminado'); render('eventos');
    };
  }

  // Formulario de colaborador
  async function formColaborador(id) {
    const c = id ? await DB.get('colaboradores', id) : { activo: true };
    Modal.open(`
      <h3>${id ? 'Editar' : 'Nuevo'} colaborador</h3>
      <label>Nombre completo *</label>
      <input id="fNombre" value="${esc(c.nombre || '')}" placeholder="Ej: María Rodríguez">
      <div class="row">
        <div><label>Cédula</label><input id="fCedula" value="${esc(c.cedula || '')}"></div>
        <div><label>Puesto / Rol</label><input id="fPuesto" value="${esc(c.puesto || '')}"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:14px">
        <input type="checkbox" id="fActivo" style="width:auto" ${c.activo ? 'checked' : ''}> Activo
      </label>
      <button class="btn block mt" id="fGuardar">Guardar</button>
      ${id ? `<button class="btn block bad mt" id="fEliminar">Eliminar colaborador</button>` : ''}
    `);
    $('#fGuardar').onclick = async () => {
      const nombre = $('#fNombre').value.trim();
      if (!nombre) { toast('El nombre es obligatorio.'); return; }
      const obj = {
        id: id || uid(), nombre,
        cedula: $('#fCedula').value.trim(),
        puesto: $('#fPuesto').value.trim(),
        activo: $('#fActivo').checked
      };
      await DB.put('colaboradores', obj);
      Modal.close(); toast('Colaborador guardado'); render('colaboradores');
    };
    const elim = $('#fEliminar');
    if (elim) elim.onclick = async () => {
      if (!confirm(`¿Eliminar a ${c.nombre} y todos sus registros? No se puede deshacer.`)) return;
      const regs = await DB.byIndex('registros', 'colaboradorId', id);
      for (const r of regs) await DB.del('registros', r.id);
      await DB.del('colaboradores', id);
      Modal.close(); toast('Colaborador eliminado'); render('colaboradores');
    };
  }

  // ---------- Reportes ----------
  // ---------- Periodos rápidos ----------
  function rangoSemana() {
    const d = new Date(); const lun = (d.getDay() + 6) % 7;
    const ini = new Date(d); ini.setDate(d.getDate() - lun);
    const fin = new Date(ini); fin.setDate(ini.getDate() + 6);
    return [hoyISO(ini), hoyISO(fin)];
  }
  function rangoMes() {
    const d = new Date();
    return [hoyISO(new Date(d.getFullYear(), d.getMonth(), 1)), hoyISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }
  function rangoCuatri() {
    const d = new Date();
    return [hoyISO(new Date(d.getFullYear(), d.getMonth() - 3, 1)), hoyISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }

  async function reunirReporte() {
    const ini = $('#repIni').value, fin = $('#repFin').value;
    const colabId = $('#repColab') ? $('#repColab').value : '';
    if (!ini || !fin) { toast('Elija el rango de fechas.'); return null; }
    if (ini > fin) { toast('La fecha "Desde" es posterior a "Hasta".'); return null; }
    let eventos = (await DB.all('eventos')).filter((e) => e.fecha >= ini && e.fecha <= fin);
    const colabs = await DB.all('colaboradores');
    const mapaC = Object.fromEntries(colabs.map((c) => [c.id, c]));
    let filas = [];
    for (const ev of eventos) {
      const regs = await DB.byIndex('registros', 'eventoId', ev.id);
      regs.forEach((r) => filas.push({ ...r, evento: ev }));
    }
    if (colabId) filas = filas.filter((r) => r.colaboradorId === colabId);
    filas.sort((a, b) => (a.evento.fecha + (mapaC[a.colaboradorId]?.nombre || ''))
      .localeCompare(b.evento.fecha + (mapaC[b.colaboradorId]?.nombre || '')));
    return { filas, mapaC, ini, fin, nEventos: eventos.length };
  }

  // ---------- Agregaciones ----------
  function aggColaborador(filas, mapaC) {
    const m = {};
    filas.forEach((r) => {
      const id = r.colaboradorId;
      const o = m[id] || (m[id] = { nombre: mapaC[id]?.nombre || '?', pres: 0, tard: 0, ausJ: 0, ausI: 0 });
      if (r.ausente) { r.justificada ? o.ausJ++ : o.ausI++; }
      else if (r.tarde) { o.tard++; }
      else { o.pres++; }
    });
    return Object.values(m).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  function aggTotales(filas, nEventos) {
    const t = { eventos: nEventos, pres: 0, tard: 0, ausJ: 0, ausI: 0 };
    filas.forEach((r) => {
      if (r.ausente) { r.justificada ? t.ausJ++ : t.ausI++; }
      else if (r.tarde) { t.tard++; }
      else { t.pres++; }
    });
    return t;
  }
  function aggEvento(filas) {
    const m = {};
    filas.forEach((r) => {
      const ev = r.evento;
      const o = m[ev.id] || (m[ev.id] = { nombre: ev.nombre, fecha: ev.fecha, pres: 0, tard: 0, ausJ: 0, ausI: 0 });
      if (r.ausente) { r.justificada ? o.ausJ++ : o.ausI++; }
      else if (r.tarde) { o.tard++; }
      else { o.pres++; }
    });
    return Object.values(m).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // ---------- Construcción del informe (pantalla + WhatsApp + PDF) ----------
  function construirInforme(data, tipo) {
    const { filas, mapaC, ini, fin, nEventos } = data;
    const periodo = `${fmtFechaISO(ini)} al ${fmtFechaISO(fin)}`;
    const empresa = Cfg.data.empresa || 'Red de Vida';
    let titulo, html, texto;

    if (tipo === 'totales') {
      const t = aggTotales(filas, nEventos);
      titulo = 'Totales generales';
      html = `
        <div class="grid2">
          <div class="card stat brand"><div class="num">${t.eventos}</div><div class="lbl">Eventos</div></div>
          <div class="card stat ok"><div class="num">${t.pres}</div><div class="lbl">Presentes</div></div>
          <div class="card stat warn"><div class="num">${t.tard}</div><div class="lbl">Tardías</div></div>
          <div class="card stat gray"><div class="num">${t.ausJ}</div><div class="lbl">Aus. justificadas</div></div>
          <div class="card stat bad"><div class="num">${t.ausI}</div><div class="lbl">Aus. injustificadas</div></div>
        </div>`;
      texto = `*${empresa} — Totales*\n📅 ${periodo}\n\n`
        + `🗓️ Eventos: ${t.eventos}\n✅ Presentes: ${t.pres}\n⏰ Tardías: ${t.tard}\n`
        + `🟡 Aus. justificadas: ${t.ausJ}\n🔴 Aus. injustificadas: ${t.ausI}`;
    } else if (tipo === 'colaborador') {
      const rows = aggColaborador(filas, mapaC);
      titulo = 'Resumen por colaborador';
      html = `<div class="card" style="overflow:auto"><table>
        <thead><tr><th>Colaborador</th><th>Pres.</th><th>Tard.</th><th>Aus.J</th><th>Aus.I</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(r.nombre)}</td><td>${r.pres}</td><td>${r.tard}</td><td>${r.ausJ}</td><td>${r.ausI}</td></tr>`).join('')}</tbody>
        </table></div>`;
      texto = `*${empresa} — Por colaborador*\n📅 ${periodo}\n\n`
        + rows.map((r) => `*${r.nombre}*\n  ✅ ${r.pres} pres · ⏰ ${r.tard} tard · 🟡 ${r.ausJ} just · 🔴 ${r.ausI} injust`).join('\n\n');
    } else if (tipo === 'evento') {
      const rows = aggEvento(filas);
      titulo = 'Resumen por evento';
      html = `<div class="card" style="overflow:auto"><table>
        <thead><tr><th>Fecha</th><th>Evento</th><th>Pres.</th><th>Tard.</th><th>Aus.J</th><th>Aus.I</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(fmtFechaISO(r.fecha))}</td><td>${esc(r.nombre)}</td><td>${r.pres}</td><td>${r.tard}</td><td>${r.ausJ}</td><td>${r.ausI}</td></tr>`).join('')}</tbody>
        </table></div>`;
      texto = `*${empresa} — Por evento*\n📅 ${periodo}\n\n`
        + rows.map((r) => `*${r.nombre}* (${fmtFechaISO(r.fecha)})\n  ✅ ${r.pres} · ⏰ ${r.tard} · 🟡 ${r.ausJ} · 🔴 ${r.ausI}`).join('\n\n');
    } else { // detalle
      titulo = 'Detalle completo';
      const cuerpo = filas.map((r) => {
        const c = mapaC[r.colaboradorId];
        const est = r.ausente ? (r.justificada ? 'Aus. justif.' : 'Aus. injustif.') : (r.tarde ? 'Tardía' : 'Presente');
        return `<tr><td>${esc(fmtFechaISO(r.evento.fecha))}</td><td>${esc(r.evento.nombre)}</td><td>${esc(c?.nombre || '?')}</td><td>${esc(est)}</td></tr>`;
      }).join('');
      html = `<div class="card" style="overflow:auto"><table>
        <thead><tr><th>Fecha</th><th>Evento</th><th>Colaborador</th><th>Estado</th></tr></thead>
        <tbody>${cuerpo}</tbody></table></div>`;
      texto = `*${empresa} — Detalle*\n📅 ${periodo}\n\n`
        + filas.map((r) => {
          const c = mapaC[r.colaboradorId];
          const est = r.ausente ? (r.justificada ? 'aus.just' : 'aus.injust') : (r.tarde ? 'tardía' : 'presente');
          return `${fmtFechaISO(r.evento.fecha)} · ${r.evento.nombre} · ${c?.nombre || '?'}: ${est}`;
        }).join('\n');
    }
    return { titulo, html, texto, periodo, empresa };
  }

  async function pintarReporte() {
    const data = await reunirReporte();
    if (!data) return;
    const cont = $('#repResultado');
    if (!data.filas.length) { cont.innerHTML = `<div class="empty"><div class="big">📭</div><p>Sin registros en ese rango.</p></div>`; return; }
    const inf = construirInforme(data, $('#repTipo').value);
    cont.innerHTML = `<p class="muted" style="margin:4px 2px">${esc(inf.titulo)} · ${esc(inf.periodo)}</p>${inf.html}`;
  }

  async function copiarWhatsapp() {
    const data = await reunirReporte();
    if (!data) return;
    if (!data.filas.length) { toast('Sin datos para el periodo.'); return; }
    const { texto } = construirInforme(data, $('#repTipo').value);
    let ok = false;
    try { await navigator.clipboard.writeText(texto); ok = true; } catch (e) { ok = false; }
    Modal.open(`
      <h3>Informe para WhatsApp</h3>
      <p class="muted" style="margin-top:-6px">${ok ? '✅ Ya quedó copiado. ' : ''}Puedes copiarlo y pegarlo en el chat.</p>
      <textarea id="waText" rows="12" style="width:100%;font-size:.9rem;border:1px solid var(--line);border-radius:10px;padding:10px">${esc(texto)}</textarea>
      <button class="btn block mt" id="waCopiar">📋 Copiar</button>
    `);
    $('#waCopiar').onclick = async () => {
      const ta = $('#waText'); ta.select();
      try { await navigator.clipboard.writeText(ta.value); } catch (e) { document.execCommand('copy'); }
      toast('Copiado');
    };
  }

  async function generarPDF() {
    const data = await reunirReporte();
    if (!data) return;
    if (!data.filas.length) { toast('Sin datos para el periodo.'); return; }
    const inf = construirInforme(data, $('#repTipo').value);
    const w = window.open('', '_blank');
    if (!w) { toast('Permita ventanas emergentes para el PDF.'); return; }
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
      <title>${esc(inf.empresa)} - ${esc(inf.titulo)}</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;color:#0f172a;padding:24px;max-width:800px;margin:0 auto}
        h1{margin:0;color:#0f766e;font-size:20px} h2{font-size:15px;margin:2px 0 16px;color:#475569;font-weight:500}
        table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
        th,td{border:1px solid #e2e8f0;padding:7px 9px;text-align:left} th{background:#f1f5f9}
        .stat-row{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}
        .stat-row .card{border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;text-align:center;min-width:120px}
        .stat-row .num{font-size:22px;font-weight:800;color:#0f766e}.stat-row .lbl{font-size:11px;color:#475569}
        .pie{margin-top:24px;font-size:11px;color:#94a3b8;text-align:center}
        @media print{button{display:none}}
      </style></head><body>
      <h1>${esc(inf.empresa)}</h1>
      <h2>${esc(inf.titulo)} · ${esc(inf.periodo)}</h2>
      ${inf.html.replace(/class="card"[^>]*>/g, '>').replace(/class="grid2"/g, 'class="stat-row"').replace(/class="card stat[^"]*"/g, 'class="card"')}
      <div class="pie">Generado el ${fmtFechaISO(hoyISO())} · Red de Vida</div>
      <button onclick="print()" style="margin-top:16px;padding:10px 16px">Imprimir / Guardar PDF</button>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
      </body></html>`);
    w.document.close();
    toast('Abriendo PDF para imprimir/guardar');
  }

  async function exportarCSV() {
    const data = await reunirReporte();
    if (!data) return;
    const { filas, mapaC } = data;
    if (!filas.length) { toast('No hay datos para exportar.'); return; }
    const out = [['Fecha', 'Evento', 'Colaborador', 'Cedula', 'Puesto', 'Estado', 'Motivo']];
    filas.forEach((r) => {
      const c = mapaC[r.colaboradorId] || {};
      const estado = r.ausente ? (r.justificada ? 'Ausente justificada' : 'Ausente injustificada') : (r.tarde ? 'Tardía' : 'Presente');
      out.push([r.evento.fecha, r.evento.nombre, c.nombre || '', c.cedula || '', c.puesto || '',
        estado, r.ausente ? (r.motivo || '') : '']);
    });
    const csv = '﻿' + out.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    descargar(csv, `asistencia_${$('#repIni').value}_a_${$('#repFin').value}.csv`, 'text/csv');
    toast('CSV descargado (se abre en Excel)');
  }

  function descargar(contenido, nombre, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ================= ENLACES =================
  function enlazar(vista) {
    const main = $('#vista');
    $$('[data-goto]', main).forEach((b) => (b.onclick = () => render(b.dataset.goto)));
    $$('[data-pasar]', main).forEach((b) => (b.onclick = () => renderPasarLista(b.dataset.pasar)));

    if (vista === 'eventos') {
      $$('[data-nuevo-evento]', main).forEach((b) => (b.onclick = () => formEvento(null)));
      $$('[data-editar-evento]', main).forEach((b) => (b.onclick = () => formEvento(b.dataset.editarEvento)));
    }
    if (vista === 'colaboradores') {
      $$('[data-nuevo-colab]', main).forEach((b) => (b.onclick = () => formColaborador(null)));
      $$('[data-editar-colab]', main).forEach((b) => (b.onclick = () => formColaborador(b.dataset.editarColab)));
    }
    if (vista === 'reportes') {
      const setPeriodo = (rango) => { const [i, f] = rango; $('#repIni').value = i; $('#repFin').value = f; pintarReporte(); };
      $$('[data-periodo]', main).forEach((b) => (b.onclick = () => {
        $$('[data-periodo]', main).forEach((x) => x.classList.add('ghost'));
        b.classList.remove('ghost');
        setPeriodo(b.dataset.periodo === 'semana' ? rangoSemana() : b.dataset.periodo === 'cuatri' ? rangoCuatri() : rangoMes());
      }));
      $('#repTipo').onchange = pintarReporte;
      $('#repGenerar').onclick = pintarReporte;
      $('#repWA').onclick = copiarWhatsapp;
      $('#repPDF').onclick = generarPDF;
      $('#repCSV').onclick = exportarCSV;
      pintarReporte();
    }
    if (vista === 'ajustes') {
      $('#setGuardar').onclick = async () => {
        await Cfg.save({ empresa: $('#setEmpresa').value.trim() || 'Red de Vida' });
        toast('Ajustes guardados');
      };
      $('#setExport').onclick = async () => {
        const d = await DB.exportAll();
        descargar(JSON.stringify(d, null, 2), `respaldo_red_de_vida_${hoyISO()}.json`, 'application/json');
        toast('Respaldo descargado');
      };
      $('#setImport').onclick = () => $('#fileImport').click();
      $('#fileImport').onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const d = JSON.parse(await file.text());
          if (!confirm('Esto reemplazará TODOS los datos actuales por los del respaldo. ¿Continuar?')) return;
          await DB.importAll(d, { reemplazar: true });
          await Cfg.load(); toast('Datos restaurados'); render('inicio');
        } catch (err) { toast('Archivo no válido: ' + err.message); }
        e.target.value = '';
      };
      $('#setBorrar').onclick = async () => {
        if (!confirm('¿Borrar TODOS los datos (eventos, colaboradores y registros)?')) return;
        if (!confirm('Última confirmación: se perderá todo. ¿Seguro?')) return;
        await Promise.all([DB.clear('colaboradores'), DB.clear('eventos'), DB.clear('registros'), DB.clear('config')]);
        await Cfg.load(); toast('Todos los datos fueron borrados'); render('inicio');
      };
    }
  }

  // ================= ARRANQUE =================
  async function init() {
    tickReloj(); setInterval(tickReloj, 30000);
    $$('.tab').forEach((t) => (t.onclick = () => render(t.dataset.vista)));

    await Cfg.load();
    await render('inicio');
    initInstalacion();
    // Ya no usamos service worker (la app necesita internet y la caché causaba
    // versiones viejas atascadas). Si quedó uno registrado, se elimina solo
    // gracias al "kill switch" en service-worker.js. No registramos ninguno.
  }

  // ---------- Instalar como app ----------
  // No existe forma de instalar automáticamente sin que la persona lo toque
  // (ningún navegador lo permite, por seguridad). Lo que sí se puede hacer es
  // que el aviso sea imposible de ignorar: un banner fijo, con instrucciones
  // claras según el sistema cuando el navegador no ofrece el botón nativo
  // (Safari/iPhone y Firefox nunca disparan "beforeinstallprompt").
  function yaInstalada() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  function instruccionesOS() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) {
      return 'En Safari: toca el botón de compartir (cuadrado con flecha hacia arriba) y elige "Agregar a pantalla de inicio".';
    }
    if (/Android/.test(ua)) {
      return 'Toca el menú (⋮) del navegador y elige "Instalar app" o "Agregar a pantalla de inicio".';
    }
    return 'En el menú del navegador busca la opción "Instalar app" o "Agregar a pantalla de inicio".';
  }
  function initInstalacion() {
    const banner = $('#bannerInstalar');
    if (!banner) return;
    if (yaInstalada() || localStorage.getItem('rv_banner_instalar_oculto') === '1') {
      banner.hidden = true; return;
    }
    let deferred = null;
    const btn = $('#btnInstalar');
    btn.onclick = async () => {
      if (deferred) {
        banner.hidden = true;
        deferred.prompt();
        await deferred.userChoice;
        deferred = null;
      } else {
        Modal.open(`<h3>Cómo instalar</h3><p>${instruccionesOS()}</p>`);
      }
    };
    $('#btnCerrarBanner').onclick = () => {
      banner.hidden = true;
      localStorage.setItem('rv_banner_instalar_oculto', '1');
    };
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
