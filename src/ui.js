/* Eleganza Academia · Tablero financiero — interfaz (Daniel Financiero) */
(function () {
  'use strict';
  const C = window.EACore;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { env: null, ds: null, key: null, salt: null, auth: null, authHash: null, sede: 'Todas', mes: null, esc: 'vigente', dirty: false, psede: null,
    db: { ok: false, motivo: '', version: 0, estado: 'guardado', ultimo: null, timer: null, enCurso: null, otraVez: false } };
  let nsec = 0; const num = () => String(++nsec).padStart(2, '0');

  // ------------------------------------------------------------ formato
  const nf1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  const fM = v => v == null || isNaN(v) ? '—' : (v < 0 ? '−$' : '$') + nf1.format(Math.abs(v) / 1e6) + 'M';
  const fP = v => v == null || isNaN(v) || !isFinite(v) ? '—' : (v < 0 ? '−' : '') + nf1.format(Math.abs(v) * 100) + '%';
  const fP2 = v => v == null ? '—' : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(v * 100) + '%';
  const fN = v => v == null || isNaN(v) ? '—' : nf0.format(Math.round(v));
  const fPP = v => v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '−') + nf1.format(Math.abs(v) * 100) + ' pp';
  const sgn = v => v == null ? '' : v >= 0 ? 'up' : 'down';
  const varTxt = (a, b, bueno) => { // a real, b referencia
    if (a == null || b == null) return '';
    const d = a - b; const cls = (bueno === 'menos' ? -d : d) >= 0 ? 'up' : 'down';
    const pct = b ? d / Math.abs(b) : null;
    return '<span class="' + cls + '">' + (d >= 0 ? '+' : '−') + fM(Math.abs(d)).replace('−', '') + (pct != null && Math.abs(pct) < 10 ? ' (' + (pct >= 0 ? '+' : '−') + nf1.format(Math.abs(pct) * 100) + '%)' : '') + '</span>';
  };
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms || 3500); }
  const logo = dark => '<span class="df-logo' + (dark ? ' on-dark' : '') + '"><span class="dici"><span class="di">Di</span><span class="ci">Ci</span></span><span class="sep"></span><span class="word"><b>Daniel</b><span>Financiero</span><span class="dot">.</span></span></span>';
  const nombreMes = k => { const t = C.keyLabel(k); return t.charAt(0).toUpperCase() + t.slice(1); };
  const sedeTxt = () => S.sede === 'Todas' ? 'la empresa' : S.sede;

  // ------------------------------------------------------------ arranque
  async function cargarEnvelope() {
    const inl = document.getElementById('ea-data');
    if (inl) return JSON.parse(inl.textContent);
    // 1) base de datos (guardado automático); 2) archivo publicado en el repositorio
    try {
      const r = await fetch('api/datos', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.envelope) { S.db.ok = true; S.db.version = j.version; S.db.ultimo = j.updatedAt; return j.envelope; }
      if (r.status === 404) { S.db.ok = true; S.db.version = 0; }
      else S.db.motivo = j.error === 'sin_base' ? 'La base de datos todavía no está conectada al proyecto en Vercel.' : 'No se pudo leer la base de datos (' + (j.mensaje || r.status) + ').';
    } catch (e) { S.db.motivo = 'Sin conexión con la base de datos.'; }
    try { const r = await fetch('data/dataset.json', { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) { }
    return null;
  }

  // ------------------------------------------------------------ guardado automático en la base de datos
  function chipGuardado() {
    const d = S.db;
    if (!d.ok) return '<span class="gchip off" title="' + esc(d.motivo) + '">Sin base de datos</span>';
    const t = d.estado === 'guardando' ? 'Guardando…' : d.estado === 'pendiente' ? 'Cambios por guardar' : d.estado === 'error' ? 'No se guardó · reintentar' :
      'Guardado' + (d.ultimo ? ' ' + new Date(d.ultimo).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '');
    return '<span class="gchip ' + d.estado + '" id="gchipbtn" title="' + esc(d.msg || 'Los cambios se guardan solos en la base de datos cifrada') + '">' + t + '</span>';
  }
  function pintarChip() { document.querySelectorAll('.gchip-wrap').forEach(el => { el.innerHTML = chipGuardado(); const b = el.querySelector('#gchipbtn'); if (b && S.db.estado === 'error') b.onclick = () => guardarAhora(); }); }
  /** Marca cambios y los guarda solos (con una pausa corta para agrupar ediciones seguidas). */
  function persistir(inmediato) {
    S.dirty = true;
    if (!S.db.ok) { pintarChip(); return; }
    S.db.estado = 'pendiente'; pintarChip();
    clearTimeout(S.db.timer);
    S.db.timer = setTimeout(guardarAhora, inmediato ? 0 : 900);
  }
  async function guardarAhora(cambioClave) {
    if (!S.db.ok) return false;
    if (S.db.enCurso) { S.db.otraVez = true; return S.db.enCurso; }
    clearTimeout(S.db.timer);
    S.db.estado = 'guardando'; pintarChip();
    S.db.enCurso = (async () => {
      try {
        const nueva = cambioClave || null;
        const env = await C.encryptDataset(S.ds, nueva ? nueva.key : S.key, nueva ? nueva.salt : S.salt, nueva ? nueva.authHash : S.authHash);
        const r = await fetch('api/datos', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.auth }, body: JSON.stringify({ envelope: env, baseVersion: S.db.version }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          S.db.version = j.version; S.db.ultimo = j.updatedAt; S.db.estado = 'guardado'; S.db.msg = ''; S.env = env; S.dirty = false;
          if (nueva) { S.key = nueva.key; S.salt = nueva.salt; S.auth = nueva.auth; S.authHash = nueva.authHash; }
          return true;
        }
        S.db.estado = 'error';
        if (r.status === 409) { S.db.msg = 'Otra persona guardó cambios'; conflicto(j.version); }
        else if (r.status === 401) { S.db.msg = 'La clave con la que entró no tiene permiso de escritura en la base.'; toast(S.db.msg, 7000); }
        else { S.db.msg = 'Error al guardar: ' + (j.mensaje || j.error || r.status); toast(S.db.msg + '. Toque el indicador para reintentar.', 7000); }
        return false;
      } catch (e) { S.db.estado = 'error'; S.db.msg = 'Sin conexión: ' + e.message; toast('No se pudo guardar (sin conexión). Toque el indicador para reintentar.', 7000); return false; }
      finally {
        S.db.enCurso = null; pintarChip();
        if (S.db.otraVez) { S.db.otraVez = false; if (S.db.estado !== 'error') persistir(true); }
      }
    })();
    return S.db.enCurso;
  }
  function conflicto(versionServidor) {
    const m = modal('<h3>Otra persona guardó cambios</h3><p class="muted">Mientras usted trabajaba, alguien más guardó una versión nueva del tablero (versión ' + versionServidor + '). Elija qué hacer con sus cambios.</p>' +
      '<div class="row-actions"><button class="btn ghost" id="crec">Cargar la versión guardada</button><button class="btn" id="cmio">Guardar mis cambios encima</button></div>');
    $('#cmio', m).onclick = () => { m.remove(); S.db.version = versionServidor; guardarAhora(); };
    $('#crec', m).onclick = async () => {
      m.remove();
      try {
        const r = await fetch('api/datos', { cache: 'no-store' }); const j = await r.json();
        S.ds = await C.decryptWithKey(j.envelope, S.key); S.env = j.envelope; S.db.version = j.version; S.db.ultimo = j.updatedAt; S.db.estado = 'guardado'; S.dirty = false;
        if (S.ds.params) C.recalcular(S.ds); render(); toast('Se cargó la versión guardada.');
      } catch (e) { toast('La clave cambió en la otra versión: vuelva a entrar.', 6000); S.ds = null; renderLogin(); }
    };
  }
  window.addEventListener('beforeunload', e => { if (S.ds && (S.db.estado === 'pendiente' || S.db.estado === 'guardando' || (!S.db.ok && S.dirty))) { e.preventDefault(); e.returnValue = ''; } });
  function descargarRespaldo() { const env = S.env; return C.encryptDataset(S.ds, S.key, S.salt, S.authHash).then(guardar).then(() => { if (!S.db.ok) S.dirty = false; S.env = S.env || env; }); }
  async function boot() {
    S.env = await cargarEnvelope();
    renderLogin();
  }
  function renderLogin(err) {
    $('#app').innerHTML = '<div class="login"><form class="login-card" id="lf">' + logo(true) +
      '<div style="margin-top:28px"><span class="pill">Tablero financiero</span></div>' +
      '<h1>Eleganza Academia</h1><p>Resultados reales por sede frente al plan financiero 2027. Ingrese la clave de acceso.</p>' +
      (S.env ? '<input type="password" id="pin" autocomplete="current-password" placeholder="Clave de acceso" autofocus><button class="btn" type="submit">Entrar</button>'
        : '<p>No se encontró el archivo de datos (data/dataset.json).</p>') +
      '<div class="err" id="lerr">' + esc(err || '') + '</div></form></div>';
    const f = $('#lf');
    f && f.addEventListener('submit', async ev => {
      ev.preventDefault(); const pin = $('#pin').value; if (!pin) return;
      $('#lerr').textContent = 'Abriendo…';
      try {
        const r = await C.decryptDataset(S.env, pin);
        S.ds = r.ds; S.key = r.key; S.salt = C.b64d(S.env.kdf.salt); S.auth = r.auth; S.authHash = r.authHash;
        if (!S.ds.params) S.esc = 'base'; else C.recalcular(S.ds);
        const reales = C.mesesReales(S.ds);
        S.mes = reales.length ? reales[reales.length - 1] : C.mesesPlan(S.ds)[0];
        render();
      } catch (e) { $('#lerr').textContent = e.code === 'bad_pin' ? 'Clave incorrecta.' : 'No se pudo abrir: ' + e.message; }
    });
  }

  // ------------------------------------------------------------ datos de la vista
  function vista() {
    const ds = S.ds, k = S.mes, s = S.sede;
    const R = C.real(ds, k, s), P = C.plan(ds, S.esc, k, s);
    const kPrev = C.addMonths(k, -1);
    const Rp = C.real(ds, kPrev, s);
    return { R, P, Rp, kPrev, hayReal: !!R };
  }
  function meses() {
    const set = new Set([...C.mesesReales(S.ds), ...C.mesesPlan(S.ds)]);
    return [...set].sort();
  }

  // ------------------------------------------------------------ render principal
  function render() {
    const ds = S.ds;
    const ms = meses();
    const reales = new Set(C.mesesReales(ds));
    const optsMes = ms.map(k => '<option value="' + k + '"' + (k === S.mes ? ' selected' : '') + '>' + nombreMes(k) + (reales.has(k) ? ' · real' : ' · plan') + '</option>').join('');
    const optsSede = ['Todas'].concat(C.NOMBRES_SEDES).map(n => '<option' + (n === S.sede ? ' selected' : '') + ' value="' + esc(n) + '">' + (n === 'Todas' ? 'Todas las sedes' : esc(n)) + '</option>').join('');
    const optsEsc = Object.entries(C.ESCENARIOS).map(([k, t]) => '<option value="' + k + '"' + (k === S.esc ? ' selected' : '') + '>' + t + '</option>').join('');
    const V = vista();
    const ctx = esc(S.sede === 'Todas' ? 'Todas las sedes' : S.sede) + '<span class="ctx-sep">/</span>' + esc(nombreMes(S.mes)) + (reales.has(S.mes) ? ' · real' : ' · plan') + '<span class="ctx-sep">/</span><span class="ctx-soft">vs ' + esc(C.ESCENARIOS[S.esc]) + '</span>';
    const lateral =
      '<div class="side-group"><div class="side-label">Filtros</div>' +
      '<div class="sfield"><label for="fsede">Sede</label><select id="fsede">' + optsSede + '</select></div>' +
      '<div class="sfield"><label for="fmes">Mes</label><select id="fmes">' + optsMes + '</select></div>' +
      '<div class="sfield"><label for="fesc">Comparar con</label><select id="fesc">' + optsEsc + '</select></div></div>' +
      navTablero(ds) +
      '<div class="side-foot"><button class="btn small block solo-movil" id="bcargar2">Cargar informe</button>' +
      (ds.params ? '<button class="sbtn" id="bparam">Parámetros</button>' : '') + '<button class="sbtn" id="bconf">Configuración</button></div>';
    $('#app').innerHTML = shell('Tablero financiero', lateral, ctx + '</div><button class="btn small solo-escritorio" id="bcargar">Cargar informe</button><div style="display:none">',
      (!S.db.ok && S.dirty ? '<div class="aviso aviso-top">' + esc(S.db.motivo) + ' Los cambios quedan solo en este navegador. <a href="#" id="bguardar2">Descargar respaldo (dataset.json)</a></div>' : '') +
      hero(V) + '<main>' + kpis(V) + (nsec = 0, '') + secResultados(V) + secPresupuesto(V) + secGastos(V) + secTendencia() + secSedes() + secCapacidad() + secCursos() + secPlan() + (ds.params ? '' : secCriticas()) + '</main>' + footer());
    activarShell(true);
    $('#fsede').onchange = e => { S.sede = e.target.value; render(); };
    $('#fmes').onchange = e => { S.mes = e.target.value; render(); };
    $('#fesc').onchange = e => { S.esc = e.target.value; render(); };
    $('#bcargar').onclick = modalCargar; $('#bcargar2').onclick = modalCargar;
    $('#bconf').onclick = modalConfig;
    if ($('#bparam')) $('#bparam').onclick = () => { S.psede = S.sede !== 'Todas' ? S.sede : S.psede; renderParams(); window.scrollTo(0, 0); };
    if ($('#bguardar2')) $('#bguardar2').onclick = e => { e.preventDefault(); guardarParams().then(render); };
    pintarChip();
    document.querySelectorAll('.tarea-est').forEach(el => el.onchange = () => { S.ds.params.tareas[+el.dataset.i].estado = el.value; persistir(); });
    document.querySelectorAll('tr[data-sede]').forEach(tr => tr.onclick = () => { S.sede = tr.dataset.sede; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  // ------------------------------------------------------------ navegación lateral (distribución tipo documentación)
  const NAV = [
    ['Resumen', [['s-top', 'Resumen del mes']]],
    ['Resultados', [['s-res', 'Estado de resultados'], ['s-pre', 'Presupuesto vs ejecución'], ['s-gas', 'Gastos'], ['s-ten', 'Tendencia']]],
    ['Sedes y cursos', [['s-sed', 'Resultado por sede'], ['s-cap', 'Capacidad y ocupación'], ['s-cur', 'Detalle por curso']]],
    ['Plan 2027', [['s-plan', 'Escenarios del plan'], ['s-cri', 'Sedes críticas']]]
  ];
  function navTablero(ds) {
    const existe = id => id === 's-top' || (ds.params ? id !== 's-cri' : !['s-cap', 's-pre', 's-cur'].includes(id));
    let n = 0;
    return '<nav class="side-nav" id="snav">' + NAV.map(([g, items]) => {
      const its = items.filter(([id]) => existe(id));
      return its.length ? '<div class="side-label">' + g + '</div>' + its.map(([id, t]) => '<a href="#' + id + '" data-sec="' + id + '" data-q="' + esc(norm(t)) + '">' + (id === 's-top' ? '' : '<span class="nn">' + String(++n).padStart(2, '0') + '</span>') + esc(t) + '</a>').join('') : '';
    }).join('') + '<div id="snav-sedes"></div></nav>';
  }
  const norm = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function shell(subtitulo, lateral, ctx, contenido) {
    return '<div class="shell"><aside class="side" id="side">' +
      '<div class="side-head">' + logo(false) + '<div class="side-client"><b>Eleganza Academia</b><span>' + subtitulo + '</span></div></div>' +
      '<div class="side-search"><input type="search" id="navq" placeholder="Buscar sección o sede" autocomplete="off"><kbd>/</kbd></div>' + lateral + '</aside>' +
      '<div class="side-backdrop" id="sback"></div>' +
      '<div class="main-col"><div class="ctxbar"><button class="burger" id="bburger" aria-label="Abrir menú"><span></span><span></span><span></span></button><div class="ctx">' + ctx + '</div><span class="gchip-wrap">' + chipGuardado() + '</span></div>' + contenido + '</div></div>';
  }
  let spy = null;
  function activarShell(conSpy) {
    const side = $('#side'), back = $('#sback');
    const cerrar = () => { side.classList.remove('open'); back.classList.remove('on'); };
    $('#bburger').onclick = () => { side.classList.add('open'); back.classList.add('on'); };
    back.onclick = cerrar;
    side.querySelectorAll('.side-nav a[href^="#"]').forEach(a => a.addEventListener('click', e => {
      const el = document.getElementById(a.dataset.sec); if (!el) return;
      e.preventDefault(); cerrar();
      window.scrollTo({ top: a.dataset.sec === 's-top' ? 0 : el.getBoundingClientRect().top + window.scrollY - 64, behavior: 'smooth' });
      history.replaceState(null, '', '#' + a.dataset.sec);
    }));
    // buscador: filtra secciones y propone sedes (en el tablero cambia el filtro; en parámetros abre la sede)
    const q = $('#navq'), cajaSedes = $('#snav-sedes');
    q.oninput = () => {
      const t = norm(q.value.trim());
      side.querySelectorAll('.side-nav a[data-q]').forEach(a => a.classList.toggle('oculto', !!t && !a.dataset.q.includes(t)));
      side.querySelectorAll('.side-nav .side-label').forEach(l => { let x = l.nextElementSibling, vis = false; while (x && x.tagName === 'A') { if (!x.classList.contains('oculto')) vis = true; x = x.nextElementSibling; } l.classList.toggle('oculto', !vis); });
      if (cajaSedes) {
        const ss = t ? C.NOMBRES_SEDES.filter(n => norm(n).includes(t)) : [];
        cajaSedes.innerHTML = ss.length ? '<div class="side-label">Ver sede</div>' + ss.map(n => '<a href="#" class="sede-link" data-sede-nav="' + esc(n) + '">' + esc(n) + '</a>').join('') : '';
        cajaSedes.querySelectorAll('[data-sede-nav]').forEach(a => a.onclick = e => { e.preventDefault(); S.sede = a.dataset.sedeNav; render(); window.scrollTo(0, 0); });
      }
    };
    q.onkeydown = e => {
      if (e.key === 'Enter') { const v = [...side.querySelectorAll('.side-nav a')].find(a => !a.classList.contains('oculto') && a.offsetParent); if (v) { e.preventDefault(); v.click(); q.value = ''; q.oninput(); } }
      if (e.key === 'Escape') { q.value = ''; q.oninput(); q.blur(); }
    };
    // sección activa según el scroll
    if (spy) spy.disconnect();
    if (conSpy && 'IntersectionObserver' in window) {
      const links = Object.fromEntries([...side.querySelectorAll('.side-nav a[data-sec]')].map(a => [a.dataset.sec, a]));
      const marcar = id => Object.entries(links).forEach(([k, a]) => a.classList.toggle('on', k === id));
      marcar('s-top');
      spy = new IntersectionObserver(ents => {
        const vis = ents.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) marcar(vis.target.id);
      }, { rootMargin: '-72px 0px -65% 0px' });
      Object.keys(links).forEach(id => { const el = document.getElementById(id); if (el) spy.observe(el); });
    }
  }
  if (!window.__atajoNav) {
    window.__atajoNav = true;
    document.addEventListener('keydown', e => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) && !/INPUT|TEXTAREA|SELECT/.test(tag) && $('#navq')) { e.preventDefault(); $('#navq').focus(); }
    });
  }

  // ------------------------------------------------------------ hero + narrativa
  function hero(V) {
    const k = S.mes; const escN = C.ESCENARIOS[S.esc].toLowerCase();
    let txt = '';
    if (V.R) {
      const R = V.R;
      txt = 'En ' + C.keyLabel(k) + ' ' + esc(sedeTxt()) + ' facturó <b>' + fM(R.ing) + '</b> con un margen de contribución de <b>' + fP(R.mcP) + '</b>. ' +
        'Después de ' + fM(R.fijos) + ' en gastos fijos de sede, ' + fM(R.pau) + ' de pauta (' + fP(R.pauP) + ' de las ventas) y ' + fM(R.corp + R.fin) + ' de corporativo y financieros, ' +
        'la utilidad de gestión fue <b>' + fM(R.uai) + '</b>, ' + fP(R.uaiP) + ' de las ventas. ';
      if (V.P) {
        const dI = V.P.ing ? R.ing / V.P.ing - 1 : null;
        txt += 'Frente al ' + escN + ', las ventas quedaron ' + (dI >= 0 ? 'arriba ' : 'abajo ') + fP(Math.abs(dI)) + ' y la utilidad ' + (R.uai >= V.P.uai ? fM(R.uai - V.P.uai) + ' por encima' : fM(V.P.uai - R.uai) + ' por debajo') + ' de lo previsto. ';
      } else if (V.Rp) {
        txt += 'Frente a ' + C.keyLabel(V.kPrev) + ', las ventas ' + (R.ing >= V.Rp.ing ? 'subieron ' : 'bajaron ') + fP(Math.abs(R.ing / V.Rp.ing - 1)) + ' y la utilidad cambió ' + fM(R.uai - V.Rp.uai) + '. ';
      }
      if (R.pe != null) txt += 'El punto de equilibrio fue ' + fM(R.pe) + ': ' + (R.ms >= 0 ? 'las ventas lo superaron en ' + fP(R.ms) + ', un margen de seguridad ' + (R.ms < 0.05 ? 'muy estrecho' : 'cómodo') + '.' : 'faltó ' + fP(-R.ms) + ' de ventas para cubrir todos los gastos.');
      if (S.sede === 'Todas') {
        const filas = C.porSede(S.ds, k, S.esc).filter(x => x.real);
        const pos = filas.filter(x => x.real.uai > 0).length;
        const peores = filas.slice().sort((a, b) => a.real.uai - b.real.uai).slice(0, 3).filter(x => x.real.uai < 0);
        txt += ' ' + pos + ' de ' + filas.length + ' sedes cerraron con utilidad' + (peores.length ? '; las que más restan son ' + peores.map(x => esc(x.sede) + ' (' + fM(x.real.uai) + ')').join(', ') + '.' : '.');
      }
    } else if (V.P) {
      const P = V.P;
      txt = 'Aún no se ha cargado el informe a socios de ' + C.keyLabel(k) + '. Para este mes el ' + escN + ' proyecta para ' + esc(sedeTxt()) + ' ingresos de <b>' + fM(P.ing) + '</b>, margen de contribución de <b>' + fP(P.mcP) + '</b> y utilidad de gestión de <b>' + fM(P.uai) + '</b> (' + fP(P.uaiP) + '). ' +
        'El punto de equilibrio previsto es ' + fM(P.pe) + ', con un margen de seguridad de ' + fP(P.ms) + '.';
    }
    return '<section class="hero" id="s-top"><div class="hero-in"><span class="pill">' + (V.R ? 'Resultados reales' : 'Plan financiero 2027') + '</span>' +
      '<h1>' + esc(S.sede === 'Todas' ? 'Eleganza Academia' : S.sede) + '</h1><p class="sub">' + nombreMes(k) + (S.sede === 'Todas' ? ' · consolidado de 24 sedes' : ' · sede') +
      '<span class="badge-mes">' + esc(V.R ? (V.P ? 'Comparación: ' + C.ESCENARIOS[S.esc] : V.Rp ? 'Comparación: ' + C.keyLabel(V.kPrev) : 'Primer mes cargado: sin referencia') : 'Proyección: ' + C.ESCENARIOS[S.esc]) + '</span></p>' +
      '<p class="narr">' + txt + '</p></div></section>';
  }

  // ------------------------------------------------------------ KPIs
  function kpis(V) {
    const X = V.R || V.P; if (!X) return '';
    const ref = V.R ? (V.P || V.Rp) : null; const refN = V.R ? (V.P ? 'Plan' : 'Mes ant.') : 'Plan';
    const cap = (a, b, fmt, bueno) => ref ? refN + ': ' + fmt(b) + ' · ' + (fmt === fP ? '<span class="' + (((bueno === 'menos' ? -1 : 1) * (a - b)) >= 0 ? 'up' : 'down') + '">' + fPP(a - b) + '</span>' : varTxt(a, b, bueno)) : (V.R ? '' : 'Proyección del ' + C.ESCENARIOS[S.esc].toLowerCase());
    const card = (lab, val, c, neg) => '<div class="kpi"><div class="lab">' + lab + '</div><div class="val' + (neg ? ' neg' : '') + '">' + val + '</div><div class="cap">' + c + '</div></div>';
    let h = '<div class="kpis">' +
      card('Ingresos', fM(X.ing), cap(X.ing, ref && ref.ing, fM)) +
      card('Margen de contribución', fP(X.mcP), cap(X.mcP, ref && ref.mcP, fP)) +
      card('Gastos fijos de sede', fM(X.fijos), cap(X.fijos, ref && ref.fijos, fM, 'menos')) +
      card('Pauta / ingresos', fP(X.pauP), cap(X.pauP, ref && ref.pauP, fP, 'menos')) +
      card('Utilidad de gestión', fM(X.uai), cap(X.uai, ref && ref.uai, fM), X.uai < 0) +
      card('Punto de equilibrio', fM(X.pe), 'Margen de seguridad: <span class="' + sgn(X.ms) + '">' + fP(X.ms) + '</span>');
    if (S.ds.params) {
      const T = C.capacidad(S.ds, S.sede);
      h += card('Ocupación de franjas', fP(T.ocupFranjas), fN(T.grupos) + ' grupos en ' + fN(T.franjas) + ' franjas · ' + T.salones + ' salones');
      h += card('Estudiantes activos', fN(T.estudiantes), fP(T.ocupCupos) + ' de ' + fN(T.cupos) + ' cupos · deserción ' + fP(T.desercion));
    }
    if (S.sede === 'Todas') {
      const filas = C.porSede(S.ds, S.mes, S.esc).map(x => x.real || x.plan).filter(Boolean);
      const pos = filas.filter(x => x.uai > 0).length;
      h += card('Sedes con utilidad', pos + ' de ' + filas.length, V.R ? 'Resultado real del mes' : 'Según el ' + C.ESCENARIOS[S.esc].toLowerCase());
    } else if (!S.ds.params) {
      const cp = S.ds.plan && S.ds.plan.capacidad[S.sede];
      if (cp) h += card('Ocupación de franjas', fP(cp.ocupHist), cp.salones + ' salones · ' + cp.franjas + ' franjas · plan 2027: ' + fP(cp.ocup2027));
    }
    return h + '</div>';
  }

  // ------------------------------------------------------------ 01 estado de resultados
  function secResultados(V) {
    const X = V.R, P = V.P, Rp = V.Rp;
    const cols = [];
    if (X) { cols.push(['Real', L => X[L.k]]); cols.push(['% ventas', L => X.ing ? X[L.k] / X.ing : null, 'pct']); }
    if (P) { cols.push([C.ESCENARIOS[S.esc], L => L.g ? null : P[L.k]]); }
    if (X && P) cols.push(['Var. vs plan', L => L.g ? null : X[L.k] - P[L.k], 'var']);
    if (X && Rp) { cols.push([nombreMes(V.kPrev), L => Rp[L.k]]); cols.push(['Var. vs mes ant.', L => X[L.k] - Rp[L.k], 'var']); }
    if (!cols.length) return '';
    const costo = new Set(['cvEst', 'cvDoc', 'cvIns', 'cv', 'bonCom', 'imp', 'bon', 'personal', 'arriendo', 'servicios', 'mantenimiento', 'otros', 'iva', 'fijos', 'pau', 'corp', 'fin']);
    let rows = '';
    for (const L of C.LINEAS) {
      if (!X && L.g) continue;
      const cls = L.total ? (L.k === 'uai' ? 'tot' : 'sub') : L.sub ? 'sub' : L.g ? 'det' : '';
      rows += '<tr class="' + cls + '"><td>' + esc(L.t) + '</td>' + cols.map(([, fn, kind]) => {
        const v = fn(L);
        if (v == null) return '<td>—</td>';
        if (kind === 'pct') return '<td>' + fP(v) + '</td>';
        if (kind === 'var') { const bueno = costo.has(L.k) ? -v : v; return '<td class="' + (Math.abs(v) < 1 ? '' : bueno >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '') + fM(v) + '</td>'; }
        return '<td class="' + (v < 0 ? 'neg' : '') + '">' + fM(v) + '</td>';
      }).join('') + '</tr>';
      if (L.k === 'mc') rows += '<tr class="det"><td>Margen de contribución %</td>' + cols.map(([n, fn, kind]) => {
        const src = n === 'Real' ? X : n === C.ESCENARIOS[S.esc] ? P : Rp && n === nombreMes(V.kPrev) ? Rp : null;
        if (kind === 'var') { const a = X, b = n === 'Var. vs plan' ? P : Rp; return '<td>' + (a && b ? fPP(a.mcP - b.mcP) : '') + '</td>'; }
        return '<td>' + (src && kind !== 'pct' ? fP(src.mcP) : '') + '</td>';
      }).join('') + '</tr>';
    }
    if (X) {
      const extra = [['Adecuaciones extraordinarias (no recurrentes)', 'extra'], ['Compra de activos fijos (informativo)', 'capex'], ['Utilidad neta socios según el informe', 'socios']];
      rows += extra.map(([t, k]) => '<tr class="det"><td>' + t + '</td><td class="' + (X[k] < 0 ? 'neg' : '') + '">' + fM(X[k]) + '</td>' + cols.slice(1).map(() => '<td></td>').join('') + '</tr>').join('');
    }
    const head = '<tr><th>Concepto</th>' + cols.map(c => '<th>' + esc(c[0]) + '</th>').join('') + '</tr>';
    return '<section class="section" id="s-res"><p class="eyebrow">' + num() + ' — Resultados del mes</p><h2>Estado de resultados de gestión</h2><div class="divider"></div>' +
      '<p class="lead">Mismo criterio del plan 2027: los costos que dependen de estudiantes y grupos van antes del margen de contribución; la pauta, el corporativo y los financieros después. ' + (X ? 'Los no recurrentes y las compras de activos se muestran aparte.' : '') + '</p>' +
      '<div class="grid g-side"><div class="card" style="padding:0"><div class="tw"><table class="t">' + head + rows + '</table></div></div>' + insightVariaciones(V) + '</div></section>';
  }
  function insightVariaciones(V) {
    const X = V.R; const ref = V.P || V.Rp; const nref = V.P ? 'el ' + C.ESCENARIOS[S.esc].toLowerCase() : V.Rp ? C.keyLabel(V.kPrev) : null;
    if (!X || !ref) {
      const Y = X || V.P;
      if (!Y) return '<div></div>';
      return '<div class="insight"><h4>Lectura</h4><p>Por cada $100 de ventas, ' + nf0.format(Y.cv / Y.ing * 100) + ' se van en costos de estudiantes y docentes, ' + nf0.format(Y.fijos / Y.ing * 100) + ' en gastos fijos de sede, ' + nf0.format(Y.pau / Y.ing * 100) + ' en pauta y ' + nf0.format((Y.corp + Y.fin) / Y.ing * 100) + ' en corporativo y financieros. ' + (Y.uai >= 0 ? 'Quedan ' + nf1.format(Y.uai / Y.ing * 100) + ' de utilidad de gestión.' : 'Se pierden ' + nf1.format(-Y.uai / Y.ing * 100) + '.') + '</p></div>';
    }
    const items = [['ing', 'ventas', 1], ['cv', 'costos variables', -1], ['fijos', 'gastos fijos de sede', -1], ['pau', 'pauta', -1], ['corp', 'gasto corporativo', -1]]
      .map(([k, t, s]) => ({ t, d: (X[k] - ref[k]) * s, raw: X[k] - ref[k] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const p1 = items.slice(0, 3).map(i => i.t + ' ' + (i.raw >= 0 ? '+' : '−') + fM(Math.abs(i.raw)) + (i.d >= 0 ? ' a favor' : ' en contra')).join('; ');
    return '<div class="insight"><h4>Qué explica la diferencia</h4><p>Frente a ' + esc(nref) + ', la utilidad de gestión ' + (X.uai >= ref.uai ? 'mejoró ' : 'empeoró ') + fM(Math.abs(X.uai - ref.uai)) + '. Los movimientos más grandes: ' + p1 + '.</p>' +
      '<p>El margen de contribución pasó de ' + fP(ref.mcP) + ' a ' + fP(X.mcP) + ' y la pauta pesa ' + fP(X.pauP) + ' de las ventas (' + fP(ref.pauP) + ' en la referencia).</p></div>';
  }

  // ------------------------------------------------------------ gráficos SVG
  function chartBarLine(labels, bars, line, opts) {
    const W = 640, H = 300, pl = 52, pr = 10, pt = 14, pb = 34;
    const vals = bars.concat(line).filter(v => v != null);
    let mx = Math.max(0, ...vals), mn = Math.min(0, ...vals);
    if (mx === mn) mx = mn + 1;
    const span = mx - mn; const pad = span * 0.08; mx += pad; if (mn < 0) mn -= pad;
    const y = v => pt + (mx - v) / (mx - mn) * (H - pt - pb);
    const n = labels.length; const bw = (W - pl - pr) / n;
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = mn + (mx - mn) * i / 4; g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="#E4ECF7"/><text x="' + (pl - 8) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" font-size="13" fill="#6B7C93">' + nf0.format(v / 1e6) + '</text>'; }
    g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" stroke="#0D1B2A" stroke-width="1"/>';
    bars.forEach((v, i) => {
      if (v == null) return;
      const x = pl + i * bw + bw * 0.2, w = bw * 0.6, y0 = y(0), yv = y(v);
      g += '<rect x="' + x.toFixed(1) + '" y="' + Math.min(y0, yv).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(1, Math.abs(yv - y0)).toFixed(1) + '" rx="3" fill="' + (v < 0 ? '#DC2626' : '#1565E8') + '"><title>' + labels[i] + ' real: ' + fM(v) + '</title></rect>';
    });
    let d = ''; line.forEach((v, i) => { if (v == null) return; const x = pl + i * bw + bw / 2; d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y(v).toFixed(1); });
    if (d) g += '<path d="' + d + '" fill="none" stroke="#0D1B2A" stroke-width="2" stroke-dasharray="6 5"/>' + line.map((v, i) => v == null ? '' : '<circle cx="' + (pl + i * bw + bw / 2).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.5" fill="#fff" stroke="#0D1B2A" stroke-width="2"><title>' + labels[i] + ' plan: ' + fM(v) + '</title></circle>').join('');
    labels.forEach((l, i) => { g += '<text x="' + (pl + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 14) + '" text-anchor="middle" font-size="12" fill="#2E3D52">' + l + '</text>'; });
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.titulo) + '" font-family="DM Sans, sans-serif">' + g + '</svg></div>' +
      '<div class="legend"><span><i style="background:#1565E8"></i>Real</span><span><i style="background:#fff;border:2px dashed #0D1B2A"></i>' + esc(C.ESCENARIOS[S.esc]) + '</span><span style="color:#6B7C93">Cifras en millones de pesos</span></div>';
  }
  function chartSedes(items) { // [{n, v}]
    const mx = Math.max(1, ...items.map(i => Math.abs(i.v)));
    const hayNeg = items.some(i => i.v < 0), hayPos = items.some(i => i.v > 0);
    const izq = hayNeg && hayPos ? 50 : hayNeg ? 100 : 0;
    return '<div class="hbars">' + items.map(it => {
      const w = Math.abs(it.v) / mx * (hayNeg && hayPos ? 50 : 100), pos = it.v >= 0;
      return '<div class="hb"><span class="hb-n">' + esc(it.n) + '</span><span class="hb-t"><span class="hb-z" style="left:' + izq + '%"></span><span class="hb-b ' + (pos ? 'p' : 'n') + '" style="' + (pos ? 'left:' + izq : 'right:' + (100 - izq)) + '%;width:' + w.toFixed(2) + '%"></span></span><span class="hb-v ' + (pos ? 'up' : 'down') + '">' + nf1.format(it.v / 1e6) + '</span></div>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------ 02 tendencia
  function secTendencia() {
    const ms = meses();
    const lab = ms.map(k => C.keyLabel(k, true));
    const R = ms.map(k => C.real(S.ds, k, S.sede)); const P = ms.map(k => C.plan(S.ds, S.esc, k, S.sede));
    const ytdK = C.mesesReales(S.ds).filter(k => S.ds.plan && C.keyParts(k).y === S.ds.plan.anio);
    let ytd = '';
    if (ytdK.length) {
      const RA = C.acumular(k => C.real(S.ds, k, S.sede), ytdK), PA = C.acumular(k => C.plan(S.ds, S.esc, k, S.sede), ytdK);
      const fila = (t, k, f) => '<tr><td>' + t + '</td><td>' + f(RA[k]) + '</td><td>' + f(PA[k]) + '</td><td>' + (f === fP ? fPP(RA[k] - PA[k]) : varTxt(RA[k], PA[k])) + '</td></tr>';
      ytd = '<div class="card" style="margin-top:20px"><h3>Acumulado ' + S.ds.plan.anio + ' (' + ytdK.length + ' meses con informe)</h3><div class="tw"><table class="t"><tr><th>Concepto</th><th>Real</th><th>Plan</th><th>Variación</th></tr>' +
        fila('Ingresos', 'ing', fM) + fila('Margen de contribución', 'mc', fM) + fila('Margen de contribución %', 'mcP', fP) + fila('Gastos fijos de sede', 'fijos', fM) + fila('Pauta', 'pau', fM) + fila('Utilidad de gestión', 'uai', fM) + '</table></div></div>';
    } else if (S.ds.plan) {
      ytd = '<p class="note" style="margin-top:12px;color:#6B7C93">El acumulado real contra el plan arranca con el informe de enero de ' + S.ds.plan.anio + '. Mientras tanto, la tendencia muestra los meses reales cargados y el plan mes a mes.</p>';
    }
    return '<section class="section" id="s-ten"><p class="eyebrow">' + num() + ' — Tendencia</p><h2>Mes a mes: real frente al plan</h2><div class="divider"></div>' +
      '<div class="grid g2"><div class="card"><h3>Ingresos</h3>' + chartBarLine(lab, R.map(x => x && x.ing), P.map(x => x && x.ing), { titulo: 'Ingresos mensuales' }) + '</div>' +
      '<div class="card"><h3>Utilidad de gestión</h3>' + chartBarLine(lab, R.map(x => x && x.uai), P.map(x => x && x.uai), { titulo: 'Utilidad mensual' }) + '</div></div>' + ytd + '</section>';
  }

  // ------------------------------------------------------------ 03 sedes
  function secSedes() {
    const filas = C.porSede(S.ds, S.mes, S.esc).map(x => Object.assign(x, { X: x.real || x.plan })).filter(x => x.X);
    if (!filas.length) return '';
    const esReal = filas.some(x => x.real);
    filas.sort((a, b) => b.X.uai - a.X.uai);
    const conPlan = esReal && filas.some(x => x.plan);
    const mxU = Math.max(1, ...filas.map(x => Math.abs(x.X.uai)));
    const div = v => '<div class="dbar"><span class="' + (v < 0 ? 'n' : 'p') + '" style="width:' + (Math.abs(v) / mxU * 50).toFixed(1) + '%"></span></div>';
    let rows = filas.map(x => '<tr class="click' + (x.sede === S.sede ? ' sel' : '') + '" data-sede="' + esc(x.sede) + '"><td>' + esc(x.sede) + '</td><td>' + fM(x.X.ing) + '</td><td>' + fP(x.X.mcP) + '</td><td>' + fP(x.X.pauP) + '</td><td class="' + (x.X.con < 0 ? 'neg' : '') + '">' + fM(x.X.con) + '</td><td class="' + (x.X.uai < 0 ? 'neg' : '') + '">' + fM(x.X.uai) + '</td><td class="dcell">' + div(x.X.uai) + '</td><td>' + fP(x.X.uaiP) + '</td>' +
      (conPlan ? '<td>' + fM(x.plan && x.plan.uai) + '</td><td>' + (x.plan ? varTxt(x.real.uai, x.plan.uai) : '—') + '</td>' : '') + '</tr>').join('');
    const T = C.completar(C.sumar(filas.map(x => x.X)));
    rows += '<tr class="tot"><td>Total empresa</td><td>' + fM(T.ing) + '</td><td>' + fP(T.mcP) + '</td><td>' + fP(T.pauP) + '</td><td>' + fM(T.con) + '</td><td class="' + (T.uai < 0 ? 'neg' : '') + '">' + fM(T.uai) + '</td><td></td><td>' + fP(T.uaiP) + '</td>' + (conPlan ? '<td></td><td></td>' : '') + '</tr>';
    const pos = filas.filter(x => x.X.uai > 0), neg = filas.filter(x => x.X.uai < 0);
    const sp = pos.reduce((a, x) => a + x.X.uai, 0), sn = neg.reduce((a, x) => a + x.X.uai, 0);
    return '<section class="section" id="s-sed"><p class="eyebrow">' + num() + ' — Sedes</p><h2>Resultado por sede · ' + nombreMes(S.mes) + (esReal ? '' : ' (plan)') + '</h2><div class="divider"></div>' +
      '<p class="lead">' + pos.length + ' sedes aportan ' + fM(sp) + ' y ' + neg.length + ' restan ' + fM(Math.abs(sn)) + (sp ? ': las sedes en pérdida se comen el ' + nf0.format(Math.abs(sn) / sp * 100) + '% de lo que generan las demás.' : '.') + ' Haga clic en una sede para ver su detalle.</p>' +
      '<div class="card" style="padding:0"><div class="tw"><table class="t compact"><tr><th>Sede</th><th>Ingresos</th><th>MC %</th><th>Pauta %</th><th>Contribución</th><th>Utilidad</th><th class="dcell" style="text-align:center">Pérdida · Utilidad</th><th>Margen</th>' + (conPlan ? '<th>Utilidad plan</th><th>Var.</th>' : '') + '</tr>' + rows + '</table></div></div></section>';
  }

  // ------------------------------------------------------------ 04 gastos
  function secGastos(V) {
    const X = V.R || V.P; if (!X) return '';
    const ref = V.R ? (V.P || V.Rp) : null; const refN = V.R ? (V.P ? 'Plan' : 'Mes anterior') : null;
    const cats = [['personal', 'Personal de sede'], ['arriendo', 'Arriendo'], ['servicios', 'Servicios públicos e internet'], ['mantenimiento', 'Mantenimiento y adecuaciones'], ['otros', 'Otros gastos de sede'], ['iva', 'Provisión IVA'], ['pau', 'Pauta y mercadeo'], ['corp', 'Gasto corporativo asignado'], ['fin', 'Gastos financieros']];
    const mx = Math.max(...cats.map(([k]) => Math.max(X[k] || 0, ref ? ref[k] || 0 : 0)), 1);
    let rows = cats.map(([k, t]) => {
      const w = (X[k] || 0) / mx * 100, wr = ref ? (ref[k] || 0) / mx * 100 : 0;
      return '<tr><td>' + t + '<div style="position:relative;height:8px;margin-top:6px;background:#F4F7FD;border-radius:4px"><div style="position:absolute;left:0;top:0;bottom:0;width:' + w.toFixed(1) + '%;background:#1565E8;border-radius:4px"></div>' +
        (ref ? '<div style="position:absolute;top:-3px;bottom:-3px;left:' + wr.toFixed(1) + '%;width:2px;background:#0D1B2A"></div>' : '') + '</div></td><td>' + fM(X[k]) + '</td><td>' + fP(X.ing ? X[k] / X.ing : null) + '</td>' +
        (ref ? '<td>' + fM(ref[k]) + '</td><td>' + varTxt(X[k], ref[k], 'menos') + '</td>' : '') + '</tr>';
    }).join('');
    const tot = cats.reduce((a, [k]) => a + (X[k] || 0), 0), totr = ref ? cats.reduce((a, [k]) => a + (ref[k] || 0), 0) : null;
    rows += '<tr class="tot"><td>Total gastos</td><td>' + fM(tot) + '</td><td>' + fP(X.ing ? tot / X.ing : null) + '</td>' + (ref ? '<td>' + fM(totr) + '</td><td>' + fM(tot - totr) + '</td>' : '') + '</tr>';
    let top = '';
    const P = S.ds.reales[S.mes];
    if (P && V.R) {
      const idx = S.sede === 'Todas' ? null : C.NOMBRES_SEDES.indexOf(S.sede);
      const lista = P.cuentas.filter(c => c.clase !== 'ing').map(c => ({ c, v: idx == null ? c.v.reduce((a, b) => a + b, 0) : c.v[idx] })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 15);
      const nom = Object.fromEntries(C.LINEAS.map(L => [L.k, L.t])); nom.extra = 'No recurrente'; nom.capex = 'Activos fijos';
      top = '<div class="card"><h3>Cuentas con mayor gasto del mes</h3><div class="tw"><table class="t"><tr><th>Cuenta</th><th>Valor</th><th>% ventas</th></tr>' +
        lista.map(x => '<tr><td>' + esc(x.c.nombre) + '<div class="mini">' + esc(x.c.cta || '') + ' · ' + esc(nom[x.c.clase] || x.c.clase) + '</div></td><td>' + fM(x.v) + '</td><td>' + fP(V.R.ing ? x.v / V.R.ing : null) + '</td></tr>').join('') + '</table></div></div>';
    }
    return '<section class="section" id="s-gas"><p class="eyebrow">' + num() + ' — Gastos</p><h2>Gastos por categoría</h2><div class="divider"></div>' +
      '<div class="grid g2"><div class="card" style="padding:0"><div class="tw"><table class="t"><tr><th>Categoría</th><th>' + (V.R ? 'Real' : 'Plan') + '</th><th>% ventas</th>' + (ref ? '<th>' + refN + '</th><th>Var.</th>' : '') + '</tr>' + rows + '</table></div>' +
      (ref ? '<p class="note" style="padding:0 16px 14px">La línea negra en cada barra marca el valor de referencia (' + refN.toLowerCase() + ').</p>' : '') + '</div>' + (top || '<div></div>') + '</div></section>';
  }

  // ------------------------------------------------------------ 05 plan 2027
  function secPlan() {
    const PL = S.ds.plan; if (!PL) return '';
    const ks = C.mesesPlan(S.ds);
    const anual = e => C.acumular(k => C.plan(S.ds, e, k, S.sede), ks);
    const perdidas = e => C.NOMBRES_SEDES.filter(s => C.acumular(k => C.plan(S.ds, e, k, s), ks).uai < 0).length;
    const cards = Object.entries(C.ESCENARIOS).filter(([e]) => PL.plan[e]).map(([e, t]) => {
      const A = anual(e);
      return '<div class="esc' + (e === S.esc ? ' on' : '') + '"><div class="nm">' + t + '</div><div class="big' + (A.uai < 0 ? ' neg' : '') + '">' + fM(A.uai) + '</div><div style="color:#6B7C93;font-size:13px">Utilidad de gestión ' + PL.anio + ' · ' + fP(A.uaiP) + '</div>' +
        '<dl><dt>Ingresos</dt><dd>' + fM(A.ing) + '</dd><dt>Margen de contribución</dt><dd>' + fP(A.mcP) + '</dd><dt>Pauta</dt><dd>' + fM(A.pau) + '</dd><dt>Punto de equilibrio mensual</dt><dd>' + fM(A.pe / 12) + '</dd><dt>Margen de seguridad</dt><dd>' + fP(A.ms) + '</dd>' +
        (S.sede === 'Todas' ? '<dt>Sedes con pérdida</dt><dd>' + perdidas(e) + '</dd>' : '') + '</dl></div>';
    }).join('');
    const Ms = ks.map(k => C.plan(S.ds, S.esc, k, S.sede));
    const gk = S.esc === 'ajustado' ? 'ajustado' : 'base';
    // grupos nuevos enteros: los del plan; en el presupuesto vigente, los del plan base por el factor de volumen de cada sede, redondeados
    const gSede = (s, i) => S.esc === 'vigente' ? Math.round(((PL.grupos.base[s] || [])[i] || 0) * PL.plan.vigente[s].f) : ((PL.grupos[gk][s] || [])[i] || 0);
    const grupos = i => S.sede === 'Todas' ? C.NOMBRES_SEDES.reduce((a, s) => a + gSede(s, i), 0) : gSede(S.sede, i);
    const fMn = v => v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + nf1.format(Math.abs(v) / 1e6); // $ millones sin símbolo: la tabla cabe sin desplazarse
    const fila = (t, fn, f0, cls) => { const f = f0 === fM ? fMn : f0; return '<tr class="' + (cls || '') + '"><td>' + t + '</td>' + Ms.map((x, i) => { const v = fn(x, i); return '<td class="' + (f0 === fM && v < 0 ? 'neg' : '') + '">' + f(v) + '</td>'; }).join('') + '<td><b>' + (fn === null ? '' : f(fn(C.acumular(k => C.plan(S.ds, S.esc, k, S.sede), ks), -1))) + '</b></td></tr>'; };
    const sumG = Array.from({ length: 12 }, (_, i) => grupos(i)).reduce((a, b) => a + (b || 0), 0);
    const tabla = '<table class="t compact plan-t"><tr><th>' + esc(C.ESCENARIOS[S.esc]) + ' · $ millones</th>' + ks.map(k => '<th>' + C.keyLabel(k, true) + '</th>').join('') + '<th>Año</th></tr>' +
      fila('Ingresos', x => x.ing, fM) + fila('Costos variables', x => x.cv, fM, 'det') + fila('Margen de contribución', x => x.mc, fM, 'sub') + fila('Margen de contribución %', x => x.mcP, fP, 'det') +
      fila('Gastos fijos de sede', x => x.fijos, fM) + fila('Pauta', x => x.pau, fM) + fila('Corporativo y financiero', x => x.corp + x.fin, fM) + fila('Utilidad de gestión', x => x.uai, fM, 'tot') + fila('Margen', x => x.uaiP, fP, 'det') +
      '<tr><td>Grupos nuevos a abrir</td>' + ks.map((k, i) => '<td>' + fN(grupos(i)) + '</td>').join('') + '<td><b>' + fN(sumG) + '</b></td></tr>' +
      '<tr><td>Inscritos nuevos</td>' + Ms.map(x => '<td>' + fN(x.nue) + '</td>').join('') + '<td><b>' + fN(Ms.reduce((a, x) => a + x.nue, 0)) + '</b></td></tr>' +
      '<tr><td>Estudiantes activos</td>' + Ms.map(x => '<td>' + fN(x.act) + '</td>').join('') + '<td><b>' + fN(Ms.reduce((a, x) => a + x.act, 0) / 12) + '</b></td></tr>' +
      '<tr><td>Grupos activos</td>' + Ms.map(x => '<td>' + fN(x.ga) + '</td>').join('') + '<td><b>' + fN(Ms.reduce((a, x) => a + x.ga, 0) / 12) + '</b></td></tr></table>';
    return '<section class="section" id="s-plan"><p class="eyebrow">' + num() + ' — Plan financiero ' + PL.anio + '</p><h2>Escenarios para ' + esc(S.sede === 'Todas' ? 'la empresa' : S.sede) + '</h2><div class="divider"></div>' +
      '<p class="lead">' + (PL.plan.vigente ? 'Presupuesto vigente: plan base recalculado con los parámetros de cada sede (incremento de ' + fP2(S.ds.params.generales.incPrecio) + ' en cuotas y los ajustes de salones, ocupación, kit y gastos cargados en Parámetros). ' : '') + 'Plan base: ocupación histórica de cada sede. Plan ajustado: ocupación necesaria en las sedes críticas para llegar al margen meta de ' + fP2(PL.meta) + '. Sin kit y sin aumento: el plan base sin el 5% de aumento de precio y sin el costo del kit. Los grupos a abrir son números enteros.</p>' +
      '<div class="grid g4">' + cards + '</div><div class="card" style="margin-top:20px;padding:0"><div class="tw">' + tabla + '</div></div></section>';
  }

  // ------------------------------------------------------------ 06 sedes críticas
  function secCriticas() {
    const PL = S.ds.plan; if (!PL) return '';
    const ks = C.mesesPlan(S.ds);
    const crit = C.NOMBRES_SEDES.filter(s => PL.criticas[s] && PL.criticas[s].critica);
    const lista = (S.sede === 'Todas' ? crit : crit.filter(s => s === S.sede));
    if (!lista.length) return S.sede === 'Todas' ? '' : '<section class="section" id="s-cri"><p class="eyebrow">' + num() + ' — Sedes críticas</p><h2>' + esc(S.sede) + ' no es sede crítica</h2><div class="divider"></div><p class="lead">En el plan base esta sede tiene utilidad positiva.</p></section>';
    const u = (e, s) => C.acumular(k => C.plan(S.ds, e, k, s), ks).uai;
    const rows = lista.map(s => ({ s, c: PL.criticas[s], ub: u('base', s), ua: u('ajustado', s) })).sort((a, b) => a.ub - b.ub).map(x =>
      '<tr class="click" data-sede="' + esc(x.s) + '"><td><b>' + esc(x.s) + '</b></td><td>' + fP(x.c.ocupBase) + ' → ' + fP(x.c.ocupAj) + '</td><td>' + fN(x.c.inscMesReq) + ' vs ' + fN(x.c.inscMesHist) + '</td><td class="neg">' + fM(x.ub) + '</td><td class="' + (x.ua < 0 ? 'neg' : 'pos') + '">' + fM(x.ua) + '</td><td style="text-align:left;white-space:normal;min-width:320px;font-size:13px">' + esc(x.c.accion || '') + '</td></tr>').join('');
    return '<section class="section" id="s-cri"><p class="eyebrow">' + num() + ' — Sedes críticas</p><h2>Qué tiene que cambiar para llegar a ' + fP2(PL.meta) + ' de margen</h2><div class="divider"></div>' +
      '<p class="lead">Sedes con utilidad negativa en el plan base. Ocupación de franjas base → ajustada, inscritos por mes que requiere el ajuste frente a 2026, y la acción sugerida.</p>' +
      '<div class="card" style="padding:0"><div class="tw"><table class="t"><tr><th>Sede</th><th>Ocupación</th><th>Inscritos/mes vs 2026</th><th>Utilidad base</th><th>Utilidad ajustada</th><th style="text-align:left">Qué hacer</th></tr>' + rows + '</table></div></div></section>';
  }

  // ------------------------------------------------------------ 02 capacidad y ocupación
  const fPesos = v => v == null || isNaN(v) ? '—' : (v < 0 ? '−$' : '$') + nf0.format(Math.abs(Math.round(v)));
  const barra = (v, max, cls) => '<div class="mbar"><i class="' + (cls || '') + '" style="width:' + Math.max(0, Math.min(100, (v || 0) / (max || 1) * 100)).toFixed(1) + '%"></i></div>';
  const nombreCurso = Object.fromEntries(C.CURSOS);
  function secCapacidad() {
    if (!S.ds.params) return '';
    const G = S.ds.params.generales, T = C.capacidad(S.ds, S.sede);
    const filas = C.NOMBRES_SEDES.map(s => ({ s, c: C.capacidad(S.ds, s), p: S.ds.params.sedes[s] })).sort((a, b) => b.c.ocupFranjas - a.c.ocupFranjas);
    const sinHab = filas.filter(x => x.p.salonesPosibles > x.p.salones);
    let txt;
    if (S.sede === 'Todas') {
      const bajas = filas.slice(-4).reverse();
      txt = 'La empresa opera <b>' + fN(T.salones) + ' salones</b> en 24 sedes, que equivalen a <b>' + fN(T.franjas) + ' franjas</b> semanales (' + G.franjasSalon + ' por salón; cada franja aloja un grupo durante todo el curso) y a ' + fN(T.cupos) + ' cupos con grupos de ' + G.cupo + '. ' +
        'Hoy hay <b>' + fN(T.grupos) + ' grupos activos</b>, una ocupación de <b>' + fP(T.ocupFranjas) + '</b> de las franjas, y <b>' + fN(T.estudiantes) + ' estudiantes activos</b>, el ' + fP(T.ocupCupos) + ' de los cupos. ' +
        'Antes del tope operativo de ' + fP(G.topeOcupacion) + ' se pueden habilitar <b>' + fN(T.habilitables) + ' grupos más</b> en los salones actuales' +
        (sinHab.length ? ', y hay ' + fN(sinHab.reduce((a, x) => a + x.p.salonesPosibles - x.p.salones, 0)) + ' salones posibles sin habilitar (' + sinHab.map(x => esc(x.s) + ' ' + x.p.salones + ' de ' + x.p.salonesPosibles).join(', ') + ').' : '.') +
        ' Las sedes con menor ocupación son ' + bajas.map(x => esc(x.s) + ' (' + fP(x.c.ocupFranjas) + ')').join(', ') + '.';
    } else {
      const p = S.ds.params.sedes[S.sede];
      txt = esc(S.sede) + ' tiene <b>' + T.salones + ' salones</b>' + (T.salonesPosibles > T.salones ? ' habilitados de ' + T.salonesPosibles + ' posibles' : '') + ', ' + fN(T.franjas) + ' franjas y ' + fN(T.cupos) + ' cupos. Hoy tiene <b>' + fN(T.grupos) + ' grupos activos</b> (ocupación de ' + fP(T.ocupFranjas) + ') y <b>' + fN(T.estudiantes) + ' estudiantes activos</b> (' + fP(T.ocupCupos) + ' de los cupos). ' +
        'Puede habilitar ' + fN(T.habilitables) + ' grupos más antes del tope de ' + fP(G.topeOcupacion) + '. La deserción histórica es ' + fP(T.desercion) + ' y el costo de adquisición por inscrito es ' + fPesos(T.cac) + '.' +
        (p.salonesPlan !== p.salones ? ' En el presupuesto vigente opera con ' + p.salonesPlan + ' salones.' : '') + (p.nota ? '</p><p>' + esc(p.nota) : '');
    }
    const mxE = Math.max(...C.CURSOS.map(([c]) => T.cursos[c].estudiantes), 1);
    const cursos = C.CURSOS.map(([c, n]) => { const x = T.cursos[c]; return x.grupos || x.programados ? '<tr><td>' + n + barra(x.estudiantes, mxE) + '</td><td>' + fN(x.grupos) + '</td><td>' + fN(x.estudiantes) + '</td><td>' + (x.grupos ? nf1.format(x.estudiantes / x.grupos) : '—') + '</td><td>' + fN(x.programados) + '</td></tr>' : ''; }).join('');
    const rows = filas.map(x => { const c = x.c; return '<tr class="click' + (x.s === S.sede ? ' sel' : '') + '" data-sede="' + esc(x.s) + '"><td>' + esc(x.s) + '</td><td>' + c.salones + (c.salonesPosibles > c.salones ? '<span class="mini-in"> de ' + c.salonesPosibles + '</span>' : '') + '</td><td>' + fN(c.franjas) + '</td><td>' + fN(c.cupos) + '</td><td>' + fN(c.grupos) + '</td><td>' + fN(c.estudiantes) + '</td><td class="' + (c.ocupFranjas < 0.35 ? 'neg' : '') + '">' + fP(c.ocupFranjas) + barra(c.ocupFranjas, 1, c.ocupFranjas < 0.35 ? 'r' : '') + '</td><td>' + fP(c.ocupCupos) + '</td><td>' + fN(c.habilitables) + '</td><td>' + fP(c.desercion) + '</td><td>' + fPesos(c.cac) + '</td></tr>'; }).join('');
    const E = C.capacidad(S.ds, 'Todas');
    const tot = '<tr class="tot"><td>Total empresa</td><td>' + fN(E.salones) + '</td><td>' + fN(E.franjas) + '</td><td>' + fN(E.cupos) + '</td><td>' + fN(E.grupos) + '</td><td>' + fN(E.estudiantes) + '</td><td>' + fP(E.ocupFranjas) + '</td><td>' + fP(E.ocupCupos) + '</td><td>' + fN(E.habilitables) + '</td><td>' + fP(E.desercion) + '</td><td>' + fPesos(E.cac) + '</td></tr>';
    return '<section class="section" id="s-cap"><p class="eyebrow">' + num() + ' — Capacidad y ocupación</p><h2>Salones, grupos, estudiantes y cursos</h2><div class="divider"></div>' +
      '<div class="insight" style="margin-bottom:20px"><h4>Lectura</h4><p>' + txt + '</p></div>' +
      '<div class="card" style="padding:0;margin-bottom:20px"><div class="tw"><table class="t compact"><tr><th>Sede</th><th>Salones</th><th>Franjas</th><th>Cupos</th><th>Grupos activos</th><th>Estudiantes activos</th><th>Ocup. franjas</th><th>Ocup. cupos</th><th>Grupos habilitables</th><th>Deserción</th><th>CAC</th></tr>' + rows + tot + '</table></div></div>' +
      '<div class="grid g2 g2-ancho"><div class="card"><h3>Cursos asignados · ' + esc(S.sede === 'Todas' ? 'empresa' : S.sede) + '</h3><div class="tw"><table class="t"><tr><th>Curso</th><th>Grupos</th><th>Estudiantes</th><th>Est./grupo</th><th>Programados dic-ene</th></tr>' + cursos +
      '<tr class="tot"><td>Total</td><td>' + fN(T.gruposCursos) + '</td><td>' + fN(T.estCursos) + '</td><td>' + (T.gruposCursos ? nf1.format(T.estCursos / T.gruposCursos) : '—') + '</td><td>' + fN(T.programados) + '</td></tr></table></div>' +
      '<p class="note">Grupos activos y ocupación: grupos simultáneos de octubre de 2026. Estudiantes activos: estado Activo en Power BI (corte ' + esc(G.corteOperativo) + '). Cursos: grupos iniciados entre julio y noviembre. Grupos habilitables: franjas hasta el tope de ' + fP(G.topeOcupacion) + ' menos grupos activos. Todo se edita en Parámetros.</p></div>' + salonesCard() + '</div></section>';
  }

  // ------------------------------------------------------------ detalle por curso
  function secCursos() {
    if (!S.ds.params || !S.ds.params.cursosInfo) return '';
    const D = C.cursosDetalle(S.ds, S.sede, S.mes), T = D.T, F = D.filas.filter(x => x.grupos || x.insc);
    if (!F.length) return '';
    const porRend = F.filter(x => x.grupos >= 2).slice().sort((a, b) => a.rendimiento - b.rendimiento);
    const top = F.slice().sort((a, b) => b.pesoGrupos - a.pesoGrupos)[0], baja = porRend[0], alta = porRend[porRend.length - 1];
    const llen = F.filter(x => x.grupos >= 2).sort((a, b) => a.llenado - b.llenado)[0];
    let txt = esc(S.sede === 'Todas' ? 'En la empresa' : 'En ' + S.sede) + ' hay ' + fN(T.grupos) + ' grupos activos con ' + fN(T.est) + ' estudiantes, un llenado de ' + fP(T.llenado) + ' de los cupos de esos grupos. ' +
      esc(top.nombre) + ' es el curso que más espacio usa: ' + fP(top.pesoGrupos) + ' de los grupos y ' + fP(top.pctFranjas) + ' de las franjas, y aporta ' + fP(top.pesoIng) + ' del ingreso estimado. ';
    if (baja && alta && baja !== alta && baja.rendimiento < 0.95) txt += 'Por cada punto de espacio que ocupa, ' + esc(alta.nombre) + ' devuelve ' + nf1.format(alta.rendimiento) + ' puntos de ingreso y ' + esc(baja.nombre) + ' solo ' + nf1.format(baja.rendimiento) + ': ' + esc(baja.nombre) + ' ocupa más espacio del que pesa en ingresos. ';
    else if (alta) txt += 'Todos los cursos aportan ingresos en proporción parecida al espacio que ocupan; el de mejor rendimiento es ' + esc(alta.nombre) + ' (' + nf1.format(alta.rendimiento) + 'x). ';
    if (llen) txt += 'El llenado más bajo es el de ' + esc(llen.nombre) + ' (' + fP(llen.llenado) + ', ' + nf1.format(llen.est / llen.grupos) + ' estudiantes por grupo de ' + llen.cupo + ').';
    if (T.hayMes) txt += '</p><p>En ' + C.keyLabel(S.mes) + ' iniciaron ' + fN(T.gMes) + ' grupos con ' + fN(T.insc) + ' inscritos' + (T.inscripcionesMes != null ? ' (las inscripciones totales del mes fueron ' + fN(T.inscripcionesMes) + ')' : '') + '.';
    const mx = Math.max(...F.map(x => Math.max(x.pesoGrupos, x.pesoIng)), 0.01);
    const filas = F.map(x => '<tr><td><b>' + esc(x.nombre) + '</b><div class="duo"><span class="dg" style="width:' + (x.pesoGrupos / mx * 100).toFixed(1) + '%"></span></div><div class="duo"><span class="di" style="width:' + (x.pesoIng / mx * 100).toFixed(1) + '%"></span></div></td>' +
      '<td>' + fN(x.grupos) + '</td><td>' + fN(x.est) + '</td><td class="' + (x.llenado != null && x.llenado < 0.55 ? 'neg' : '') + '">' + fP(x.llenado) + '<div class="mini">' + (x.grupos ? nf1.format(x.est / x.grupos) + ' por grupo' : '') + '</div></td><td>' + fP(x.pctFranjas) + '</td>' +
      '<td>' + fP(x.pesoGrupos) + '</td><td>' + fP(x.pesoIng) + '</td><td class="' + (x.rendimiento == null ? '' : x.rendimiento < 0.9 ? 'neg' : x.rendimiento > 1.05 ? 'pos' : '') + '">' + (x.rendimiento == null ? '—' : nf1.format(x.rendimiento).replace(/,0$/, ',0') + 'x') + '</td>' +
      '</tr>').join('');
    const tot = '<tr class="tot"><td>Total</td><td>' + fN(T.grupos) + '</td><td>' + fN(T.est) + '</td><td>' + fP(T.llenado) + '</td><td>' + fP(T.pctFranjas) + '</td><td>100%</td><td>100%</td><td>1,0x</td></tr>';
    const mesCard = T.hayMes ? '<div class="card" style="padding:0"><div style="padding:18px 20px 6px"><h3 style="margin:0">Inscritos de ' + esc(C.keyLabel(S.mes)) + '</h3><p class="note" style="margin:4px 0 10px">Estudiantes de los grupos que iniciaron en el mes' + (T.inscripcionesMes != null ? '; inscripciones totales del mes: ' + fN(T.inscripcionesMes) : '') + '.</p></div><div class="tw"><table class="t compact"><tr><th>Curso</th><th>Grupos iniciados</th><th>Inscritos</th><th>Por grupo</th><th>Peso en inscritos</th><th>Peso en grupos activos</th></tr>' +
      F.map(x => '<tr><td>' + esc(x.nombre) + '</td><td>' + fN(x.gMes) + '</td><td>' + fN(x.insc) + '</td><td>' + (x.gMes ? nf1.format(x.insc / x.gMes) : '—') + '</td><td>' + fP(x.pesoInsc) + '</td><td>' + fP(x.pesoGrupos) + '</td></tr>').join('') +
      '<tr class="tot"><td>Total</td><td>' + fN(T.gMes) + '</td><td>' + fN(T.insc) + '</td><td>' + (T.gMes ? nf1.format(T.insc / T.gMes) : '—') + '</td><td>100%</td><td>100%</td></tr></table></div></div>' : '';
    // matriz sede × curso
    let matriz = '';
    if (S.sede === 'Todas') {
      const usar = T.hayMes ? 'insc' : 'est';
      const cols = F.map(x => x.c);
      const rows = C.NOMBRES_SEDES.map(s => ({ s, d: C.cursosDetalle(S.ds, s, S.mes) })).map(({ s, d }) => {
        const by = Object.fromEntries(d.filas.map(x => [x.c, x])), tot = d.T[usar === 'insc' ? 'insc' : 'est'];
        return '<tr class="click" data-sede="' + esc(s) + '"><td>' + esc(s) + '</td>' + cols.map(c => { const v = by[c][usar], sh = tot ? v / tot : 0; return '<td><span class="cel" style="background:rgba(21,101,232,' + (0.06 + sh * 0.9).toFixed(2) + ')">' + fN(v) + '</span></td>'; }).join('') + '<td><b>' + fN(tot) + '</b></td><td>' + fP(d.T.llenado) + '</td></tr>';
      }).join('');
      matriz = '<div class="card" style="padding:0;margin-top:20px"><div style="padding:18px 20px 6px"><h3 style="margin:0">' + (T.hayMes ? 'Inscritos de ' + C.keyLabel(S.mes) + ' por sede y curso' : 'Estudiantes activos por sede y curso') + '</h3><p class="note" style="margin:4px 0 10px">La intensidad del color muestra cuánto pesa cada curso dentro de la sede.</p></div><div class="tw"><table class="t compact"><tr><th>Sede</th>' + F.map(x => '<th>' + esc(x.nombre) + '</th>').join('') + '<th>Total</th><th>Llenado</th></tr>' + rows + '</table></div></div>';
    }
    return '<section class="section" id="s-cur"><p class="eyebrow">' + num() + ' — Detalle por curso</p><h2>Cursos: inscritos, ocupación y peso en ingresos</h2><div class="divider"></div>' +
      '<div class="insight" style="margin-bottom:20px"><h4>Lectura</h4><p>' + txt + '</p></div>' +
      '<div class="card cursos-t" style="padding:0"><div class="tw"><table class="t compact"><tr><th>Curso</th><th>Grupos activos</th><th>Estudiantes</th><th>Llenado de cupos</th><th>% de franjas</th><th>Peso en grupos</th><th>Peso en ingresos</th><th>Rendimiento</th></tr>' + filas + tot + '</table></div>' +
      '<div class="legend" style="padding:0 16px 14px"><span><i style="background:#0D1B2A"></i>Peso en grupos (espacio que usa)</span><span><i style="background:#1565E8"></i>Peso en ingresos estimado</span></div></div>' + (mesCard ? '<div style="margin-top:20px">' + mesCard + '</div>' : '') + matriz +
      '<p class="note" style="color:#6B7C93">Llenado de cupos: estudiantes ÷ (grupos × cupo de ' + (S.ds.params.generales.cupo) + '). % de franjas: la ocupación de franjas de la sede repartida según la mezcla de grupos. Peso en ingresos: estudiantes activos × precio de lista ÷ duración del curso (estimado; el informe a socios no separa ingresos por curso). Rendimiento del espacio: peso en ingresos ÷ peso en grupos; menos de 1,0x significa que el curso ocupa más espacio del que aporta. Grupos y estudiantes activos: grupos iniciados de julio a noviembre de 2026; inscritos del mes: estudiantes de los grupos que iniciaron en el mes. Se actualizan en Parámetros.</p></section>';
  }

  function salonesCard() {
    const G = S.ds.params.generales, P = S.ds.params.sedes;
    const lista = (S.sede === 'Todas' ? C.NOMBRES_SEDES : [S.sede]).map(s => ({ s, p: P[s], c: C.capacidad(S.ds, s) }));
    const rows = lista.filter(x => S.sede !== 'Todas' || x.p.salonesPosibles > x.p.salones || x.p.salonesPlan !== x.p.salones || x.c.habilitables >= 30).sort((a, b) => b.c.habilitables - a.c.habilitables).map(x =>
      '<tr><td>' + esc(x.s) + '</td><td>' + x.p.salones + '</td><td>' + x.p.salonesPlan + '</td><td>' + x.p.salonesPosibles + '</td><td>' + fN(x.c.habilitables) + '</td><td>' + fN((x.p.salonesPosibles - x.p.salones) * G.franjasSalon) + '</td></tr>').join('');
    return '<div class="card"><h3>Salones: hoy, plan 2027 y posibles</h3><div class="tw"><table class="t"><tr><th>Sede</th><th>Hoy</th><th>2027</th><th>Posibles</th><th>Habilitables</th><th>Franjas extra</th></tr>' + (rows || '<tr><td colspan="6">Sin cambios de salones.</td></tr>') + '</table></div>' +
      '<p class="note">' + (S.sede === 'Todas' ? 'Sedes con salones por habilitar, cambios de salones en 2027 o 30 grupos habilitables o más. ' : '') + 'Grupos habilitables: capacidad libre en los salones actuales hasta el tope de ' + fP(G.topeOcupacion) + '. Franjas extra: espacio adicional si se habilitan los salones posibles.</p></div>';
  }

  // ------------------------------------------------------------ 03 presupuesto vs ejecución
  function secPresupuesto(V) {
    if (!S.ds.params) return '';
    const B = C.presupuestoMes(S.ds, S.mes, S.sede), X = V.R;
    if (!B) return '';
    const L = [['ing', 'Ingresos netos', 1], ['cv', 'Costos variables directos', -1], ['bon', 'Bonificaciones e impuestos', -1]]
      .concat(C.LINEAS_FIJAS.map(([k, t]) => [k, t, -1, 'det'])).concat([['fijos', 'Gastos fijos de sede', -1, 'sub'], ['pau', 'Pauta y mercadeo', -1], ['corp', 'Gasto corporativo asignado', -1], ['fin', 'Gastos financieros', -1], ['gastos', 'Total gastos de operación', -1, 'sub'], ['uai', 'Utilidad de gestión', 1, 'tot']]);
    const solo = new Set(['ing', 'cv', 'bon', 'uai']);
    const rows = L.filter(([k]) => !(B.promedio && X && solo.has(k))).map(([k, t, sg, cls]) => {
      const b = B[k], r = X ? X[k] : null;
      if (!X) return '<tr class="' + (cls || '') + '"><td>' + t + '</td><td>' + fM(b) + '</td><td>' + fP(B.ing ? b / B.ing : null) + '</td></tr>';
      const d = r - b, ej = b ? r / Math.abs(b) : null, mal = sg > 0 ? d < 0 : d > 0, sig = Math.abs(d) > Math.abs(b) * 0.02 && Math.abs(d) > 1e6;
      return '<tr class="' + (cls || '') + '"><td>' + t + '</td><td>' + fM(b) + '</td><td>' + fM(r) + '</td><td>' + (k === 'uai' ? '—' : fP(ej)) + '</td><td class="' + (sig ? (mal ? 'neg' : 'pos') : '') + '">' + (d >= 0 ? '+' : '') + fM(d) + '</td></tr>';
    }).join('');
    const head = X ? '<tr><th>Concepto</th><th>Presupuesto</th><th>Real</th><th>Ejecución</th><th>Desviación</th></tr>' : '<tr><th>Concepto</th><th>Presupuesto</th><th>% ventas</th></tr>';
    let txt;
    if (X) {
      const dg = X.gastos - B.gastos, df = X.fijos - B.fijos;
      const peor = C.LINEAS_FIJAS.concat([['pau', 'pauta'], ['corp', 'corporativo']]).map(([k, t]) => ({ t: t.toLowerCase(), d: X[k] - B[k] })).sort((a, b) => b.d - a.d)[0];
      txt = 'En ' + C.keyLabel(S.mes) + ' ' + esc(sedeTxt()) + ' ejecutó <b>' + fM(X.gastos) + '</b> en gastos de operación frente a un presupuesto de ' + fM(B.gastos) + ' (' + fP(X.gastos / B.gastos) + ' de ejecución, ' + (dg >= 0 ? fM(dg) + ' por encima' : fM(-dg) + ' por debajo') + '). ' +
        'Los gastos fijos de sede quedaron en ' + fM(X.fijos) + ' contra ' + fM(B.fijos) + ' presupuestados' + (peor.d > 0 ? ', y el mayor sobrecosto está en ' + esc(peor.t) + ' (+' + fM(peor.d) + ')' : '') + '. ' +
        (B.promedio ? 'Como el presupuesto vigente es de 2027, en este mes se compara solo el gasto: los fijos contra el presupuesto mensual de cada sede y la pauta, el corporativo y los financieros contra el promedio mensual de 2027. Ingresos y utilidad se comparan desde enero de 2027.' : 'Los ingresos llegaron a ' + fP(X.ing / B.ing) + ' de la meta (' + fM(X.ing) + ' de ' + fM(B.ing) + ') y la utilidad de gestión fue ' + fM(X.uai) + ' contra ' + fM(B.uai) + ' presupuestados.');
    } else {
      txt = 'Aún no hay informe real de ' + C.keyLabel(S.mes) + '. El presupuesto vigente para ' + esc(sedeTxt()) + ' es de ' + fM(B.gastos) + ' en gastos de operación (' + fM(B.fijos) + ' fijos de sede y ' + fM(B.pau) + ' de pauta) con una meta de ingresos de ' + fM(B.ing) + '.';
    }
    let porSede = '';
    if (X && S.sede === 'Todas') {
      const fs = C.NOMBRES_SEDES.map(s => ({ s, b: C.presupuestoMes(S.ds, S.mes, s), r: C.real(S.ds, S.mes, s) })).filter(x => x.r);
      fs.sort((a, b) => (b.r.fijos / b.b.fijos) - (a.r.fijos / a.b.fijos));
      porSede = '<div class="card" style="padding:0;margin-top:20px"><div class="tw"><table class="t compact"><tr><th>Sede</th><th>Fijos presup.</th><th>Fijos real</th><th>Ejec. fijos</th><th>Arriendo presup.</th><th>Arriendo real</th><th>Pauta presup.</th><th>Pauta real</th><th>Ejec. pauta</th>' + (B.promedio ? '' : '<th>Utilidad presup.</th><th>Utilidad real</th>') + '</tr>' +
        fs.map(x => { const ef = x.r.fijos / x.b.fijos, ep = x.b.pau ? x.r.pau / x.b.pau : null; return '<tr class="click" data-sede="' + esc(x.s) + '"><td>' + esc(x.s) + '</td><td>' + fM(x.b.fijos) + '</td><td>' + fM(x.r.fijos) + '</td><td class="' + (ef > 1.05 ? 'neg' : ef < 0.95 ? 'pos' : '') + '">' + fP(ef) + '</td><td>' + fM(x.b.arriendo) + '</td><td>' + fM(x.r.arriendo) + '</td><td>' + fM(x.b.pau) + '</td><td>' + fM(x.r.pau) + '</td><td class="' + (ep > 1.05 ? 'neg' : ep < 0.95 ? 'pos' : '') + '">' + fP(ep) + '</td>' + (B.promedio ? '' : '<td class="' + (x.b.uai < 0 ? 'neg' : '') + '">' + fM(x.b.uai) + '</td><td class="' + (x.r.uai < 0 ? 'neg' : '') + '">' + fM(x.r.uai) + '</td>') + '</tr>'; }).join('') + '</table></div></div>' +
        '<p class="note" style="color:#6B7C93">Una ejecución muy baja en arriendo (Pereira Centro, Pereira Batallón, Cali Tequendama) indica que el arriendo del mes no quedó causado en la sede en el informe a socios; el presupuesto usa el arriendo corregido del plan. Barrancabermeja ya tiene en su presupuesto los recortes acordados, por eso su ejecución de septiembre supera el 100%.</p>';
    }
    return '<section class="section" id="s-pre"><p class="eyebrow">' + num() + ' — Presupuesto vs ejecución</p><h2>Presupuesto de gastos y ejecución real · ' + nombreMes(S.mes) + '</h2><div class="divider"></div>' +
      '<p class="lead">El presupuesto vigente sale de los parámetros: el presupuesto mensual de fijos de cada sede, la pauta según inscritos y costo de adquisición, y las decisiones del 19 de noviembre. Se edita en Parámetros.</p>' +
      '<div class="grid g-side"><div class="card" style="padding:0"><div class="tw"><table class="t">' + head + rows + '</table></div></div><div class="insight"><h4>Lectura</h4><p>' + txt + '</p></div></div>' + porSede + '</section>';
  }

  // ------------------------------------------------------------ sedes nuevas e inversión
  function secNuevas() {
    if (!S.ds.params) return '';
    const G = S.ds.params.generales, P = S.ds.params.sedes;
    const lista = C.NOMBRES_SEDES.filter(s => (P[s].nueva || P[s].evaluar) && (S.sede === 'Todas' || S.sede === s));
    const reales = C.mesesReales(S.ds);
    const filas = lista.map(s => {
      const p = P[s], e = C.evaluarInversion(S.ds, s), cap = C.capacidad(S.ds, s), meses = C.mesesDesde(p.apertura, G.corteOperativo);
      const perdReal = reales.filter(k => { const r = C.real(S.ds, k, s); return r && r.uai < 0; }).length;
      let est, cls;
      if (e.uaiAnual >= 0 && e.vpn >= 0) { est = 'Rentable: supera el ' + fP(G.tasaDescuento) + ' del CDT'; cls = 'green'; }
      else if (p.nueva && meses != null && meses < G.plazoMaxPerdida) { est = 'En maduración (' + meses + ' de ' + G.plazoMaxPerdida + ' meses de plazo)'; cls = 'blue'; }
      else if (e.uaiAnual >= 0) { est = 'Utilidad positiva, no alcanza el ' + fP(G.tasaDescuento) + ' del CDT'; cls = 'blue'; }
      else { est = 'En pérdida' + (meses != null ? ' con ' + meses + ' meses' : '') + ': decidir reestructurar o cerrar'; cls = 'red'; }
      return { s, p, e, cap, meses, perdReal, est, cls };
    });
    const rows = filas.map(x => '<tr class="click" data-sede="' + esc(x.s) + '"><td><b>' + esc(x.s) + '</b>' + (x.p.apertura ? '<div class="mini">Apertura ' + esc(C.keyLabel(x.p.apertura, true)) + ' · ' + x.meses + ' meses</div>' : '<div class="mini">Sede existente</div>') + '<div style="margin-top:4px"><span class="tag ' + x.cls + '">' + esc(x.est) + '</span></div></td><td>' + fP(x.cap.ocupFranjas) + '</td><td>' + (x.e.total ? fM(x.e.total) + '<div class="mini">' + fM(x.e.inversion) + ' + ' + fM(x.e.capTrabajo) + ' cap. trabajo</div>' : '—') + '</td><td class="' + (x.e.uaiAnual < 0 ? 'neg' : '') + '">' + fM(x.e.uaiAnual) + '</td><td class="' + (x.e.uaiPleno < 0 ? 'neg' : '') + '">' + fM(x.e.uaiPleno) + '</td><td>' + x.e.mesesNeg + '</td><td>' + (!x.e.total ? '—' : x.e.payback ? x.e.payback + ' meses' : 'No recupera') + '</td><td class="' + (x.e.vpn < 0 ? 'neg' : 'pos') + '">' + fM(x.e.vpn) + '</td><td>' + (x.e.tir == null ? '—' : fP(x.e.tir)) + '</td></tr>').join('');
    // criterio de expansión para todas las sedes
    const aptas = C.NOMBRES_SEDES.map(s => ({ s, c: C.capacidad(S.ds, s), m: C.mesesDesde(P[s].apertura, G.corteOperativo) })).filter(x => x.c.ocupFranjas >= G.ocupExpansion);
    const expTxt = aptas.length ? aptas.map(x => esc(x.s) + ' (' + fP(x.c.ocupFranjas) + (x.m != null && x.m < G.mesesMaduracion ? ', lleva ' + x.m + ' meses: aún no cumple la maduración' : ', cumple') + ')').join('; ') : 'ninguna sede';
    const capT = filas.filter(x => x.p.nueva).reduce((a, x) => a + x.e.capTrabajo, 0);
    return '<section class="section" id="s-nue"><p class="eyebrow">' + num() + ' — Sedes nuevas e inversión</p><h2>Inversión inicial, capital de trabajo y retorno</h2><div class="divider"></div>' +
      '<div class="insight" style="margin-bottom:20px"><h4>Reglas acordadas el 19 de noviembre</h4><p>La apertura de una sede se registra como <b>inversión</b>, no como gasto de operación, para no castigar la utilidad de la empresa. La inversión incluye montaje, pauta de lanzamiento y un capital de trabajo de <b>' + G.mesesCapitalTrabajo + ' meses de gastos fijos</b> para sostener la sede mientras llega al punto de equilibrio; en las sedes nuevas de esta tabla suma ' + fM(capT) + '. ' +
      'Una sede en pérdida tiene un plazo máximo de <b>' + G.plazoMaxPerdida + ' meses</b> antes de decidir si se reestructura o se cierra. Solo se abre otra sede en la misma zona cuando la existente llega a ' + fP(G.ocupExpansion) + ' de ocupación y tiene ' + G.mesesMaduracion + ' meses de maduración. Hoy superan ese nivel de ocupación: ' + expTxt + '.</p>' +
      '<p>Cada sede se evalúa contra un CDT de ' + fP(G.tasaDescuento) + ' efectivo anual, con flujos mensuales a ' + G.horizonteMeses + ' meses: el primer año sale del presupuesto vigente 2027 y los siguientes de la sede con la ocupación objetivo ya alcanzada; el capital de trabajo se recupera al final.</p></div>' +
      '<div class="card" style="padding:0"><div class="tw"><table class="t compact"><tr><th>Sede</th><th>Ocupación hoy</th><th>Inversión total</th><th>Utilidad 2027</th><th>Utilidad año pleno</th><th>Meses en pérdida 2027</th><th>Recuperación</th><th>VPN ' + fP(G.tasaDescuento) + '</th><th>TIR anual</th></tr>' + (rows || '<tr><td colspan="9">No hay sedes marcadas como nuevas o para evaluar.</td></tr>') + '</table></div></div>' +
      '<p class="note" style="color:#6B7C93">La inversión inicial se toma de Parámetros (referencia de la reunión: $100M por sede nueva); reemplácela por el valor real de montaje de cada sede. Barrancabermeja y Sincelejo se evalúan como sedes existentes, sin inversión inicial ni capital de trabajo: su VPN es el valor de seguir operando con el presupuesto vigente.</p></section>';
  }

  // ------------------------------------------------------------ decisiones de la reunión
  function secDecisiones() {
    if (!S.ds.params) return '';
    const ks = C.mesesPlan(S.ds), P = S.ds.params.sedes, G = S.ds.params.generales;
    const A = (e, s) => C.acumular(k => C.plan(S.ds, e, k, s), ks);
    const d = s => { const b = A('base', s), v = A('vigente', s); return 'pasa de ' + fM(b.uai) + ' a <b>' + fM(v.uai) + '</b> de utilidad en 2027'; };
    const bT = A('base', 'Todas'), vT = A('vigente', 'Todas');
    const items = [
      ['Incremento de precio en las cuotas', 'La inscripción se mantiene en $199.000 y el aumento va en las cuotas mensuales: unos $50.000 sobre un curso de $1.200.000, un incremento efectivo de ' + fP2(G.incPrecio) + ' en lugar de ' + fP2(G.incPrecioBase) + '. El área de gestión puede usar descuentos de $10.000 por cuota para retener estudiantes.'],
      ['Barrancabermeja: reestructurar fijos', 'Se entregan 2 de 4 salones, se paga media renta y medios servicios y sale una persona de la nómina. Con los mismos grupos en 2 salones la ocupación pasa de 36% a ' + fP(P['Barrancabermeja'].ocupPlan) + '. La sede ' + d('Barrancabermeja') + '; sigue en pérdida por la pauta (19% de las ventas contra 12% de la empresa).'],
      ['Sincelejo: sin kit y sin aumento', 'Se elimina el kit y se mantiene el precio para subir la ocupación de 30% a ' + fP(P['Sincelejo'].ocupPlan) + '. La sede ' + d('Sincelejo') + '.'],
      ['Venecia y Zipaquirá a 60% de ocupación', 'Venecia ' + d('Venecia') + ' con 2 salones (el arriendo pesa sobre solo 2 de 6 salones posibles); Zipaquirá ' + d('Zipaquirá') + '. Jefferson Gómez revisa habilitar 3 salones más en Venecia.'],
      ['Capital de trabajo y criterios de apertura', 'Cada sede nueva lleva en su inversión inicial ' + G.mesesCapitalTrabajo + ' meses de gastos fijos como capital de trabajo, y solo se abre otra sede en la zona con ' + fP(G.ocupExpansion) + ' de ocupación y ' + G.mesesMaduracion + ' meses de maduración. Detalle en Sedes nuevas e inversión.'],
    ];
    const cards = items.map(([t, x], i) => '<div class="dec"><span class="dec-n">' + (i + 1) + '</span><div><b>' + t + '</b><p>' + x + '</p></div></div>').join('');
    const estados = ['Pendiente', 'En curso', 'En tablero', 'Hecho'];
    const tareas = (S.ds.params.tareas || []).map((t, i) => '<tr><td style="text-align:left;white-space:normal">' + esc(t.tarea) + '</td><td style="text-align:left">' + esc(t.resp) + '</td><td><select class="tarea-est" data-i="' + i + '">' + estados.map(e => '<option' + (e === t.estado ? ' selected' : '') + '>' + e + '</option>').join('') + '</select></td></tr>').join('');
    const crit = C.NOMBRES_SEDES.filter(s => S.ds.plan.criticas[s] && S.ds.plan.criticas[s].critica).map(s => ({ s, c: S.ds.plan.criticas[s], b: A('base', s).uai, a: A('ajustado', s).uai, v: A('vigente', s).uai })).sort((x, y) => x.b - y.b);
    const critRows = crit.map(x => '<tr class="click" data-sede="' + esc(x.s) + '"><td><b>' + esc(x.s) + '</b></td><td>' + fP(x.c.ocupBase) + ' → ' + fP(x.c.ocupAj) + '</td><td class="neg">' + fM(x.b) + '</td><td class="' + (x.a < 0 ? 'neg' : 'pos') + '">' + fM(x.a) + '</td><td class="' + (x.v < 0 ? 'neg' : 'pos') + '">' + fM(x.v) + '</td><td style="text-align:left;white-space:normal;min-width:300px;font-size:13px">' + esc(P[x.s].nota || x.c.accion || '') + '</td></tr>').join('');
    return '<section class="section" id="s-dec"><p class="eyebrow">' + num() + ' — Decisiones del 19 de noviembre</p><h2>Qué se acordó y cuánto mueve el resultado</h2><div class="divider"></div>' +
      '<p class="lead">Con las decisiones de la reunión, el presupuesto vigente 2027 queda en <b>' + fM(vT.ing) + '</b> de ingresos y <b>' + fM(vT.uai) + '</b> de utilidad de gestión (' + fP(vT.uaiP) + '), frente a ' + fM(bT.uai) + ' (' + fP(bT.uaiP) + ') del plan base. El margen de seguridad pasa de ' + fP(bT.ms) + ' a ' + fP(vT.ms) + '. Sigue lejos de la meta de ' + fP2(S.ds.plan.meta) + ': falta decidir Suba, Cali Norte, Itagüí y las demás sedes críticas.</p>' +
      '<div class="grid g2"><div class="card"><h3>Acuerdos</h3>' + cards + '</div><div class="card"><h3>Próximos pasos</h3><div class="tw"><table class="t"><tr><th>Tarea</th><th style="text-align:left">Responsable</th><th>Estado</th></tr>' + tareas + '</table></div><p class="note">El estado se guarda con los parámetros (Parámetros › Guardar).</p></div></div>' +
      '<h3 style="font-family:var(--sora);margin:28px 0 12px">Sedes críticas: plan base, ajustado y vigente</h3><div class="card" style="padding:0"><div class="tw"><table class="t"><tr><th>Sede</th><th>Ocupación base → ajustada</th><th>Utilidad base</th><th>Utilidad ajustada</th><th>Utilidad vigente</th><th style="text-align:left">Decisión o acción</th></tr>' + critRows + '</table></div></div></section>';
  }

  // ------------------------------------------------------------ parámetros (back editable)
  const parseNum = v => { let s = String(v == null ? '' : v).trim().replace(/[$\s%]/g, ''); if (!s) return null; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, ''); const n = parseFloat(s); return isFinite(n) ? n : null; };
  const fmtIn = (v, t) => v == null || v === '' ? '' : t === 'pct' || t === 'pctOpt' ? nf1.format(v * 100).replace(/,0$/, '') : t === 'pct2' ? new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(v * 100) : t === 'pesos' ? nf0.format(Math.round(v)) : String(v);
  function campo(lab, path, val, t, ayuda) {
    if (t === 'bool') return '<label class="pf pf-check"><input type="checkbox" data-p="' + path + '" data-t="bool"' + (val ? ' checked' : '') + '> ' + lab + '</label>';
    if (t === 'textarea') return '<label class="pf pf-wide"><span>' + lab + '</span><textarea data-p="' + path + '" data-t="text" rows="3">' + esc(val || '') + '</textarea></label>';
    return '<label class="pf"><span>' + lab + (t && t.startsWith('pct') ? ' (%)' : t === 'pesos' ? ' ($)' : '') + '</span><input type="text" inputmode="decimal" data-p="' + path + '" data-t="' + (t || 'num') + '" value="' + esc(fmtIn(val, t)) + '"' + (t === 'pctOpt' ? ' placeholder="general"' : '') + '>' + (ayuda ? '<small>' + ayuda + '</small>' : '') + '</label>';
  }
  function leerCampos(root) {
    const errores = [];
    root.querySelectorAll('[data-p]').forEach(el => {
      const [scope, ...path] = el.dataset.p.split('.'), t = el.dataset.t;
      const PR = S.ds.params;
      let obj = scope === 'g' ? PR.generales : scope === 'i' ? (PR.cursosInfo = PR.cursosInfo || {}) :
        scope === 'm' ? (((PR.inscritosMes = PR.inscritosMes || {})[S.mes] = PR.inscritosMes[S.mes] || {})[S.psede] = PR.inscritosMes[S.mes][S.psede] || {}) : PR.sedes[S.psede];
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]] = obj[path[i]] || {};
      const k = path[path.length - 1];
      if (t === 'bool') { obj[k] = el.checked; return; }
      if (t === 'text' || t === 'mes') { const v = el.value.trim(); if (t === 'mes' && v && !/^\d{4}-\d{2}$/.test(v)) errores.push('Apertura debe tener formato AAAA-MM'); obj[k] = v || (t === 'mes' ? null : ''); return; }
      let v = parseNum(el.value);
      if (v == null) { if (t === 'pctOpt') { obj[k] = null; return; } errores.push('Valor inválido en ' + el.closest('label').querySelector('span').textContent); return; }
      if (t === 'pct' || t === 'pctOpt' || t === 'pct2') v = v / 100;
      if (t === 'int') v = Math.round(v);
      if (v < 0 && t !== 'pctOpt') { errores.push('No se permiten negativos en ' + el.closest('label').querySelector('span').textContent); return; }
      obj[k] = v;
    });
    const p = S.ds.params.sedes[S.psede];
    if (p.salonesPlan > p.salonesPosibles) errores.push('Los salones del plan no pueden superar los salones posibles');
    if (p.ocupPlan > 1) errores.push('La ocupación plan no puede superar 100%');
    return errores;
  }
  function renderParams() {
    const PR = S.ds.params, G = PR.generales; S.psede = S.psede || (S.sede !== 'Todas' ? S.sede : C.NOMBRES_SEDES[0]);
    const s = S.psede, p = PR.sedes[s], ks = C.mesesPlan(S.ds);
    const A = (e, x) => C.acumular(k => C.plan(S.ds, e, k, x), ks);
    const vb = A('base', s), vv = A('vigente', s), cap = C.capacidad(S.ds, s);
    const opt = C.NOMBRES_SEDES.map(n => '<option' + (n === s ? ' selected' : '') + '>' + esc(n) + '</option>').join('');
    const pp = p.presupuestoPlan || {};
    const im = ((PR.inscritosMes || {})[S.mes] || {})[s] || {};
    const cursos = '<div class="tw"><table class="t mini-t"><tr><th>Curso</th><th>Grupos activos</th><th>Estudiantes activos</th><th>Programados</th><th>Grupos iniciados ' + esc(C.keyLabel(S.mes, true)) + '</th><th>Inscritos ' + esc(C.keyLabel(S.mes, true)) + '</th></tr>' + C.CURSOS.map(([c, n]) => { const x = p.cursos[c] || {}, y = im[c] || {}; return '<tr><td>' + n + '</td><td><input data-p="s.cursos.' + c + '.grupos" data-t="int" value="' + (x.grupos || 0) + '"></td><td><input data-p="s.cursos.' + c + '.estudiantes" data-t="int" value="' + (x.estudiantes || 0) + '"></td><td><input data-p="s.cursos.' + c + '.programados" data-t="int" value="' + (x.programados || 0) + '"></td><td><input data-p="m.' + c + '.grupos" data-t="int" value="' + (y.grupos || 0) + '"></td><td><input data-p="m.' + c + '.inscritos" data-t="int" value="' + (y.inscritos || 0) + '"></td></tr>'; }).join('') + '</table></div>' +
      '<p class="note">Los inscritos del mes corresponden al mes elegido en el tablero (' + esc(C.keyLabel(S.mes)) + '). Para cargar otro mes, cámbielo en el filtro Mes del tablero y vuelva a Parámetros.</p>';
    const resumen = C.NOMBRES_SEDES.map(n => { const q = PR.sedes[n], v = A('vigente', n), b = A('base', n), fx = C.LINEAS_FIJAS.reduce((a, [k]) => a + (+q.presupuesto[k] || 0), 0); return '<tr class="click' + (n === s ? ' sel' : '') + '" data-psede="' + esc(n) + '"><td>' + esc(n) + '</td><td>' + q.salones + ' / ' + q.salonesPlan + ' / ' + q.salonesPosibles + '</td><td>' + q.gruposActivos + '</td><td>' + fN(q.estudiantesActivos) + '</td><td>' + fP(q.ocupPlan) + '</td><td>' + (q.kit ? 'Sí' : 'No') + '</td><td>' + fP2(q.incPrecio == null ? G.incPrecio : q.incPrecio) + '</td><td>' + fM(fx) + '</td><td class="' + (b.uai < 0 ? 'neg' : '') + '">' + fM(b.uai) + '</td><td class="' + (v.uai < 0 ? 'neg' : 'pos') + '">' + fM(v.uai) + '</td></tr>'; }).join('');
    const T = A('vigente', 'Todas');
    const lateralP = '<nav class="side-nav" id="snav"><a href="#" class="volver" id="pvolver2">‹ Volver al tablero</a><div class="side-label">Generales</div><a href="#pgen" data-sec="pgen" data-q="parametros generales">Parámetros generales</a><a href="#pcur" data-sec="pcur" data-q="cursos precio duracion">Cursos: precio y duración</a>' +
      '<div class="side-label">Sedes</div>' + C.NOMBRES_SEDES.map(n => '<a href="#" class="' + (n === s ? 'on' : '') + '" data-psede-nav="' + esc(n) + '" data-q="' + esc(norm(n)) + '">' + esc(n) + '</a>').join('') + '</nav>' +
      '<div class="side-foot"><button class="sbtn" id="pvolver">Volver al tablero</button><button class="sbtn" id="pguardar">Descargar respaldo</button></div>';
    $('#app').innerHTML = shell('Parámetros del tablero', lateralP, 'Parámetros<span class="ctx-sep">/</span>' + esc(s), '' +
      '<main>' + (!S.db.ok && S.dirty ? '<div class="aviso">' + esc(S.db.motivo) + ' Los cambios quedan solo en este navegador: pulse <b>Descargar respaldo</b> y suba el dataset.json a la carpeta data del repositorio.</div>' : '') +
      '<section class="section"><p class="eyebrow">Base de parámetros</p><h2>Capacidad, cursos y presupuesto por sede</h2><div class="divider"></div>' +
      '<p class="lead">Todo el tablero se recalcula con estos valores: capacidad y ocupación, presupuesto vigente, ejecución, sedes nuevas y decisiones. Al pulsar Aplicar, los cambios se guardan solos en la base de datos cifrada y quedan visibles para todos los que entren con la clave. Presupuesto vigente 2027 de la empresa con los parámetros actuales: ' + fM(T.ing) + ' de ingresos y ' + fM(T.uai) + ' de utilidad (' + fP(T.uaiP) + ').</p>' +
      '<div class="grid g-side"><div class="card" id="pform"><div class="pf-head"><div class="field"><label>Sede</label><select id="psel">' + opt + '</select></div>' +
      '<div class="pf-kpis"><span>Utilidad 2027 base <b class="' + (vb.uai < 0 ? 'down' : '') + '">' + fM(vb.uai) + '</b></span><span>Vigente <b class="' + (vv.uai < 0 ? 'down' : 'up') + '">' + fM(vv.uai) + '</b></span><span>Ocupación hoy <b>' + fP(cap.ocupFranjas) + '</b></span><span>Factor de volumen <b>' + nf1.format(S.ds.plan.plan.vigente[s].f) + 'x</b></span></div></div>' +
      '<h4>Capacidad actual</h4><div class="pf-grid">' + campo('Salones habilitados', 's.salones', p.salones, 'int') + campo('Salones posibles', 's.salonesPosibles', p.salonesPosibles, 'int', 'Espacio disponible para habilitar') + campo('Grupos activos', 's.gruposActivos', p.gruposActivos, 'int') + campo('Estudiantes activos', 's.estudiantesActivos', p.estudiantesActivos, 'int') + campo('Deserción histórica', 's.desercion', p.desercion, 'pct') + '</div>' +
      '<h4>Plan 2027 de la sede</h4><div class="pf-grid">' + campo('Salones en 2027', 's.salonesPlan', p.salonesPlan, 'int') + campo('Ocupación objetivo 2027', 's.ocupPlan', p.ocupPlan, 'pct', 'Plan base: ' + fP(S.ds.plan.capacidad[s].ocup2027)) + campo('CAC 2027', 's.cac', p.cac, 'pesos', 'Plan: ' + fPesos(p.cacPlan)) + campo('Incremento de precio', 's.incPrecio', p.incPrecio, 'pctOpt', 'Vacío = general (' + fP2(G.incPrecio) + ')') + campo('Entrega kit', 's.kit', p.kit, 'bool') + '</div>' +
      '<h4>Presupuesto mensual de gastos fijos 2027</h4><div class="pf-grid">' + C.LINEAS_FIJAS.map(([k, t]) => campo(t, 's.presupuesto.' + k, p.presupuesto[k], 'pesos', 'Plan: ' + fPesos(pp[k]))).join('') + '</div>' +
      '<h4>Cursos asignados</h4>' + cursos +
      '<h4>Inversión y apertura</h4><div class="pf-grid">' + campo('Apertura (AAAA-MM)', 's.apertura', p.apertura, 'mes') + campo('Inversión inicial', 's.inversion', p.inversion, 'pesos', 'Sin capital de trabajo') + campo('Sede nueva', 's.nueva', p.nueva, 'bool') + campo('Evaluar como inversión', 's.evaluar', p.evaluar, 'bool') + '</div>' +
      '<div class="pf-grid">' + campo('Nota o decisión', 's.nota', p.nota, 'textarea') + '</div>' +
      '<div class="row-actions"><button class="btn ghost" id="preset">Restablecer sede a valores iniciales</button><button class="btn" id="paplicar">Aplicar cambios</button></div><div id="perr"></div></div>' +
      '<div><div class="card" id="pgen"><h3>Parámetros generales</h3><div class="pf-grid one">' + campo('Franjas por salón', 'g.franjasSalon', G.franjasSalon, 'int') + campo('Cupo por grupo', 'g.cupo', G.cupo, 'int') + campo('Tope de ocupación', 'g.topeOcupacion', G.topeOcupacion, 'pct') +
      campo('Incremento de precio 2027', 'g.incPrecio', G.incPrecio, 'pct2', 'Efectivo, aplicado en cuotas') + campo('Incremento del plan base', 'g.incPrecioBase', G.incPrecioBase, 'pct2') + campo('Meses de rampa', 'g.mesesRampa', G.mesesRampa, 'int', 'Meses para que los activos lleguen a la nueva ocupación') +
      campo('Tasa de oportunidad (CDT)', 'g.tasaDescuento', G.tasaDescuento, 'pct') + campo('Meses de capital de trabajo', 'g.mesesCapitalTrabajo', G.mesesCapitalTrabajo, 'int') + campo('Ocupación para expandir', 'g.ocupExpansion', G.ocupExpansion, 'pct') + campo('Meses de maduración', 'g.mesesMaduracion', G.mesesMaduracion, 'int') +
      campo('Plazo máximo en pérdida (meses)', 'g.plazoMaxPerdida', G.plazoMaxPerdida, 'int') + campo('Horizonte de evaluación (meses)', 'g.horizonteMeses', G.horizonteMeses, 'int') + campo('Inversión de referencia sede nueva', 'g.inversionNuevaSede', G.inversionNuevaSede, 'pesos') + campo('Corte de datos operativos', 'g.corteOperativo', G.corteOperativo, 'mes') + '</div>' +
      '<div class="row-actions"><button class="btn" id="pgaplicar">Aplicar generales</button></div><div id="pgerr"></div></div>' +
      (PR.cursosInfo ? '<div class="card" id="pcur" style="margin-top:20px"><h3>Cursos: precio y duración</h3><p class="note" style="margin:0 0 10px">Se usan para estimar el peso de cada curso en los ingresos.</p><div class="tw"><table class="t mini-t"><tr><th>Curso</th><th>Precio lista</th><th>Duración (meses)</th><th>Cupo</th></tr>' +
        C.CURSOS.map(([c, n]) => { const x = PR.cursosInfo[c] || {}; return '<tr><td>' + n + '</td><td><input data-p="i.' + c + '.precio" data-t="pesos" value="' + esc(fmtIn(x.precio, 'pesos')) + '" style="max-width:120px"></td><td><input data-p="i.' + c + '.duracion" data-t="num" value="' + (x.duracion || '') + '"></td><td><input data-p="i.' + c + '.cupo" data-t="int" value="' + (x.cupo || '') + '"></td></tr>'; }).join('') +
        '</table></div><div class="row-actions"><button class="btn" id="pcaplicar">Aplicar cursos</button></div><div id="pcerr"></div></div>' : '') +
      '</div></div></section>' +
      '<section class="section"><p class="eyebrow">Resumen</p><h2>Parámetros de las 24 sedes</h2><div class="divider"></div><div class="card" style="padding:0"><div class="tw"><table class="t compact"><tr><th>Sede</th><th>Salones hoy / 2027 / posibles</th><th>Grupos</th><th>Estudiantes</th><th>Ocupación 2027</th><th>Kit</th><th>Incremento</th><th>Fijos/mes</th><th>Utilidad base</th><th>Utilidad vigente</th></tr>' + resumen + '</table></div></div></section></main>' + footer());
    activarShell(false);
    { const act = document.querySelector('[data-psede-nav].on'); if (act) act.scrollIntoView({ block: 'center' }); window.scrollTo(0, 0); }
    $('#pvolver2').onclick = e => { e.preventDefault(); render(); window.scrollTo(0, 0); };
    document.querySelectorAll('[data-psede-nav]').forEach(a => a.onclick = e => { e.preventDefault(); S.psede = a.dataset.psedeNav; renderParams(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $('#pvolver').onclick = () => { render(); window.scrollTo(0, 0); };
    $('#psel').onchange = e => { S.psede = e.target.value; renderParams(); };
    document.querySelectorAll('tr[data-psede]').forEach(tr => tr.onclick = () => { S.psede = tr.dataset.psede; renderParams(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const aplicar = (root, errEl) => {
      const errs = leerCampos(root);
      if (errs.length) { $(errEl).innerHTML = '<p class="down">' + errs.map(esc).join('<br>') + '</p>'; return; }
      C.recalcular(S.ds); persistir(true); renderParams(); toast(S.db.ok ? 'Cambios aplicados y guardados.' : 'Cambios aplicados solo en este navegador: falta conectar la base de datos.', 4000);
    };
    $('#paplicar').onclick = () => aplicar($('#pform'), '#perr');
    $('#pgaplicar').onclick = () => aplicar($('#pgen'), '#pgerr');
    if ($('#pcaplicar')) $('#pcaplicar').onclick = () => aplicar($('#pcur'), '#pcerr');
    $('#preset').onclick = () => {
      const ini = S.ds.paramsInicial && S.ds.paramsInicial.sedes[s];
      if (!ini) { toast('No hay valores iniciales guardados para esta sede.'); return; }
      S.ds.params.sedes[s] = JSON.parse(JSON.stringify(ini)); C.recalcular(S.ds); persistir(true); renderParams(); toast('Se restablecieron los valores iniciales de ' + s + '.');
    };
    $('#pguardar').onclick = guardarParams;
    pintarChip();
  }
  async function guardarParams() {
    await descargarRespaldo();
    const m = modal('<h3>Respaldo descargado</h3><p class="muted">Se descargó <b>dataset.json</b> cifrado con todos los datos y parámetros actuales. ' + (S.db.ok ? 'No hace falta subirlo: los cambios ya se guardan solos en la base de datos. Consérvelo como copia de seguridad.' : 'Como la base de datos no está conectada, para que todos lo vean:</p>' + pasosPublicar + '<p>') + '</p><div class="row-actions"><button class="btn" id="mok">Entendido</button></div>');
    $('#mok', m).onclick = () => m.remove();
    if ($('.aviso')) $('.aviso').remove();
  }

  function footer() {
    const reales = C.mesesReales(S.ds);
    return '<footer><div class="foot-in"><div>' + logo(true) + '<small>Tablero preparado por Daniel Financiero · DiCi para Eleganza Academia (CEINDER S.A.S.).</small>' +
      '<small>Datos reales: ' + (reales.length ? reales.map(k => nombreMes(k)).join(', ') : 'sin informes cargados') + '. Plan: Plan Financiero ' + (S.ds.plan ? S.ds.plan.anio : '') + '.</small></div>' +
      '<div class="claim">Di que sí — <span>con criterio.</span></div></div></footer>';
  }

  // ------------------------------------------------------------ guardar (descarga del dataset cifrado)
  async function guardar(env) {
    S.env = env;
    const blob = new Blob([JSON.stringify(env)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dataset.json'; document.body.appendChild(a); a.click(); a.remove();
  }
  function modal(html) {
    const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.innerHTML = '<div class="modal">' + html + '</div>';
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg); return bg;
  }
  const pasosPublicar = '<ol class="steps-list"><li>En GitHub abra el repositorio <b>DashboardEleganzaAcademia</b> › carpeta <b>data</b>.</li><li><b>Add file › Upload files</b> y suba el <b>dataset.json</b> que se acaba de descargar (reemplaza el anterior).</li><li>Pulse <b>Commit changes</b>. Vercel publica solo en uno o dos minutos.</li></ol>';

  function modalCargar() {
    const m = modal('<h3>Cargar informe a socios</h3><p class="muted">Arrastre el Excel del informe consolidado por sedes tal como lo envía contabilidad. El mes se toma del nombre del archivo o de la hoja; revíselo antes de guardar. Si el mes ya existe, se reemplaza. Al incorporarlo queda guardado en la base de datos.</p>' +
      '<label class="drop" id="drop">Arrastre aquí el archivo .xlsx o haga clic para buscarlo<input type="file" id="file" accept=".xlsx,.xls,.xlsm" hidden></label><div id="prev"></div>' +
      '<div class="row-actions"><button class="btn ghost" id="mx">Cerrar</button></div>');
    $('#mx', m).onclick = () => m.remove();
    const drop = $('#drop', m), inp = $('#file', m);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) leer(e.dataTransfer.files[0]); });
    inp.onchange = () => inp.files[0] && leer(inp.files[0]);
    async function leer(file) {
      const prev = $('#prev', m);
      if (!window.XLSX) { prev.innerHTML = '<p class="down">No se pudo cargar el lector de Excel. Revise la conexión e intente de nuevo.</p>'; return; }
      prev.innerHTML = '<p class="muted">Leyendo ' + esc(file.name) + '…</p>';
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const rows = {}; wb.SheetNames.forEach(n => rows[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }));
        const p = C.parseInforme(rows, file.name);
        const T = C.completar(C.sumar(Object.values(p.sedes)));
        const anios = [2025, 2026, 2027, 2028];
        const per = p.periodo ? C.keyParts(p.periodo) : { y: 2026, m: 1 };
        prev.innerHTML = '<dl class="kv"><dt>Archivo</dt><dd>' + esc(file.name) + '</dd><dt>Hoja leída</dt><dd>' + esc(p.hoja) + '</dd><dt>Sedes detectadas</dt><dd>' + p.sedesDetectadas + ' de 24</dd>' +
          '<dt>Mes del informe</dt><dd><select id="pm">' + C.MESES.map((n, i) => '<option value="' + (i + 1) + '"' + (i + 1 === per.m ? ' selected' : '') + '>' + n + '</option>').join('') + '</select> <select id="py">' + anios.map(y => '<option' + (y === per.y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select>' + (p.periodo ? '' : ' <span class="down">no se detectó: elíjalo</span>') + '</dd>' +
          '<dt>Ingresos netos</dt><dd>' + fM(T.ing) + '</dd><dt>Margen de contribución</dt><dd>' + fP(T.mcP) + '</dd><dt>Utilidad de gestión</dt><dd>' + fM(T.uai) + '</dd>' +
          '<dt>Cuadre con la columna total</dt><dd class="' + (p.control.cuadra ? 'up' : 'down') + '">' + (p.control.cuadra ? 'Cuadra' : 'No cuadra: ' + fM(p.control.ingresosSedes) + ' vs ' + fM(p.control.ingresosColumnaTotal)) + '</dd>' +
          (p.control.sinClase.length ? '<dt>Cuentas sin clasificar</dt><dd class="down">' + esc(p.control.sinClase.join(', ')) + '</dd>' : '') + '</dl>' +
          '<div class="row-actions"><button class="btn" id="inc">Incorporar y guardar</button></div>';
        $('#inc', m).onclick = async () => {
          const k = C.keyOf(+$('#py', m).value, +$('#pm', m).value);
          C.incorporar(S.ds, p, k, file.name);
          if (S.db.ok) { S.dirty = true; await guardarAhora(); } else await descargarRespaldo();
          S.mes = k;
          prev.innerHTML = S.db.ok ? (S.db.estado === 'guardado' ? '<p class="up">Se incorporó ' + esc(nombreMes(k)) + ' y quedó guardado en la base de datos. Ya lo ven todos los que entren con la clave.</p>' : '<p class="down">Se incorporó ' + esc(nombreMes(k)) + ' pero no se pudo guardar: ' + esc(S.db.msg || '') + '</p>')
            : '<p class="up">Se incorporó ' + esc(nombreMes(k)) + ' y se descargó <b>dataset.json</b> cifrado.</p><p>Para que todos lo vean en el link:</p>' + pasosPublicar;
          render();
        };
      } catch (e) { prev.innerHTML = '<p class="down">' + esc(e.message) + '</p>'; }
    }
  }

  function modalConfig() {
    const cargas = (S.ds.cargas || []).slice(0, 12);
    const m = modal('<h3>Configuración</h3>' +
      '<h4 style="font-family:var(--sora);margin:18px 0 6px">Cambiar la clave de acceso</h4><p class="muted">Mínimo 10 caracteres. La clave nueva queda guardada de inmediato y la anterior deja de funcionar para todos. Si se olvida, no hay forma de recuperar los datos.</p>' +
      '<div style="display:grid;gap:8px;max-width:360px"><input type="password" id="c1" placeholder="Nueva clave" class="field" style="padding:10px;border:1px solid #E4ECF7;border-radius:8px"><input type="password" id="c2" placeholder="Repita la nueva clave" style="padding:10px;border:1px solid #E4ECF7;border-radius:8px"><button class="btn" id="cc">Cambiar clave</button></div><div id="cmsg"></div>' +
      '<h4 style="font-family:var(--sora);margin:24px 0 6px">Meses cargados</h4>' +
      '<table class="t"><tr><th>Mes</th><th>Archivo</th><th>Cargado</th><th></th></tr>' + C.mesesReales(S.ds).map(k => '<tr><td>' + nombreMes(k) + '</td><td style="text-align:left">' + esc(S.ds.reales[k].archivo) + '</td><td>' + esc((S.ds.reales[k].cargado || '').slice(0, 10)) + '</td><td><button class="btn ghost small" data-del="' + k + '">Quitar</button></td></tr>').join('') + '</table>' +
      '<h4 style="font-family:var(--sora);margin:24px 0 6px">Últimas cargas</h4><p class="muted" style="font-size:13px">' + (cargas.map(c => esc(c.fecha.slice(0, 10)) + ' · ' + esc(nombreMes(c.periodo)) + ' · ' + esc(c.archivo)).join('<br>') || 'Sin cargas') + '</p>' +
      '<h4 style="font-family:var(--sora);margin:24px 0 6px">Base de datos</h4><p class="muted" style="font-size:13px">' + (S.db.ok ? 'Conectada. Versión ' + S.db.version + (S.db.ultimo ? ', guardada el ' + esc(new Date(S.db.ultimo).toLocaleString('es-CO')) : '') + '. Se conservan las últimas 10 versiones como historial.' : esc(S.db.motivo)) + '</p>' +
      '<div class="row-actions"><button class="btn ghost" id="mresp">Descargar respaldo</button><button class="btn ghost" id="mx">Cerrar</button><button class="btn ghost" id="salir">Salir</button></div>');
    $('#mresp', m).onclick = () => descargarRespaldo().then(() => toast('Respaldo descargado.'));
    $('#mx', m).onclick = () => m.remove();
    $('#salir', m).onclick = async () => { if (S.db.estado === 'pendiente' || S.db.estado === 'guardando') await guardarAhora(); S.ds = null; S.key = null; S.auth = null; m.remove(); renderLogin(); };
    $('#cc', m).onclick = async () => {
      const a = $('#c1', m).value, b = $('#c2', m).value;
      if (a.length < 10) { $('#cmsg', m).innerHTML = '<p class="down">La clave debe tener al menos 10 caracteres.</p>'; return; }
      if (a !== b) { $('#cmsg', m).innerHTML = '<p class="down">Las claves no coinciden.</p>'; return; }
      const nk = await C.newKey(a);
      if (S.db.ok) {
        $('#cmsg', m).innerHTML = '<p class="muted">Guardando…</p>';
        const ok = await guardarAhora(nk);
        $('#cmsg', m).innerHTML = ok ? '<p class="up">Clave cambiada y guardada. Desde ahora se entra con la clave nueva.</p>' : '<p class="down">No se cambió la clave: ' + esc(S.db.msg || '') + '</p>';
      } else {
        S.key = nk.key; S.salt = nk.salt; S.auth = nk.auth; S.authHash = nk.authHash;
        await descargarRespaldo();
        $('#cmsg', m).innerHTML = '<p class="up">Clave cambiada. Se descargó dataset.json con la nueva clave.</p>' + pasosPublicar;
      }
    };
    m.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const k = b.dataset.del;
      if (!window.confirm('¿Quitar ' + nombreMes(k) + ' del tablero? El cambio se guarda para todos.')) return;
      delete S.ds.reales[k];
      const r = C.mesesReales(S.ds); S.mes = r.length ? r[r.length - 1] : C.mesesPlan(S.ds)[0];
      if (S.db.ok) { S.dirty = true; await guardarAhora(); } else await descargarRespaldo();
      m.remove(); render(); toast(S.db.ok ? 'Mes quitado y guardado.' : 'Mes quitado. Suba el dataset.json descargado a GitHub para publicarlo.', 6000);
    });
  }

  boot();
})();
