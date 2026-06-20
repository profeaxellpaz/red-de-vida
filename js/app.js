// app.js — Lógica de Red de Vida (Asistencia por eventos). Funciona sin internet.
(() => {
  'use strict';

  // ---------- Utilidades ----------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');

  const hoyISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const horaActual = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const minDeHora = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
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
    data: { empresa: 'Red de Vida', tolerancia: 10 },
    async load() {
      const c = await DB.getConfig();
      this.data.empresa = c.empresa || this.data.empresa;
      this.data.tolerancia = c.tolerancia != null ? c.tolerancia : this.data.tolerancia;
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

  // ---------- Tardía relativa al evento ----------
  function calcTardia(evento, horaStr) {
    if (!horaStr || !evento.horaEntrada) return 0;
    const tol = evento.tolerancia != null ? evento.tolerancia : Cfg.data.tolerancia;
    const diff = minDeHora(horaStr) - (minDeHora(evento.horaEntrada) + Number(tol));
    return diff > 0 ? diff : 0;
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
      const marcados = regs.filter((r) => r.entrada || r.ausente).length;
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
      let accion = `<button class="btn sm ok" data-entrada="${c.id}">Entrada</button>`;
      if (r && r.ausente) {
        ausentes++;
        const chip = r.justificada ? '<span class="chip gray">Ausente justif.</span>' : '<span class="chip bad">Ausente injustif.</span>';
        estado = `${chip}${r.motivo ? ` <small class="muted">· ${esc(r.motivo)}</small>` : ''}`;
        accion = '';
      } else if (r && r.entrada && !r.salida) {
        presentes++; if (r.minutosTarde > 0) tardes++;
        const t = r.minutosTarde > 0 ? `<span class="chip warn">Tarde ${r.minutosTarde}m</span>` : '<span class="chip ok">A tiempo</span>';
        estado = `${t} <small class="muted">⬆ ${fmt12h(r.entrada)}</small>`;
        accion = `<button class="btn sm warn" data-salida="${c.id}">Salida</button>`;
      } else if (r && r.entrada && r.salida) {
        presentes++; if (r.minutosTarde > 0) tardes++;
        const tc = r.minutosTarde > 0 ? `<span class="chip warn">Tarde ${r.minutosTarde}m</span>` : '<span class="chip ok">Completo</span>';
        estado = `${tc} <small class="muted">⬆${fmt12h(r.entrada)} ⬇${fmt12h(r.salida)}</small>`;
        accion = '';
      }
      return `<div class="item">
        <div class="avatar">${iniciales(c.nombre)}</div>
        <div class="info"><b>${esc(c.nombre)}</b><br><small>${estado}</small></div>
        <div style="display:flex;gap:6px;align-items:center">
          ${accion}
          <button class="btn sm ghost" data-editar-reg="${c.id}" title="Editar / Ausente">✎</button>
        </div>
      </div>`;
    });

    main.innerHTML = `
      <button class="btn sm ghost" data-volver style="margin-bottom:10px">← Eventos</button>
      <div class="card">
        <b style="font-size:1.1rem">${esc(ev.nombre)}</b>
        <div class="muted">${fmtFechaISO(ev.fecha)}</div>
        <div class="muted">🕒 ${fmt12h(ev.horaEntrada)} – ${fmt12h(ev.horaSalida)} · tolerancia ${ev.tolerancia ?? Cfg.data.tolerancia} min</div>
        ${ev.notas ? `<div class="muted mt">📝 ${esc(ev.notas)}</div>` : ''}
      </div>
      <div class="grid2">
        <div class="card stat ok"><div class="num">${presentes}</div><div class="lbl">Presentes</div></div>
        <div class="card stat warn"><div class="num">${tardes}</div><div class="lbl">Tardías</div></div>
      </div>
      ${colabs.length ? `<div class="list">${items.join('')}</div>`
        : `<div class="empty"><div class="big">👥</div><p>No hay colaboradores activos.</p>
           <button class="btn" data-goto="colaboradores">Agregar colaboradores</button></div>`}
    `;

    // eventos
    $('[data-volver]', main).onclick = () => render('eventos');
    $$('[data-goto]', main).forEach((b) => (b.onclick = () => render(b.dataset.goto)));
    $$('[data-entrada]', main).forEach((b) => (b.onclick = async () => { await marcarEntrada(ev, b.dataset.entrada); renderPasarLista(eventoId); }));
    $$('[data-salida]', main).forEach((b) => (b.onclick = async () => { await marcarSalida(ev, b.dataset.salida); renderPasarLista(eventoId); }));
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
    const eventos = (await DB.all('eventos')).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const fin = hoyISO();
    const d = new Date(); d.setDate(d.getDate() - 89);
    const ini = hoyISO(d);
    const optColab = colabs.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    const optEv = eventos.map((e) => `<option value="${e.id}">${esc(e.nombre)} · ${fmtFechaISO(e.fecha)}</option>`).join('');

    return `
      <h2 class="section-title">Reportes</h2>
      <div class="card">
        <label>Evento</label>
        <select id="repEvento"><option value="">Todos</option>${optEv}</select>
        <div class="row mt">
          <div><label>Desde</label><input type="date" id="repIni" value="${ini}"></div>
          <div><label>Hasta</label><input type="date" id="repFin" value="${fin}"></div>
        </div>
        <label>Colaborador</label>
        <select id="repColab"><option value="">Todos</option>${optColab}</select>
        <div class="row mt">
          <button class="btn" id="repGenerar">📊 Generar</button>
          <button class="btn ghost" id="repCSV">⬇ Exportar CSV</button>
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
        <label>Tolerancia por defecto para nuevos eventos (min)</label>
        <input type="number" id="setTol" min="0" value="${c.tolerancia}">
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
  async function marcarEntrada(evento, colaboradorId) {
    let reg = await regDe(evento.id, colaboradorId);
    if (reg && reg.entrada) { toast('Ya tiene entrada marcada.'); return; }
    const hora = horaActual();
    const min = calcTardia(evento, hora);
    reg = reg || { id: uid(), eventoId: evento.id, colaboradorId };
    reg.entrada = hora; reg.minutosTarde = min; reg.tarde = min > 0; reg.ausente = false;
    await DB.put('registros', reg);
    toast(min > 0 ? `Entrada ${fmt12h(hora)} · tarde ${min} min` : `Entrada ${fmt12h(hora)} · a tiempo`);
  }

  async function marcarSalida(evento, colaboradorId) {
    const reg = await regDe(evento.id, colaboradorId);
    if (!reg || !reg.entrada) { toast('Primero marque la entrada.'); return; }
    if (reg.salida) { toast('Ya tiene salida marcada.'); return; }
    reg.salida = horaActual();
    await DB.put('registros', reg);
    toast(`Salida ${fmt12h(reg.salida)}`);
  }

  // Corrección manual de un registro (entrada/salida/ausente)
  async function editarRegistro(evento, colaboradorId) {
    const colab = await DB.get('colaboradores', colaboradorId);
    const reg = (await regDe(evento.id, colaboradorId)) || { id: uid(), eventoId: evento.id, colaboradorId };
    Modal.open(`
      <h3>Editar marcaje</h3>
      <p class="muted" style="margin-top:-6px">${esc(colab.nombre)} · ${esc(evento.nombre)}</p>
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="edAusente" style="width:auto" ${reg.ausente ? 'checked' : ''}> Marcar como ausente
      </label>
      <div id="edAus">
        <label>Tipo de ausencia</label>
        <select id="edTipoAus">
          <option value="injustificada" ${!reg.justificada ? 'selected' : ''}>Injustificada</option>
          <option value="justificada" ${reg.justificada ? 'selected' : ''}>Justificada</option>
        </select>
        <label>Motivo (opcional)</label>
        <input id="edMotivo" value="${esc(reg.motivo || '')}" placeholder="Ej: cita médica, permiso...">
      </div>
      <div class="row mt" id="edHoras">
        <div><label>Entrada</label><input type="time" id="edEnt" value="${reg.entrada || ''}"></div>
        <div><label>Salida</label><input type="time" id="edSal" value="${reg.salida || ''}"></div>
      </div>
      <button class="btn block mt" id="edGuardar">Guardar</button>
    `);
    const tog = () => {
      const aus = $('#edAusente').checked;
      $('#edHoras').style.display = aus ? 'none' : 'flex';
      $('#edAus').style.display = aus ? 'block' : 'none';
    };
    $('#edAusente').onchange = tog; tog();
    $('#edGuardar').onclick = async () => {
      if ($('#edAusente').checked) {
        reg.ausente = true; reg.entrada = null; reg.salida = null; reg.minutosTarde = 0; reg.tarde = false;
        reg.justificada = $('#edTipoAus').value === 'justificada';
        reg.motivo = $('#edMotivo').value.trim();
      } else {
        const ent = $('#edEnt').value, sal = $('#edSal').value;
        reg.ausente = false; reg.justificada = false; reg.motivo = '';
        reg.entrada = ent || null; reg.salida = sal || null;
        reg.minutosTarde = ent ? calcTardia(evento, ent) : 0; reg.tarde = reg.minutosTarde > 0;
      }
      await DB.put('registros', reg);
      Modal.close(); toast('Marcaje actualizado'); renderPasarLista(evento.id);
    };
  }

  // Formulario de evento (nuevo / editar)
  async function formEvento(id) {
    const e = id ? await DB.get('eventos', id) : { fecha: hoyISO(), horaEntrada: '19:00', horaSalida: '21:00', tolerancia: Cfg.data.tolerancia };
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
      <label>Tolerancia para tardía (min)</label>
      <input type="number" id="eTol" min="0" value="${e.tolerancia != null ? e.tolerancia : Cfg.data.tolerancia}">
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
        tolerancia: Number($('#eTol').value) || 0,
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
  async function reunirReporte() {
    const ini = $('#repIni').value, fin = $('#repFin').value;
    const eventoId = $('#repEvento').value, colabId = $('#repColab').value;
    if (!ini || !fin) { toast('Elija el rango de fechas.'); return null; }
    let eventos = (await DB.all('eventos')).filter((e) => e.fecha >= ini && e.fecha <= fin);
    if (eventoId) eventos = eventos.filter((e) => e.id === eventoId);
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
    return { filas, mapaC };
  }

  async function pintarReporte() {
    const data = await reunirReporte();
    if (!data) return;
    const { filas, mapaC } = data;
    const cont = $('#repResultado');
    if (!filas.length) { cont.innerHTML = `<div class="empty"><div class="big">📭</div><p>Sin registros en ese rango.</p></div>`; return; }
    const tardes = filas.filter((r) => r.minutosTarde > 0).length;
    const ausentes = filas.filter((r) => r.ausente).length;
    const totMin = filas.reduce((s, r) => s + (r.minutosTarde || 0), 0);
    const cuerpo = filas.map((r) => {
      const c = mapaC[r.colaboradorId];
      let est = r.ausente
        ? (r.justificada ? '<span class="chip gray">Aus. justif.</span>' : '<span class="chip bad">Aus. injustif.</span>')
        : (r.minutosTarde > 0 ? `<span class="chip warn">${r.minutosTarde}m</span>` : '<span class="chip ok">—</span>');
      return `<tr><td>${esc(fmtFechaISO(r.evento.fecha))}</td><td>${esc(r.evento.nombre)}</td>
        <td>${esc(c?.nombre || '?')}</td><td>${r.ausente ? '—' : esc(fmt12h(r.entrada) || '—')}</td>
        <td>${r.ausente ? '—' : esc(fmt12h(r.salida) || '—')}</td><td>${est}</td></tr>`;
    }).join('');
    cont.innerHTML = `
      <div class="grid2">
        <div class="card stat warn"><div class="num">${tardes}</div><div class="lbl">Tardías (${totMin} min)</div></div>
        <div class="card stat bad"><div class="num">${ausentes}</div><div class="lbl">Ausencias</div></div>
      </div>
      <div class="card" style="overflow:auto">
        <table><thead><tr><th>Fecha</th><th>Evento</th><th>Colaborador</th><th>Entrada</th><th>Salida</th><th>Estado</th></tr></thead>
        <tbody>${cuerpo}</tbody></table>
      </div>`;
  }

  async function exportarCSV() {
    const data = await reunirReporte();
    if (!data) return;
    const { filas, mapaC } = data;
    if (!filas.length) { toast('No hay datos para exportar.'); return; }
    const out = [['Fecha', 'Evento', 'Hora entrada evento', 'Hora salida evento', 'Colaborador', 'Cedula', 'Puesto', 'Entrada real', 'Salida real', 'Minutos tarde', 'Estado', 'Motivo']];
    filas.forEach((r) => {
      const c = mapaC[r.colaboradorId] || {};
      const estado = r.ausente
        ? (r.justificada ? 'Ausente justificada' : 'Ausente injustificada')
        : (r.minutosTarde > 0 ? 'Tarde' : 'A tiempo');
      out.push([r.evento.fecha, r.evento.nombre, r.evento.horaEntrada, r.evento.horaSalida,
        c.nombre || '', c.cedula || '', c.puesto || '',
        r.ausente ? '' : (r.entrada || ''), r.ausente ? '' : (r.salida || ''),
        r.ausente ? '' : (r.minutosTarde || 0),
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
      $('#repGenerar').onclick = pintarReporte;
      $('#repCSV').onclick = exportarCSV;
      pintarReporte();
    }
    if (vista === 'ajustes') {
      $('#setGuardar').onclick = async () => {
        await Cfg.save({
          empresa: $('#setEmpresa').value.trim() || 'Red de Vida',
          tolerancia: Number($('#setTol').value) || 0
        });
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
    await DB.open();
    await Cfg.load();
    tickReloj(); setInterval(tickReloj, 30000);
    $$('.tab').forEach((t) => (t.onclick = () => render(t.dataset.vista)));
    await render('inicio');

    let deferred;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); deferred = e;
      const b = $('#btnInstalar'); b.hidden = false;
      b.onclick = async () => { b.hidden = true; deferred.prompt(); await deferred.userChoice; deferred = null; };
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
