/* Eleganza Academia · Tablero financiero — interfaz (Daniel Financiero) */
(function () {
  'use strict';
  const C = window.EACore;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { env: null, ds: null, key: null, salt: null, sede: 'Todas', mes: null, esc: 'base' };

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
    try { const r = await fetch('data/dataset.json', { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) { }
    return null;
  }
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
        S.ds = r.ds; S.key = r.key; S.salt = C.b64d(S.env.kdf.salt);
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
    $('#app').innerHTML =
      '<header class="topbar"><div class="topbar-in">' + logo(false) +
      '<div class="client"><b>Eleganza Academia</b><br>Tablero financiero</div>' +
      '<div class="filters">' +
      '<div class="field"><label for="fsede">Sede</label><select id="fsede">' + optsSede + '</select></div>' +
      '<div class="field"><label for="fmes">Mes</label><select id="fmes">' + optsMes + '</select></div>' +
      '<div class="field"><label for="fesc">Comparar con</label><select id="fesc">' + optsEsc + '</select></div>' +
      '<button class="btn small" id="bcargar">Cargar informe</button><button class="btn ghost small" id="bconf">Configuración</button></div></div>' +
      '<nav class="navlinks"><a href="#s-res">Resultados del mes</a><a href="#s-ten">Tendencia</a><a href="#s-sed">Sedes</a><a href="#s-gas">Gastos</a><a href="#s-plan">Plan 2027</a><a href="#s-cri">Sedes críticas</a></nav></header>' +
      hero(V) + '<main>' + kpis(V) + secResultados(V) + secTendencia() + secSedes() + secGastos(V) + secPlan() + secCriticas() + '</main>' + footer();
    $('#fsede').onchange = e => { S.sede = e.target.value; render(); };
    $('#fmes').onchange = e => { S.mes = e.target.value; render(); };
    $('#fesc').onchange = e => { S.esc = e.target.value; render(); };
    $('#bcargar').onclick = modalCargar;
    $('#bconf').onclick = modalConfig;
    document.querySelectorAll('tr[data-sede]').forEach(tr => tr.onclick = () => { S.sede = tr.dataset.sede; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
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
    return '<section class="hero"><div class="hero-in"><span class="pill">' + (V.R ? 'Resultados reales' : 'Plan financiero 2027') + '</span>' +
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
    if (S.sede === 'Todas') {
      const filas = C.porSede(S.ds, S.mes, S.esc).map(x => x.real || x.plan).filter(Boolean);
      const pos = filas.filter(x => x.uai > 0).length;
      h += card('Sedes con utilidad', pos + ' de ' + filas.length, V.R ? 'Resultado real del mes' : 'Según el ' + C.ESCENARIOS[S.esc].toLowerCase());
    } else {
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
    return '<section class="section" id="s-res"><p class="eyebrow">01 — Resultados del mes</p><h2>Estado de resultados de gestión</h2><div class="divider"></div>' +
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
    return '<section class="section" id="s-ten"><p class="eyebrow">02 — Tendencia</p><h2>Mes a mes: real frente al plan</h2><div class="divider"></div>' +
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
    let rows = filas.map(x => '<tr class="click' + (x.sede === S.sede ? ' sel' : '') + '" data-sede="' + esc(x.sede) + '"><td>' + esc(x.sede) + '</td><td>' + fM(x.X.ing) + '</td><td>' + fP(x.X.mcP) + '</td><td>' + fP(x.X.pauP) + '</td><td class="' + (x.X.con < 0 ? 'neg' : '') + '">' + fM(x.X.con) + '</td><td class="' + (x.X.uai < 0 ? 'neg' : '') + '">' + fM(x.X.uai) + '</td><td>' + fP(x.X.uaiP) + '</td>' +
      (conPlan ? '<td>' + fM(x.plan && x.plan.uai) + '</td><td>' + (x.plan ? varTxt(x.real.uai, x.plan.uai) : '—') + '</td>' : '') + '</tr>').join('');
    const T = C.completar(C.sumar(filas.map(x => x.X)));
    rows += '<tr class="tot"><td>Total empresa</td><td>' + fM(T.ing) + '</td><td>' + fP(T.mcP) + '</td><td>' + fP(T.pauP) + '</td><td>' + fM(T.con) + '</td><td class="' + (T.uai < 0 ? 'neg' : '') + '">' + fM(T.uai) + '</td><td>' + fP(T.uaiP) + '</td>' + (conPlan ? '<td></td><td></td>' : '') + '</tr>';
    const pos = filas.filter(x => x.X.uai > 0), neg = filas.filter(x => x.X.uai < 0);
    const sp = pos.reduce((a, x) => a + x.X.uai, 0), sn = neg.reduce((a, x) => a + x.X.uai, 0);
    return '<section class="section" id="s-sed"><p class="eyebrow">03 — Sedes</p><h2>Resultado por sede · ' + nombreMes(S.mes) + (esReal ? '' : ' (plan)') + '</h2><div class="divider"></div>' +
      '<p class="lead">' + pos.length + ' sedes aportan ' + fM(sp) + ' y ' + neg.length + ' restan ' + fM(Math.abs(sn)) + (sp ? ': las sedes en pérdida se comen el ' + nf0.format(Math.abs(sn) / sp * 100) + '% de lo que generan las demás.' : '.') + ' Haga clic en una sede para ver su detalle.</p>' +
      '<div class="grid g2"><div class="card" style="padding:0"><div class="tw"><table class="t"><tr><th>Sede</th><th>Ingresos</th><th>MC %</th><th>Pauta %</th><th>Contribución</th><th>Utilidad</th><th>Margen</th>' + (conPlan ? '<th>Utilidad plan</th><th>Var.</th>' : '') + '</tr>' + rows + '</table></div></div>' +
      '<div class="card"><h3>Utilidad de gestión por sede ($ millones)</h3>' + chartSedes(filas.map(x => ({ n: x.sede, v: x.X.uai }))) + '</div></div></section>';
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
    return '<section class="section" id="s-gas"><p class="eyebrow">04 — Gastos</p><h2>Gastos por categoría</h2><div class="divider"></div>' +
      '<div class="grid g2"><div class="card" style="padding:0"><div class="tw"><table class="t"><tr><th>Categoría</th><th>' + (V.R ? 'Real' : 'Plan') + '</th><th>% ventas</th>' + (ref ? '<th>' + refN + '</th><th>Var.</th>' : '') + '</tr>' + rows + '</table></div>' +
      (ref ? '<p class="note" style="padding:0 16px 14px">La línea negra en cada barra marca el valor de referencia (' + refN.toLowerCase() + ').</p>' : '') + '</div>' + (top || '<div></div>') + '</div></section>';
  }

  // ------------------------------------------------------------ 05 plan 2027
  function secPlan() {
    const PL = S.ds.plan; if (!PL) return '';
    const ks = C.mesesPlan(S.ds);
    const anual = e => C.acumular(k => C.plan(S.ds, e, k, S.sede), ks);
    const perdidas = e => C.NOMBRES_SEDES.filter(s => C.acumular(k => C.plan(S.ds, e, k, s), ks).uai < 0).length;
    const cards = Object.entries(C.ESCENARIOS).map(([e, t]) => {
      const A = anual(e);
      return '<div class="esc' + (e === S.esc ? ' on' : '') + '"><div class="nm">' + t + '</div><div class="big' + (A.uai < 0 ? ' neg' : '') + '">' + fM(A.uai) + '</div><div style="color:#6B7C93;font-size:13px">Utilidad de gestión ' + PL.anio + ' · ' + fP(A.uaiP) + '</div>' +
        '<dl><dt>Ingresos</dt><dd>' + fM(A.ing) + '</dd><dt>Margen de contribución</dt><dd>' + fP(A.mcP) + '</dd><dt>Pauta</dt><dd>' + fM(A.pau) + '</dd><dt>Punto de equilibrio mensual</dt><dd>' + fM(A.pe / 12) + '</dd><dt>Margen de seguridad</dt><dd>' + fP(A.ms) + '</dd>' +
        (S.sede === 'Todas' ? '<dt>Sedes con pérdida</dt><dd>' + perdidas(e) + '</dd>' : '') + '</dl></div>';
    }).join('');
    const Ms = ks.map(k => C.plan(S.ds, S.esc, k, S.sede));
    const gk = S.esc === 'ajustado' ? 'ajustado' : 'base';
    const grupos = i => S.sede === 'Todas' ? Object.values(PL.grupos[gk]).reduce((a, g) => a + g[i], 0) : (PL.grupos[gk][S.sede] || [])[i];
    const fila = (t, fn, f, cls) => '<tr class="' + (cls || '') + '"><td>' + t + '</td>' + Ms.map((x, i) => { const v = fn(x, i); return '<td class="' + (f === fM && v < 0 ? 'neg' : '') + '">' + f(v) + '</td>'; }).join('') + '<td><b>' + (fn === null ? '' : f(fn(C.acumular(k => C.plan(S.ds, S.esc, k, S.sede), ks), -1))) + '</b></td></tr>';
    const sumG = Array.from({ length: 12 }, (_, i) => grupos(i)).reduce((a, b) => a + (b || 0), 0);
    const tabla = '<table class="t compact"><tr><th>' + esc(C.ESCENARIOS[S.esc]) + '</th>' + ks.map(k => '<th>' + C.keyLabel(k, true) + '</th>').join('') + '<th>Año</th></tr>' +
      fila('Ingresos', x => x.ing, fM) + fila('Costos variables', x => x.cv, fM, 'det') + fila('Margen de contribución', x => x.mc, fM, 'sub') + fila('Margen de contribución %', x => x.mcP, fP, 'det') +
      fila('Gastos fijos de sede', x => x.fijos, fM) + fila('Pauta', x => x.pau, fM) + fila('Corporativo y financiero', x => x.corp + x.fin, fM) + fila('Utilidad de gestión', x => x.uai, fM, 'tot') + fila('Margen', x => x.uaiP, fP, 'det') +
      '<tr><td>Grupos nuevos a abrir</td>' + ks.map((k, i) => '<td>' + fN(grupos(i)) + '</td>').join('') + '<td><b>' + fN(sumG) + '</b></td></tr>' +
      '<tr><td>Inscritos nuevos</td>' + Ms.map(x => '<td>' + fN(x.nue) + '</td>').join('') + '<td><b>' + fN(Ms.reduce((a, x) => a + x.nue, 0)) + '</b></td></tr>' +
      '<tr><td>Estudiantes activos</td>' + Ms.map(x => '<td>' + fN(x.act) + '</td>').join('') + '<td><b>' + fN(Ms.reduce((a, x) => a + x.act, 0) / 12) + '</b></td></tr>' +
      '<tr><td>Grupos activos</td>' + Ms.map(x => '<td>' + fN(x.ga) + '</td>').join('') + '<td><b>' + fN(Ms.reduce((a, x) => a + x.ga, 0) / 12) + '</b></td></tr></table>';
    return '<section class="section" id="s-plan"><p class="eyebrow">05 — Plan financiero ' + PL.anio + '</p><h2>Tres escenarios para ' + esc(S.sede === 'Todas' ? 'la empresa' : S.sede) + '</h2><div class="divider"></div>' +
      '<p class="lead">Plan base: ocupación histórica de cada sede. Plan ajustado: ocupación necesaria en las sedes críticas para llegar al margen meta de ' + fP2(PL.meta) + '. Sin kit y sin aumento: el plan base sin el 5% de aumento de precio y sin el costo del kit. Los grupos a abrir son números enteros.</p>' +
      '<div class="grid g3">' + cards + '</div><div class="card" style="margin-top:20px;padding:0"><div class="tw">' + tabla + '</div></div></section>';
  }

  // ------------------------------------------------------------ 06 sedes críticas
  function secCriticas() {
    const PL = S.ds.plan; if (!PL) return '';
    const ks = C.mesesPlan(S.ds);
    const crit = C.NOMBRES_SEDES.filter(s => PL.criticas[s] && PL.criticas[s].critica);
    const lista = (S.sede === 'Todas' ? crit : crit.filter(s => s === S.sede));
    if (!lista.length) return S.sede === 'Todas' ? '' : '<section class="section" id="s-cri"><p class="eyebrow">06 — Sedes críticas</p><h2>' + esc(S.sede) + ' no es sede crítica</h2><div class="divider"></div><p class="lead">En el plan base esta sede tiene utilidad positiva.</p></section>';
    const u = (e, s) => C.acumular(k => C.plan(S.ds, e, k, s), ks).uai;
    const rows = lista.map(s => ({ s, c: PL.criticas[s], ub: u('base', s), ua: u('ajustado', s) })).sort((a, b) => a.ub - b.ub).map(x =>
      '<tr class="click" data-sede="' + esc(x.s) + '"><td><b>' + esc(x.s) + '</b></td><td>' + fP(x.c.ocupBase) + ' → ' + fP(x.c.ocupAj) + '</td><td>' + fN(x.c.inscMesReq) + ' vs ' + fN(x.c.inscMesHist) + '</td><td class="neg">' + fM(x.ub) + '</td><td class="' + (x.ua < 0 ? 'neg' : 'pos') + '">' + fM(x.ua) + '</td><td style="text-align:left;white-space:normal;min-width:320px;font-size:13px">' + esc(x.c.accion || '') + '</td></tr>').join('');
    return '<section class="section" id="s-cri"><p class="eyebrow">06 — Sedes críticas</p><h2>Qué tiene que cambiar para llegar a ' + fP2(PL.meta) + ' de margen</h2><div class="divider"></div>' +
      '<p class="lead">Sedes con utilidad negativa en el plan base. Ocupación de franjas base → ajustada, inscritos por mes que requiere el ajuste frente a 2026, y la acción sugerida.</p>' +
      '<div class="card" style="padding:0"><div class="tw"><table class="t"><tr><th>Sede</th><th>Ocupación</th><th>Inscritos/mes vs 2026</th><th>Utilidad base</th><th>Utilidad ajustada</th><th style="text-align:left">Qué hacer</th></tr>' + rows + '</table></div></div></section>';
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
    const m = modal('<h3>Cargar informe a socios</h3><p class="muted">Arrastre el Excel del informe consolidado por sedes tal como lo envía contabilidad. El mes se toma del nombre del archivo o de la hoja; revíselo antes de guardar. Si el mes ya existe, se reemplaza.</p>' +
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
          const env = await C.encryptDataset(S.ds, S.key, S.salt);
          await guardar(env);
          S.mes = k;
          prev.innerHTML = '<p class="up">Se incorporó ' + esc(nombreMes(k)) + ' y se descargó <b>dataset.json</b> cifrado.</p><p>Para que todos lo vean en el link:</p>' + pasosPublicar;
          render();
        };
      } catch (e) { prev.innerHTML = '<p class="down">' + esc(e.message) + '</p>'; }
    }
  }

  function modalConfig() {
    const cargas = (S.ds.cargas || []).slice(0, 12);
    const m = modal('<h3>Configuración</h3>' +
      '<h4 style="font-family:var(--sora);margin:18px 0 6px">Cambiar la clave de acceso</h4><p class="muted">Mínimo 10 caracteres. Al cambiarla se descarga un dataset.json nuevo, que debe subirse a GitHub; la clave anterior deja de funcionar. Si se olvida, no hay forma de recuperarla.</p>' +
      '<div style="display:grid;gap:8px;max-width:360px"><input type="password" id="c1" placeholder="Nueva clave" class="field" style="padding:10px;border:1px solid #E4ECF7;border-radius:8px"><input type="password" id="c2" placeholder="Repita la nueva clave" style="padding:10px;border:1px solid #E4ECF7;border-radius:8px"><button class="btn" id="cc">Cambiar clave</button></div><div id="cmsg"></div>' +
      '<h4 style="font-family:var(--sora);margin:24px 0 6px">Meses cargados</h4>' +
      '<table class="t"><tr><th>Mes</th><th>Archivo</th><th>Cargado</th><th></th></tr>' + C.mesesReales(S.ds).map(k => '<tr><td>' + nombreMes(k) + '</td><td style="text-align:left">' + esc(S.ds.reales[k].archivo) + '</td><td>' + esc((S.ds.reales[k].cargado || '').slice(0, 10)) + '</td><td><button class="btn ghost small" data-del="' + k + '">Quitar</button></td></tr>').join('') + '</table>' +
      '<h4 style="font-family:var(--sora);margin:24px 0 6px">Últimas cargas</h4><p class="muted" style="font-size:13px">' + (cargas.map(c => esc(c.fecha.slice(0, 10)) + ' · ' + esc(nombreMes(c.periodo)) + ' · ' + esc(c.archivo)).join('<br>') || 'Sin cargas') + '</p>' +
      '<div class="row-actions"><button class="btn ghost" id="mx">Cerrar</button><button class="btn ghost" id="salir">Salir</button></div>');
    $('#mx', m).onclick = () => m.remove();
    $('#salir', m).onclick = () => { S.ds = null; S.key = null; m.remove(); renderLogin(); };
    $('#cc', m).onclick = async () => {
      const a = $('#c1', m).value, b = $('#c2', m).value;
      if (a.length < 10) { $('#cmsg', m).innerHTML = '<p class="down">La clave debe tener al menos 10 caracteres.</p>'; return; }
      if (a !== b) { $('#cmsg', m).innerHTML = '<p class="down">Las claves no coinciden.</p>'; return; }
      const nk = await C.newKey(a); S.key = nk.key; S.salt = nk.salt;
      await guardar(await C.encryptDataset(S.ds, S.key, S.salt));
      $('#cmsg', m).innerHTML = '<p class="up">Clave cambiada. Se descargó dataset.json con la nueva clave.</p>' + pasosPublicar;
    };
    m.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const k = b.dataset.del;
      if (!window.confirm('¿Quitar ' + nombreMes(k) + ' del tablero? Se descargará el dataset.json actualizado.')) return;
      delete S.ds.reales[k];
      await guardar(await C.encryptDataset(S.ds, S.key, S.salt));
      const r = C.mesesReales(S.ds); S.mes = r.length ? r[r.length - 1] : C.mesesPlan(S.ds)[0];
      m.remove(); render(); toast('Mes quitado. Suba el dataset.json descargado a GitHub para publicarlo.', 6000);
    });
  }

  boot();
})();
