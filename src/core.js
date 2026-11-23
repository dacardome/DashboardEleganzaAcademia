/*
 * Eleganza Academia - Tablero financiero (Daniel Financiero)
 * core.js: lógica pura (sin DOM). Se usa en el navegador y en Node (scripts/seed.mjs, scripts/test.mjs).
 *
 * Capas:
 *   1. Utilidades
 *   2. Sedes y clasificación de cuentas del informe a socios (CEINDER S.A.S.)
 *   3. Parser del informe a socios (.xlsx) -> resultados reales por sede del mes
 *   4. Motor: estado de resultados real y plan 2027 por sede, consolidado, acumulados
 *   5. Cifrado del dataset (PBKDF2 + AES-GCM, WebCrypto)
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.EACore = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ------------------------------------------------------------------ 1. utilidades
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const pad2 = n => String(n).padStart(2, '0');
  const keyOf = (y, m) => y + '-' + pad2(m);
  const keyParts = k => { const [y, m] = k.split('-').map(Number); return { y, m }; };
  const keyLabel = (k, corto) => { const { y, m } = keyParts(k); return (corto ? MESES_CORTO[m - 1] : MESES[m - 1]) + (corto ? ' ' + String(y).slice(2) : ' ' + y); };
  const addMonths = (k, n) => { const { y, m } = keyParts(k); const t = y * 12 + (m - 1) + n; return keyOf(Math.floor(t / 12), (t % 12) + 1); };
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v).trim();
    if (!s || s.startsWith('#')) return 0;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/\$/g, '').replace(/\s/g, '');
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? (neg ? -n : n) : 0;
  }
  const round = v => Math.round(v || 0);

  // ------------------------------------------------------------------ 2. sedes y cuentas
  // Código del centro de costos en el informe -> nombre usado en el plan 2027
  const SEDES = [
    [11, 'Pereira Centro'], [12, 'Medellín'], [13, 'Cali Tequendama'], [14, 'Cartagena'], [15, 'Barranquilla'], [16, 'Chapinero'],
    [29, 'Pasto'], [31, 'Valledupar'], [32, 'Montería'], [33, 'Barrancabermeja'], [34, 'Ibagué'], [35, 'Soacha'], [36, 'Kennedy'],
    [37, 'Cali Córdoba'], [38, 'Itagüí'], [39, 'Buenaventura'], [40, 'Sincelejo'], [43, 'Suba'], [48, 'Fontibón'], [49, 'Cali Norte'],
    [50, 'Venecia'], [51, 'Jamundí'], [57, 'Pereira Batallón'], [58, 'Zipaquirá']
  ];
  const SEDE_POR_CODIGO = Object.fromEntries(SEDES);
  const NOMBRES_SEDES = SEDES.map(s => s[1]);

  // Líneas del estado de resultados de gestión (mismo criterio del plan financiero 2027)
  const LINEAS = [
    { k: 'ing', t: 'Ingresos netos' },
    { k: 'cvEst', t: 'Uniformes, kits, cartillas y diplomas', g: 'cv' },
    { k: 'cvDoc', t: 'Docentes', g: 'cv' },
    { k: 'cvIns', t: 'Insumos de enseñanza y eventos', g: 'cv' },
    { k: 'cv', t: 'Costos variables directos', sub: true },
    { k: 'bonCom', t: 'Bonificaciones comerciales', g: 'bon' },
    { k: 'imp', t: 'Impuestos sobre ingresos', g: 'bon' },
    { k: 'bon', t: 'Bonificaciones e impuestos', sub: true },
    { k: 'mc', t: 'Margen de contribución', total: true },
    { k: 'personal', t: 'Personal de sede', g: 'fijos' },
    { k: 'arriendo', t: 'Arriendo', g: 'fijos' },
    { k: 'servicios', t: 'Servicios públicos e internet', g: 'fijos' },
    { k: 'mantenimiento', t: 'Mantenimiento y adecuaciones', g: 'fijos' },
    { k: 'otros', t: 'Otros gastos de sede', g: 'fijos' },
    { k: 'iva', t: 'Provisión IVA', g: 'fijos' },
    { k: 'fijos', t: 'Gastos fijos de sede', sub: true },
    { k: 'pau', t: 'Pauta y mercadeo' },
    { k: 'con', t: 'Contribución de la sede', total: true },
    { k: 'corp', t: 'Gasto corporativo asignado' },
    { k: 'fin', t: 'Gastos financieros' },
    { k: 'uai', t: 'Utilidad de gestión', total: true }
  ];
  const CLAVES = ['ing', 'cvEst', 'cvDoc', 'cvIns', 'bonCom', 'imp', 'personal', 'arriendo', 'servicios', 'mantenimiento', 'otros', 'iva', 'pau', 'corp', 'fin', 'extra', 'capex', 'socios'];

  const PERSONAL = new Set([52050601, 52050607, 52051501, 52052701, 52053001, 52053301, 52053601, 52053901, 52055101, 52057001, 52057201, 52057301, 52059503]);
  const SERVICIOS = new Set([52352501, 52352502, 52353001, 52353003, 52353004, 52356501, 52356502, 52353501, 52353502, 52353503]);

  /** Clasifica una cuenta del informe a socios en una clave de línea. */
  function clasificaCuenta(cta, nombre) {
    const c = String(cta); const n = norm(nombre); const ci = parseInt(c, 10);
    if (c.startsWith('41')) return 'ing';
    if (c.startsWith('61')) {
      if (n.includes('NOMINA DOCENTE')) return 'cvDoc';
      if (n.includes('ENSE') || n.includes('INSUMOS') || n.includes('EVENTOS') || n.includes('OTROS COSTOS')) return 'cvIns';
      return 'cvEst';
    }
    if (c.startsWith('51')) return 'corp';
    if (c.startsWith('53')) {
      if (n.includes('INTERES') && !n.includes('SANCION')) return 'fin';
      if (n.includes('4*1000') || n.includes('4X1000')) return 'imp';
      return 'corp';
    }
    if (c.startsWith('52')) {
      if (n.includes('PROPAGANDA') || n.includes('PIBLICIDAD') || n.includes('PUBLICIDAD') || n.includes('LIVE') || n.includes('FOCUS') || n.includes('INFLUENCER')) return 'pau';
      if (n.includes('BONIFICACION') || n.includes('COMISION')) return 'bonCom';
      if (n.includes('INDUSTRIA') || n.includes('IMPTOS') || n.includes('IMPUESTO')) return 'imp';
      if (n.includes('EXTRAAAORD') || n.includes('EXTRAORD')) return 'extra';
      if (n.includes('REPARACIONES') || n.includes('ADECUACION')) return 'mantenimiento';
      if (n.includes('ARRENDAMIENTO') || n.includes('ADMINISTRACION')) return 'arriendo';
      if (PERSONAL.has(ci)) return 'personal';
      if (SERVICIOS.has(ci)) return 'servicios';
      return 'otros';
    }
    return null;
  }
  /** Filas especiales (sin código de cuenta) al final del informe. */
  function clasificaEspecial(texto) {
    const n = norm(texto);
    if (n.startsWith('PROVISION INDUSTRIA')) return 'imp';
    if (n.startsWith('PROVISION IVA') || n === 'PROVISION IVA') return 'iva';
    if (n.startsWith('COMPRA DE ACTIVOS')) return 'capex';
    if (n.startsWith('AUTORENTA')) return 'imp';
    if (n.startsWith('UTILIDAD O PERDIDA NETA SOCIOS')) return 'socios';
    return null;
  }

  // ------------------------------------------------------------------ 3. parser
  const MES_TOKENS = [['ENERO', 1], ['FEBRERO', 2], ['FEBR', 2], ['MARZO', 3], ['ABRIL', 4], ['MAYO', 5], ['JUNIO', 6], ['JULIO', 7], ['AGOSTO', 8],
    ['SEPTIEMBRE', 9], ['SETIEMBRE', 9], ['SEPT', 9], ['OCTUBRE', 10], ['NOVIEMBRE', 11], ['DICIEMBRE', 12], ['ENE', 1], ['FEB', 2], ['MAR', 3], ['ABR', 4],
    ['JUN', 6], ['JUL', 7], ['AGO', 8], ['SEP', 9], ['OCT', 10], ['NOV', 11], ['DIC', 12]];
  /** Mes y año a partir de un texto (nombre del archivo u hoja). */
  function periodoDeTexto(texto) {
    const n = norm(texto).replace(/[_\-.]/g, ' ');
    const ym = n.match(/20\d{2}/); const y = ym ? +ym[0] : null;
    let m = null;
    for (const [tok, mm] of MES_TOKENS) { if (new RegExp('(^|[^A-Z])' + tok + '([^A-Z]|$)').test(n)) { m = mm; break; } }
    return { y, m };
  }

  /** Busca la hoja del estado de resultados por centro de costos. rowsBySheet: {nombre: filas[][]} */
  function encontrarHoja(rowsBySheet) {
    let mejor = null;
    for (const [nombre, rows] of Object.entries(rowsBySheet)) {
      for (let i = 0; i < Math.min(rows.length, 40); i++) {
        const r = rows[i] || [];
        if (norm(r[0]) !== 'CUENTA') continue;
        const cols = [];
        for (let j = 1; j < r.length; j++) {
          const h = norm(r[j]);
          if (!h) continue;
          if (h.startsWith('TOTAL')) break;
          const m = h.match(/(\d{2,4})/);
          if (m && SEDE_POR_CODIGO[parseInt(m[1], 10)]) cols.push({ j, sede: SEDE_POR_CODIGO[parseInt(m[1], 10)], header: String(r[j]).trim() });
        }
        let total = r.findIndex(v => norm(v).startsWith('TOTAL'));
        if (cols.length >= 10 && (!mejor || cols.length > mejor.cols.length)) mejor = { nombre, fila: i, cols, total: total > 0 ? total : null };
      }
    }
    return mejor;
  }

  /**
   * Parser del informe a socios. Devuelve { periodo, hoja, sedes:{sede:{...}}, cuentas:[...], control }.
   * rowsBySheet: {hoja: matriz de valores} (SheetJS sheet_to_json header:1).
   */
  function parseInforme(rowsBySheet, nombreArchivo) {
    const H = encontrarHoja(rowsBySheet);
    if (!H) throw new Error('No se encontró la hoja del estado de resultados por sede (fila con "CUENTA" y los centros de costos).');
    const rows = rowsBySheet[H.nombre];
    const vacio = () => Object.fromEntries(CLAVES.map(k => [k, 0]));
    const sedes = Object.fromEntries(NOMBRES_SEDES.map(s => [s, vacio()]));
    const cuentas = [];
    let totalInforme = 0, totalCalc = 0, sinClase = [];
    for (let i = H.fila + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const a = r[0]; const cod = String(a == null ? '' : a).trim();
      let clase = null, nombre = '', cta = '';
      if (/^\d{8}$/.test(cod)) { cta = cod; nombre = String(r[1] || '').trim(); clase = clasificaCuenta(cod, nombre); if (!clase) sinClase.push(cod + ' ' + nombre); }
      else if (cod && isNaN(+cod)) { clase = clasificaEspecial(cod); nombre = cod; cta = ''; }
      if (!clase) continue;
      const v = H.cols.map(c => num(r[c.j]));
      if (!v.some(x => x)) continue;
      const signo = (clase === 'ing' || clase === 'socios') ? 1 : 1;
      H.cols.forEach((c, j) => { sedes[c.sede][clase] += signo * v[j]; });
      if (clase !== 'socios') {
        cuentas.push({ cta, nombre, clase, v: v.map(round) });
        if (clase === 'ing') { totalCalc += v.reduce((a, b) => a + b, 0); if (H.total) totalInforme += num(r[H.total]); }
      }
    }
    for (const s of NOMBRES_SEDES) for (const k of CLAVES) sedes[s][k] = round(sedes[s][k]);
    // periodo: nombre de archivo, luego nombre de hoja
    let p = periodoDeTexto(nombreArchivo || '');
    const ph = periodoDeTexto(H.nombre);
    if (!p.m) p.m = ph.m; if (!p.y) p.y = ph.y;
    const periodo = p.y && p.m ? keyOf(p.y, p.m) : null;
    return {
      periodo, hoja: H.nombre, sedesDetectadas: H.cols.length, sedes, cuentas,
      control: { ingresosSedes: round(totalCalc), ingresosColumnaTotal: round(totalInforme), cuadra: !H.total || Math.abs(totalCalc - totalInforme) < 2, sinClase }
    };
  }

  // ------------------------------------------------------------------ 4. motor
  /** Completa subtotales e indicadores de un objeto de líneas. */
  function completar(L) {
    const o = Object.assign({}, L);
    o.cv = (o.cvEst || 0) + (o.cvDoc || 0) + (o.cvIns || 0) + (o.cvPlan || 0);
    o.bon = (o.bonCom || 0) + (o.imp || 0) + (o.bonPlan || 0);
    o.mc = o.ing - o.cv - o.bon;
    o.fijos = ['personal', 'arriendo', 'servicios', 'mantenimiento', 'otros', 'iva'].reduce((a, k) => a + (o[k] || 0), 0);
    o.con = o.mc - o.fijos - (o.pau || 0);
    o.uai = o.con - (o.corp || 0) - (o.fin || 0);
    o.mcP = o.ing ? o.mc / o.ing : 0;
    o.uaiP = o.ing ? o.uai / o.ing : 0;
    o.gastos = o.fijos + (o.pau || 0) + (o.corp || 0) + (o.fin || 0);
    o.pe = o.mcP > 0 ? o.gastos / o.mcP : null;
    o.ms = o.pe != null && o.ing ? 1 - o.pe / o.ing : null;
    o.pauP = o.ing ? (o.pau || 0) / o.ing : 0;
    return o;
  }
  const sumar = (lista) => { const o = {}; for (const L of lista) for (const [k, v] of Object.entries(L)) if (typeof v === 'number') o[k] = (o[k] || 0) + v; return o; };

  /** Resultado real de un mes para una sede o 'Todas'. null si no hay datos. */
  function real(ds, k, sede) {
    const P = ds.reales && ds.reales[k];
    if (!P) return null;
    const base = sede === 'Todas' ? sumar(Object.values(P.sedes)) : P.sedes[sede];
    if (!base) return null;
    return completar(base);
  }

  const ESCENARIOS = { vigente: 'Presupuesto vigente', base: 'Plan base', ajustado: 'Plan ajustado', sinkit: 'Sin kit y sin aumento' };
  /** Plan de un mes (clave AAAA-MM del año del plan) para una sede o 'Todas'. */
  function plan(ds, esc, k, sede) {
    const PL = ds.plan; if (!PL) return null;
    const { y, m } = keyParts(k); if (y !== PL.anio) return null;
    const i = m - 1;
    const uno = s => {
      const d = PL.plan[esc] && PL.plan[esc][s]; if (!d) return null;
      const fx = esc === 'vigente' && ds.params ? ds.params.sedes[s].presupuesto : PL.fijos[s];
      const fijBreak = ['personal', 'arriendo', 'servicios', 'mantenimiento', 'otros', 'iva'].reduce((a, kk) => a + fx[kk], 0);
      const ajuste = d.fij[i] - fijBreak; // diferencia de redondeo
      return {
        ing: d.ing[i], cvPlan: d.cv[i], bonPlan: d.bon[i], personal: fx.personal, arriendo: fx.arriendo, servicios: fx.servicios,
        mantenimiento: fx.mantenimiento, otros: fx.otros + ajuste, iva: fx.iva, pau: d.pau[i], corp: d.corp[i], fin: d.fin[i],
        nue: d.nue[i], act: d.act[i], ga: d.ga[i]
      };
    };
    const base = sede === 'Todas' ? sumar(PL.sedes.map(uno).filter(Boolean)) : uno(sede);
    return base ? completar(base) : null;
  }
  /** Suma de varios meses (real o plan). */
  function acumular(fn, keys) {
    const xs = keys.map(fn).filter(Boolean);
    if (!xs.length) return null;
    const s = sumar(xs);
    return completar(s);
  }
  function mesesReales(ds) { return Object.keys(ds.reales || {}).sort(); }
  function mesesPlan(ds) { return ds.plan ? Array.from({ length: 12 }, (_, i) => keyOf(ds.plan.anio, i + 1)) : []; }

  /** Tabla por sede de un mes: real y plan. */
  function porSede(ds, k, esc) {
    return NOMBRES_SEDES.map(s => ({ sede: s, real: real(ds, k, s), plan: plan(ds, esc, k, s) }));
  }


  // ------------------------------------------------------------------ 4b. parámetros y presupuesto vigente
  const CURSOS = [['MAN', 'Manicure'], ['CEJ', 'Cejas y pestañas'], ['BAR', 'Barbería'], ['MAQ', 'Maquillaje'], ['EST', 'Estilismo'], ['PEI', 'Peinados'], ['MAS', 'Masajes']];
  const LINEAS_FIJAS = [['personal', 'Personal de sede'], ['arriendo', 'Arriendo'], ['servicios', 'Servicios públicos e internet'], ['mantenimiento', 'Mantenimiento y adecuaciones'], ['otros', 'Otros gastos de sede'], ['iva', 'Provisión IVA']];

  /**
   * Presupuesto vigente: plan 2027 recalculado con los parámetros editables de cada sede.
   *   volumen  f   = (salones plan × franjas por salón × ocupación plan) / (franjas base × ocupación base del plan)
   *   precio       = ingreso sin aumento + (ingreso plan base − ingreso sin aumento) × incremento / incremento del plan base
   *   kit          = costo variable del plan base (con kit) o del escenario sin kit
   *   inscritos nuevos y pauta se multiplican por f desde enero; ingresos, costos variables, estudiantes activos
   *   y grupos llegan a f en forma gradual durante los primeros meses (mesesRampa = duración promedio del curso)
   *   pauta        = pauta del plan × f × CAC parámetro / CAC del plan
   *   fijos        = presupuesto mensual de la sede (parámetro); corporativo y financieros = plan base
   * Con los parámetros iniciales (sin cambios) reproduce exactamente el plan base.
   */
  function vigenteSede(PL, G, p, s) {
    const b = PL.plan.base[s], k = PL.plan.sinkit[s], cap = PL.capacidad[s];
    const capBase = (cap.franjas || 1) * (cap.ocup2027 || 0);
    const f = capBase > 0 ? (p.salonesPlan * G.franjasSalon * p.ocupPlan) / capBase : 0;
    const inc = p.incPrecio == null ? G.incPrecio : p.incPrecio;
    const incR = G.incPrecioBase ? inc / G.incPrecioBase : 1;
    const cacR = p.cacPlan ? (p.cac || p.cacPlan) / p.cacPlan : 1;
    const fij = LINEAS_FIJAS.reduce((a, [kk]) => a + (+p.presupuesto[kk] || 0), 0);
    const o = { ing: [], cv: [], bon: [], mc: [], fij: [], pau: [], con: [], corp: [], fin: [], uai: [], uaiPleno: [], nue: [], act: [], ga: [], f };
    const rampa = Math.max(1, G.mesesRampa || 1);
    for (let i = 0; i < 12; i++) {
      // los inscritos nuevos (y su pauta) cambian desde enero; los estudiantes activos, y con ellos el recaudo,
      // los docentes y los kits, se acumulan a medida que entran las cohortes (rampa = duración del curso)
      const fa = 1 + (f - 1) * Math.min(1, (i + 1) / rampa);
      const ing0 = k.ing[i] + (b.ing[i] - k.ing[i]) * incR;
      const ing = ing0 * fa, cv = (p.kit ? b.cv[i] : k.cv[i]) * fa, bon = b.ing[i] ? b.bon[i] / b.ing[i] * ing : 0;
      const pau = b.pau[i] * f * cacR, mc = ing - cv - bon, con = mc - fij - pau, uai = con - b.corp[i] - b.fin[i];
      o.ing.push(ing); o.cv.push(cv); o.bon.push(bon); o.mc.push(mc); o.fij.push(fij); o.pau.push(pau); o.con.push(con);
      o.corp.push(b.corp[i]); o.fin.push(b.fin[i]); o.uai.push(uai);
      { const ingP = ing0 * f, cvP = (p.kit ? b.cv[i] : k.cv[i]) * f, bonP = b.ing[i] ? b.bon[i] / b.ing[i] * ingP : 0; o.uaiPleno.push(ingP - cvP - bonP - fij - pau - b.corp[i] - b.fin[i]); } o.nue.push(b.nue[i] * f); o.act.push(b.act[i] * fa); o.ga.push(b.ga[i] * fa);
    }
    return o;
  }
  function recalcular(ds) {
    const PL = ds.plan; if (!PL || !ds.params) return ds;
    const G = ds.params.generales; PL.plan.vigente = {};
    for (const s of PL.sedes) PL.plan.vigente[s] = vigenteSede(PL, G, ds.params.sedes[s], s);
    return ds;
  }

  /** Capacidad y ocupación operativa de una sede (o 'Todas') según parámetros. */
  function capacidad(ds, sede) {
    const G = ds.params.generales;
    const uno = s => {
      const p = ds.params.sedes[s];
      const franjas = p.salones * G.franjasSalon, cupos = franjas * G.cupo;
      const cursos = {}; let gc = 0, ec = 0, pc = 0;
      for (const [c] of CURSOS) { const x = p.cursos[c] || { grupos: 0, estudiantes: 0, programados: 0 }; cursos[c] = Object.assign({}, x); gc += x.grupos; ec += x.estudiantes; pc += x.programados || 0; }
      return {
        salones: p.salones, salonesPlan: p.salonesPlan, salonesPosibles: p.salonesPosibles, franjas, cupos, franjasPosibles: p.salonesPosibles * G.franjasSalon,
        grupos: p.gruposActivos, estudiantes: p.estudiantesActivos, cursos, gruposCursos: gc, estCursos: ec, programados: pc,
        inscMes: p.inscMesHist, desercionPond: p.desercion * p.inscMesHist, cacPond: p.cac * p.inscMesHist, n: 1
      };
    };
    const lista = sede === 'Todas' ? NOMBRES_SEDES.map(uno) : [uno(sede)];
    const t = lista.reduce((a, x) => {
      for (const kk of ['salones', 'salonesPlan', 'salonesPosibles', 'franjas', 'cupos', 'franjasPosibles', 'grupos', 'estudiantes', 'gruposCursos', 'estCursos', 'programados', 'inscMes', 'desercionPond', 'cacPond', 'n']) a[kk] = (a[kk] || 0) + x[kk];
      for (const [c] of CURSOS) { a.cursos[c] = a.cursos[c] || { grupos: 0, estudiantes: 0, programados: 0 }; for (const z of ['grupos', 'estudiantes', 'programados']) a.cursos[c][z] += x.cursos[c][z] || 0; }
      return a;
    }, { cursos: {} });
    t.ocupFranjas = t.franjas ? t.grupos / t.franjas : 0;
    t.ocupCupos = t.cupos ? t.estudiantes / t.cupos : 0;
    t.estPorGrupo = t.grupos ? t.estudiantes / t.grupos : 0;
    t.libres = Math.max(0, t.franjas - t.grupos);
    t.habilitables = Math.max(0, Math.floor(t.franjas * G.topeOcupacion) - t.grupos);
    t.desercion = t.inscMes ? t.desercionPond / t.inscMes : 0;
    t.cac = t.inscMes ? t.cacPond / t.inscMes : 0;
    return t;
  }

  /** Presupuesto de gastos de un mes (vigente). En meses fuera del año del plan: fijos del parámetro y promedio mensual del resto. */
  function presupuestoMes(ds, k, sede) {
    const PL = ds.plan; if (!PL || !ds.params) return null;
    const P = plan(ds, 'vigente', k, sede);
    if (P) return Object.assign(P, { promedio: false });
    const A = acumular(kk => plan(ds, 'vigente', kk, sede), mesesPlan(ds));
    const o = {}; for (const [kk, v] of Object.entries(A)) if (typeof v === 'number') o[kk] = v / 12;
    const sedes = sede === 'Todas' ? NOMBRES_SEDES : [sede];
    for (const [kk] of LINEAS_FIJAS) o[kk] = sedes.reduce((a, s) => a + (+ds.params.sedes[s].presupuesto[kk] || 0), 0);
    return Object.assign(completar(o), { promedio: true });
  }

  /** Evaluación financiera de una sede como inversión: flujos mensuales del presupuesto vigente. */
  function evaluarInversion(ds, s) {
    const G = ds.params.generales, p = ds.params.sedes[s], V = ds.plan.plan.vigente[s];
    const fijMes = V.fij[0], capTrabajo = p.nueva ? fijMes * G.mesesCapitalTrabajo : 0, inversion = +p.inversion || 0; // sede existente: sin capital de trabajo nuevo
    const H = G.horizonteMeses, tm = Math.pow(1 + G.tasaDescuento, 1 / 12) - 1;
    const flujos = [-(inversion + capTrabajo)];
    // año 1 = presupuesto vigente 2027 (con rampa); años siguientes = mismo calendario con la ocupación plena
    for (let t = 1; t <= H; t++) flujos.push((t <= 12 ? V.uai[t - 1] : V.uaiPleno[(t - 1) % 12]) + (t === H ? capTrabajo : 0));
    const vpn = r => flujos.reduce((a, x, t) => a + x / Math.pow(1 + r, t), 0);
    let tir = null;
    if (flujos[0] < 0 && flujos.slice(1).reduce((a, b) => a + b, 0) > -flujos[0]) {
      let lo = -0.99, hi = 1;
      for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (vpn(mid) > 0) lo = mid; else hi = mid; }
      tir = Math.pow(1 + (lo + hi) / 2, 12) - 1;
    }
    let acum = flujos[0], payback = null;
    for (let t = 1; t <= H; t++) { acum += flujos[t]; if (payback == null && acum >= 0) payback = t; }
    const uaiAnual = V.uai.reduce((a, b) => a + b, 0);
    const mesesNeg = V.uai.filter(x => x < 0).length;
    const primerPositivo = V.uai.findIndex(x => x >= 0);
    const uaiPleno = V.uaiPleno.reduce((a, b) => a + b, 0);
    return { inversion, capTrabajo, total: inversion + capTrabajo, fijMes, uaiAnual, uaiPleno, uaiMes: uaiAnual / 12, vpn: vpn(tm), tir, payback, mesesNeg, primerPositivo, flujos, horizonte: H, tasa: G.tasaDescuento };
  }
  /**
   * Detalle por curso de una sede (o 'Todas') y un mes:
   *   grupos y estudiantes activos (parámetros), ocupación de cupos = estudiantes / (grupos × cupo),
   *   % de franjas = grupos del curso / franjas de la sede, peso en ingresos estimado = estudiantes × precio / duración,
   *   rendimiento del espacio = peso en ingresos / peso en grupos, inscritos y grupos iniciados del mes.
   */
  function cursosDetalle(ds, sede, k) {
    const P = ds.params, G = P.generales, info = P.cursosInfo || {};
    const sedes = sede === 'Todas' ? NOMBRES_SEDES : [sede];
    const cap = capacidad(ds, sede);
    const mes = (P.inscritosMes || {})[k] || null;
    const filas = CURSOS.map(([c, nombre]) => {
      const i = info[c] || { precio: 0, duracion: 1, cupo: G.cupo };
      let grupos = 0, est = 0, insc = 0, gMes = 0;
      for (const s of sedes) {
        const x = P.sedes[s].cursos[c] || {}; grupos += x.grupos || 0; est += x.estudiantes || 0;
        if (mes && mes[s] && mes[s][c]) { insc += mes[s][c].inscritos || 0; gMes += mes[s][c].grupos || 0; }
      }
      return { c, nombre, grupos, est, insc, gMes, cupo: i.cupo || G.cupo, ingMes: est * (i.precio || 0) / (i.duracion || 1), precio: i.precio, duracion: i.duracion };
    });
    const T = filas.reduce((a, x) => { a.grupos += x.grupos; a.est += x.est; a.insc += x.insc; a.gMes += x.gMes; a.ingMes += x.ingMes; a.cupos += x.grupos * x.cupo; return a; }, { grupos: 0, est: 0, insc: 0, gMes: 0, ingMes: 0, cupos: 0 });
    for (const x of filas) {
      x.llenado = x.grupos ? x.est / (x.grupos * x.cupo) : null;

      x.pesoGrupos = T.grupos ? x.grupos / T.grupos : 0;
      x.pctFranjas = x.pesoGrupos * cap.ocupFranjas; // reparte la ocupación real de franjas según la mezcla de grupos
      x.pesoEst = T.est ? x.est / T.est : 0;
      x.pesoIng = T.ingMes ? x.ingMes / T.ingMes : 0;
      x.pesoInsc = T.insc ? x.insc / T.insc : 0;
      x.rendimiento = x.pesoGrupos ? x.pesoIng / x.pesoGrupos : null;
      x.inscPorGrupo = x.gMes ? x.insc / x.gMes : null;
    }
    T.llenado = T.cupos ? T.est / T.cupos : null;
    T.pctFranjas = cap.ocupFranjas;
    T.franjas = cap.franjas;
    T.hayMes = !!mes;
    const tot = (P.inscripcionesTotal || {})[k];
    T.inscripcionesMes = tot ? sedes.reduce((a, s) => a + (tot[s] || 0), 0) : null;
    return { filas, T };
  }
  function mesesDesde(k0, k1) { if (!k0) return null; const a = keyParts(k0), b = keyParts(k1); return (b.y - a.y) * 12 + (b.m - a.m); }

  // ------------------------------------------------------------------ 4b. simulador de escenarios 2027
  // Réplica del motor de cohortes del Excel del plan (hoja Motor): una fila por sede × curso × mes de inicio.
  // Activos(t) = inscritos × (1 − deserción × acumulada[curso][mes del curso]); ingreso = activos × pago medio × n.° pagos / duración.
  // Costo variable: costo por inscrito al inicio (kit, uniforme, cartilla, insumos), diploma al graduarse y docente por grupo activo.
  // Las cohortes reales 2026 no cambian; las cohortes del plan se escalan con la ocupación objetivo de cada sede (igual que Calc_Ajuste).
  const SIM_LINEAS_FIJAS = ['personal', 'arriendo', 'servicios', 'mantenimiento', 'otros', 'iva'];
  const SIM_FX_COL = { personal: 'Personal 2027', arriendo: 'Arriendo 2027', servicios: 'Servicios 2027', mantenimiento: 'Mantenimiento 2027', otros: 'Otros fijos 2027', iva: 'Provisión IVA 2027' };
  const r2 = v => Math.round(v * 100) / 100;

  /** Lee el Excel del plan 2027 (valores calculados) y arma la base del simulador. rows: {hoja: filas[][]} */
  function simDesdeExcel(rows, archivo) {
    const need = ['Motor', 'Cursos', 'Sedes', 'Supuestos', 'Sedes_Criticas'];
    const falta = need.filter(n => !rows[n]);
    if (falta.length) throw new Error('El archivo no es el plan financiero 2027: faltan las hojas ' + falta.join(', ') + '.');
    const colDe = (hdr, nombre, desde) => { const i = hdr.findIndex((h, j) => j >= (desde || 0) && norm(h) === norm(nombre)); if (i < 0) throw new Error('No se encontró la columna «' + nombre + '».'); return i; };
    // supuestos (columna B = etiqueta, C = valor)
    const sup = {}; const SUP = { 'Incremento de precios de cursos 2027': 'incP', 'Incremento salarial y tarifa docente 2027': 'incS', 'Incremento gastos fijos (IPC) 2027': 'ipc',
      'Incremento costo de kits, uniformes e insumos 2027': 'incI', '% bonificaciones comerciales sobre ingresos': 'bon', 'Gasto corporativo mensual 2026 (base)': 'corp',
      'Gastos financieros (intereses) mensual 2026': 'fin', 'Criterio de asignación del corporativo': 'crit', 'Recaudo en el mismo mes (% del ingreso causado)': 'p0',
      'Recaudo al mes siguiente': 'p1', 'Recaudo a 2 meses': 'p2', 'Saldo de caja consolidado al 1-ene-2027': 'caja', 'Descuento promedio sobre precio de lista': 'desc', 'Año del plan': 'anio' };
    for (const r of rows.Supuestos) {
      const lab = r && r[1]; if (!lab) continue;
      const k = SUP[lab] || (String(lab).startsWith('% impuestos y tasas') ? 'imp' : null);
      if (k && sup[k] === undefined) sup[k] = k === 'crit' ? String(r[2] || 'Ingresos') : num(r[2]);
    }
    ['incP', 'incS', 'ipc', 'incI', 'bon', 'imp', 'corp', 'fin'].forEach(k => { if (sup[k] === undefined) throw new Error('No se encontró el supuesto ' + k + ' en la hoja Supuestos.'); });
    sup.anio = sup.anio || 2027;
    // cursos
    const cu = rows.Cursos; const hc = cu[4] || [];
    const iP = colDe(hc, 'Valor de cada pago 2026 (sitio web)'), iK = colDe(hc, 'N° pagos (inscripción + cuotas)'), iJ = colDe(hc, 'Duración (meses)'),
      iKit = colDe(hc, 'Kit / est.'), iM = colDe(hc, 'Costo por inscrito 2027'), iN = colDe(hc, 'Diploma 2027'), iO = colDe(hc, 'Docente por grupo por mes 2027');
    const opc = n => hc.findIndex(h => norm(h) === norm(n));
    const iU = opc('Uniforme / est.'), iC = opc('Cartilla / est.'), iIn = opc('Insumos profesor / est.'), iD = opc('Diploma + curso virtual / graduado');
    const cursos = [];
    for (let i = 5; i < cu.length && cu[i] && cu[i][0] && cursos.length < 7; i++) {
      const r = cu[i], x = { c: String(r[0]), p26: num(r[iP]), K: num(r[iK]), J: num(r[iJ]), kit26: num(r[iKit]), M: num(r[iM]), N: num(r[iN]), O: num(r[iO]), cum: [] };
      if (iU >= 0 && iC >= 0 && iIn >= 0 && iD >= 0) { x.uni26 = num(r[iU]); x.cart26 = num(r[iC]); x.ins26 = num(r[iIn]); x.dip26 = num(r[iD]); }
      cursos.push(x);
    }
    const filaCum = cu.findIndex(r => r && norm(r[0]) === 'CURSO' && norm(r[1]) === 'ACUM. MES 1');
    if (filaCum < 0) throw new Error('No se encontró la curva de deserción acumulada en la hoja Cursos.');
    cursos.forEach((x, i) => { const r = cu[filaCum + 1 + i]; x.cum = Array.from({ length: 7 }, (_, j) => num(r[1 + j])); });
    const ci = Object.fromEntries(cursos.map((x, i) => [norm(x.c), i]));
    // sedes
    const se = rows.Sedes; const hs = se[4] || [];
    const jS = colDe(hs, 'Salones'), jK = colDe(hs, 'Ocupación 2027 (escenario)'), jC = colDe(hs, 'CAC 2027');
    const jF = Object.fromEntries(SIM_LINEAS_FIJAS.map(k => [k, colDe(hs, SIM_FX_COL[k])]));
    const cr = {}; let meta = null;
    for (const r of rows.Sedes_Criticas) {
      if (r && norm(r[0]).startsWith('META')) meta = num(r[2]);
      if (r && NOMBRES_SEDES.includes(r[0]) && typeof r[2] === 'number') cr[r[0]] = { critica: r[1] === 'Sí', ocBase: num(r[2]), ocAj: r[11] == null || r[11] === '' ? num(r[2]) : num(r[11]) };
    }
    const sedes = [];
    for (let i = 5; i < se.length; i++) {
      const r = se[i]; if (!r || !NOMBRES_SEDES.includes(r[0])) continue;
      const c = cr[r[0]] || { critica: false, ocBase: num(r[jK]), ocAj: num(r[jK]) };
      sedes.push({ n: r[0], salones: num(r[jS]), ocMotor: num(r[jK]), ocBase: c.ocBase, ocAj: c.ocAj, critica: c.critica, cac: num(r[jC]),
        fx: Object.fromEntries(SIM_LINEAS_FIJAS.map(k => [k, num(r[jF[k]])])) });
    }
    if (sedes.length !== 24) throw new Error('Se esperaban 24 sedes en la hoja Sedes y se encontraron ' + sedes.length + '.');
    const si = Object.fromEntries(sedes.map((x, i) => [x.n, i]));
    // motor
    const mo = rows.Motor; const hm = mo[4] || [];
    const mA = colDe(hm, 'Sede'), mB = colDe(hm, 'Curso'), mE = colDe(hm, 'Índice mes'), mF = colDe(hm, 'Origen'), mG = colDe(hm, 'Grupos'), mH = colDe(hm, 'Inscritos'), mI = colDe(hm, 'Deserción');
    const filas = [];
    for (let i = 5; i < mo.length; i++) {
      const r = mo[i]; if (!r || r[mA] == null || si[r[mA]] === undefined) continue;
      const c = ci[norm(r[mB])]; if (c === undefined) continue;
      filas.push([si[r[mA]], c, num(r[mE]), r[mF] === 'Plan' ? 1 : 0, r2(num(r[mG])), num(r[mH]), Math.round(num(r[mI]) * 1e6) / 1e6]);
    }
    if (filas.length < 1000) throw new Error('La hoja Motor no tiene valores calculados. Abra el archivo en Excel, guárdelo y vuelva a cargarlo.');
    return { v: 1, archivo: archivo || '', cargado: new Date().toISOString(), anio: sup.anio, meta, sup, cursos, sedes, filas };
  }

  /** Parámetros del escenario a partir de una plantilla. */
  function simPlantilla(B, tipo) {
    const sp = B.sup;
    const precios = {}; B.cursos.forEach(x => { const p = Math.round(x.p26 * (1 + sp.incP)); precios[x.c] = { insc: p, cuota: p }; });
    const sedes = {}; B.sedes.forEach(x => { sedes[x.n] = { oc: x.ocBase, salones: x.salones, kit: true, congelar: false, cac: Math.round(x.cac), red: { personal: 0, arriendo: 0, servicios: 0, mantenimiento: 0, otros: 0, iva: 0 } }; });
    const p = { precios, sedes, maqIgual: false, desc: sp.desc || 0, llen: 1, des: 1, incI: sp.incI, incS: sp.incS, ipc: sp.ipc, bon: sp.bon, imp: sp.imp, corp: sp.corp, fin: sp.fin, cacVar: 0, caja: sp.caja || 0 };
    const sinAumento = () => B.cursos.forEach(x => { precios[x.c] = { insc: x.p26, cuota: x.p26 }; });
    const soloCuotas = inc => B.cursos.forEach(x => { precios[x.c] = { insc: x.p26, cuota: Math.round(x.p26 * (1 + inc)) }; });
    if (tipo === 'ajustado') B.sedes.forEach(x => { sedes[x.n].oc = x.ocAj; });
    if (tipo === 'sinkit') { sinAumento(); B.sedes.forEach(x => { sedes[x.n].kit = false; }); }
    if (tipo === 'acordado' || tipo === 'acordadoMaq') {
      soloCuotas(sp.incP);
      B.sedes.forEach(x => { sedes[x.n].oc = x.ocAj; });
      const s = n => sedes[n] || {};
      if (sedes.Barrancabermeja) { const b = s('Barrancabermeja'); b.oc = B.sedes.find(x => x.n === 'Barrancabermeja').ocBase; b.salones = 2; b.red.arriendo = 0.5; b.red.servicios = 0.5; b.red.personal = 1 / 3; }
      if (sedes.Sincelejo) { const x = s('Sincelejo'); x.oc = 0.6; x.kit = false; x.congelar = true; }
      ['Venecia', 'Zipaquirá'].forEach(n => { if (sedes[n]) sedes[n].oc = 0.6; });
      if (tipo === 'acordadoMaq') p.maqIgual = true;
    }
    return p;
  }
  const SIM_PLANTILLAS = [['base', 'Plan base'], ['ajustado', 'Plan ajustado'], ['sinkit', 'Sin kit y sin aumento'], ['acordado', 'Plan acordado 19-nov'], ['acordadoMaq', 'Acordado con maquillaje igualado']];

  /** Costos unitarios 2027 de un curso en el escenario: por inscrito (uniforme, kit, cartilla, insumos), diploma y docente por grupo al mes. */
  function simCostosCurso(B, p, x) {
    const sp = B.sup, co = (p.costos || {})[x.c] || {}, fI = (1 + p.incI) / (1 + sp.incI), fS = (1 + p.incS) / (1 + sp.incS);
    const v = (k, def) => co[k] == null ? def : co[k];
    const kit = v('kit', x.kit26 * (1 + p.incI));
    let uniforme = null, cartilla = null, insumos = null, otros;
    if (x.uni26 != null) { uniforme = v('uniforme', x.uni26 * (1 + p.incI)); cartilla = v('cartilla', x.cart26 * (1 + p.incI)); insumos = v('insumos', x.ins26 * (1 + p.incI)); otros = uniforme + cartilla + insumos; }
    else otros = x.M * fI - x.kit26 * (1 + p.incI);
    return { kit, uniforme, cartilla, insumos, porInscrito: otros + kit, diploma: v('diploma', x.N * fI), docente: v('docente', x.O * fS), categorias: x.uni26 != null };
  }
  /** Corre el escenario. Devuelve por sede y mes (12 meses del año del plan) y el consolidado. */
  function simular(B, p) {
    const sp = B.sup, NS = B.sedes.length, T = 14; // t = −2..11 (nov-26 a dic-27); índice u = t + 2
    const zeros = () => new Float64Array(T);
    const S = B.sedes.map(() => ({ ing: zeros(), cvIns: zeros(), cvKit: zeros(), cvDip: zeros(), cvDoc: zeros(), nue: zeros(), act: zeros(), ga: zeros() }));
    const fI = (1 + p.incI) / (1 + sp.incI), fS = (1 + p.incS) / (1 + sp.incS), fIpc = (1 + p.ipc) / (1 + sp.ipc);
    const refMaq = B.cursos.find(x => x.c === 'Manicure');
    const cur = B.cursos.map(x => {
      const igual = p.maqIgual && x.c === 'Maquillaje' && refMaq; // maquillaje al precio de los demás cursos (también en sedes sin aumento)
      const pr = (p.precios || {})[igual ? refMaq.c : x.c] || { insc: x.p26 * (1 + sp.incP), cuota: x.p26 * (1 + sp.incP) };
      const K27 = Math.max(1, Math.round(((p.pagos || {})[igual ? refMaq.c : x.c]) || x.K));
      const u = simCostosCurso(B, p, x);
      const L26 = x.p26 * (1 - p.desc), Lcong = (igual ? refMaq.p26 : x.p26) * (1 - p.desc), L27 = (pr.insc + (K27 - 1) * pr.cuota) / K27 * (1 - p.desc);
      return { J: x.J, cum: x.cum, pm26: L26 * x.K / x.J, pmCong: Lcong * x.K / x.J, pm27: L27 * K27 / x.J, M: u.porInscrito, kit: u.kit, N: u.diploma, O: u.docente };
    });
    const sed = B.sedes.map(x => { const q = p.sedes[x.n] || {}; return { F: x.ocMotor ? (q.oc == null ? x.ocBase : q.oc) / x.ocMotor : 1, kit: q.kit !== false, cong: !!q.congelar }; });
    for (const f of B.filas) {
      const [s, c, E, plan, G0, H0, I0] = f; const k = cur[c], q = sed[s], o = S[s];
      const G = plan ? G0 * q.F : G0, H = plan ? H0 * q.F * p.llen : H0, I = plan ? Math.min(1, I0 * p.des) : I0;
      const pagoMes = E < 0 ? k.pm26 : q.cong ? k.pmCong : k.pm27;
      for (let u = 0; u < T; u++) {
        const kk = u - 2 - E; if (kk < 0 || kk >= k.J) continue;
        const act = H * (1 - I * k.cum[kk]);
        o.ing[u] += act * pagoMes;
        o.act[u] += act; o.ga[u] += G; o.cvDoc[u] += G * k.O;
        if (kk === 0) { const kit = plan && !q.kit ? 0 : k.kit; o.cvKit[u] += H * kit; o.cvIns[u] += H * (k.M - k.kit); if (plan) o.nue[u] += H; }
        if (kk === k.J - 1) o.cvDip[u] += H * (1 - I) * k.N;
      }
    }
    // estado de resultados mensual por sede
    const corpMes = p.corp * (1 + p.ipc), finMes = p.fin, tasaBon = p.bon + p.imp;
    const ingTot = Array.from({ length: 12 }, (_, m) => S.reduce((a, o) => a + o.ing[m + 2], 0));
    const actTot = Array.from({ length: 12 }, (_, m) => S.reduce((a, o) => a + o.act[m + 2], 0));
    const crit = norm(sp.crit || 'Ingresos');
    const sedes = B.sedes.map((x, s) => {
      const o = S[s], q = p.sedes[x.n] || {}, red = q.red || {};
      const cac = (q.cac == null ? x.cac : q.cac) * fIpc * (1 + (p.cacVar || 0));
      const fxMes = {}; SIM_LINEAS_FIJAS.forEach(k => { fxMes[k] = x.fx[k] * (k === 'personal' ? fS : k === 'iva' ? 1 : fIpc) * (1 - (red[k] || 0)); });
      const fij = SIM_LINEAS_FIJAS.reduce((a, k) => a + fxMes[k], 0);
      const M = [];
      for (let m = 0; m < 12; m++) {
        const u = m + 2, ing = o.ing[u];
        const cv = o.cvIns[u] + o.cvKit[u] + o.cvDip[u] + o.cvDoc[u];
        const bon = ing * tasaBon, mc = ing - cv - bon, pau = o.nue[u] * cac;
        const sh = crit === 'INGRESOS' ? (ingTot[m] ? ing / ingTot[m] : 0) : crit === 'ESTUDIANTES ACTIVOS' ? (actTot[m] ? o.act[u] / actTot[m] : 0) : 1 / NS;
        const corp = sh * corpMes, fin = sh * finMes, con = mc - fij - pau;
        M.push({ ing, cvIns: o.cvIns[u], cvKit: o.cvKit[u], cvDip: o.cvDip[u], cvDoc: o.cvDoc[u], cv, bon, mc, fij, fx: fxMes, pau, con, corp, fin, uai: con - corp - fin, nue: o.nue[u], act: o.act[u], ga: o.ga[u] });
      }
      return { n: x.n, M, ingPrev: [o.ing[0], o.ing[1]], cac, fijMes: fij };
    });
    const sumar12 = lista => Array.from({ length: 12 }, (_, m) => { const z = {}; for (const s of lista) for (const [k, v] of Object.entries(s.M[m])) if (typeof v === 'number') z[k] = (z[k] || 0) + v; return z; });
    const mensual = sumar12(sedes);
    // caja: recaudo del ingreso causado (mismo mes, mes siguiente y a dos meses) menos egresos del mes
    const prev = [sedes.reduce((a, s) => a + s.ingPrev[0], 0), sedes.reduce((a, s) => a + s.ingPrev[1], 0)];
    const ingSerie = [...prev, ...mensual.map(x => x.ing)];
    let caja = p.caja || 0, cajaMin = Infinity, mesMin = 0;
    mensual.forEach((x, m) => {
      const u = m + 2; x.rec = sp.p0 * ingSerie[u] + sp.p1 * ingSerie[u - 1] + sp.p2 * ingSerie[u - 2];
      x.egr = x.cv + x.bon + x.fij + x.pau + x.corp + x.fin; x.flujo = x.rec - x.egr; caja += x.flujo; x.caja = caja;
      if (caja < cajaMin) { cajaMin = caja; mesMin = m; }
    });
    const anual = resumirSim(mensual);
    anual.cajaFin = caja; anual.cajaMin = cajaMin; anual.mesCajaMin = mesMin;
    sedes.forEach(s => { s.A = resumirSim(s.M); });
    anual.sedesPerdida = sedes.filter(s => s.A.uai < 0).length;
    return { mensual, anual, sedes };
  }
  function resumirSim(M) {
    const A = {}; for (const x of M) for (const [k, v] of Object.entries(x)) if (typeof v === 'number' && !['caja'].includes(k)) A[k] = (A[k] || 0) + v;
    A.act = (A.act || 0) / M.length; A.ga = (A.ga || 0) / M.length;
    A.mcP = A.ing ? A.mc / A.ing : 0; A.uaiP = A.ing ? A.uai / A.ing : 0; A.pauP = A.ing ? A.pau / A.ing : 0;
    A.gastos = A.fij + A.pau + A.corp + A.fin;
    A.pe = A.mcP > 0 ? A.gastos / M.length / A.mcP : null;            // punto de equilibrio mensual en ventas
    A.ms = A.pe != null && A.ing ? (A.ing / M.length - A.pe) / (A.ing / M.length) : null;
    return A;
  }
  /** Valor de una variable que lleva la utilidad (o el margen) a la meta, por bisección. aplicar(p, x) modifica una copia. */
  function simResolver(B, p, aplicar, meta, lo, hi, porMargen) {
    const val = x => { const q = JSON.parse(JSON.stringify(p)); aplicar(q, x); const A = simular(B, q).anual; return porMargen ? A.uaiP : A.uai; };
    let a = lo, b = hi, fa = val(a) - meta, fb = val(b) - meta;
    if (fa > 0) return { x: lo, alcanzable: true, ya: true };
    if (fb < 0) return { x: hi, alcanzable: false };
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2, fm = val(m) - meta; if (fm >= 0) { b = m; fb = fm; } else { a = m; fa = fm; } }
    return { x: b, alcanzable: true };
  }

  // ------------------------------------------------------------------ 5. cifrado
  const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || null;
  function b64e(buf) {
    const b = new Uint8Array(buf);
    if (typeof Buffer !== 'undefined') return Buffer.from(b).toString('base64');
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
    return btoa(s);
  }
  function b64d(s) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    const bin = atob(s); const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }
  async function streamBytes(bytes, stream) {
    const s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const ITER = 600000;
  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  /**
   * Una sola derivación PBKDF2 de 64 bytes: los primeros 32 son la llave AES (idénticos a derivar 32 bytes,
   * así que los datasets anteriores siguen abriendo) y los últimos 32 son el permiso de escritura en la base.
   * El servidor solo guarda el SHA-256 del permiso; nunca ve la clave ni los datos en claro.
   */
  async function deriveKeys(pin, salt, iter) {
    const base = await subtle().importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter || ITER }, base, 512));
    const key = await subtle().importKey('raw', bits.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const auth = hex(bits.slice(32));
    return { key, auth, authHash: await sha256hex(auth) };
  }
  async function sha256hex(txt) { return hex(await subtle().digest('SHA-256', new TextEncoder().encode(txt))); }
  async function deriveKey(pin, salt, iter) { return (await deriveKeys(pin, salt, iter)).key; }
  function randomBytes(n) { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return b; }
  async function encryptDataset(ds, key, salt, authHash) {
    let bytes = new TextEncoder().encode(JSON.stringify(ds));
    let gz = false;
    if (typeof CompressionStream !== 'undefined') { bytes = await streamBytes(bytes, new CompressionStream('gzip')); gz = true; }
    const iv = randomBytes(12);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, bytes);
    const env = { app: 'eleganza-academia-dashboard', v: 1, updatedAt: new Date().toISOString(), kdf: { name: 'PBKDF2', hash: 'SHA-256', iter: ITER, salt: b64e(salt) }, iv: b64e(iv), gz, ct: b64e(ct) };
    if (authHash) env.auth = authHash;
    return env;
  }
  /** Abre un sobre con una llave ya derivada (misma clave y misma sal). */
  async function decryptWithKey(env, key) {
    let bytes;
    try { bytes = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: b64d(env.iv) }, key, b64d(env.ct))); }
    catch (e) { const err = new Error('Clave incorrecta'); err.code = 'bad_pin'; throw err; }
    if (env.gz) bytes = await streamBytes(bytes, new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function decryptDataset(env, pin) {
    const salt = b64d(env.kdf.salt);
    const { key, auth, authHash } = await deriveKeys(pin, salt, env.kdf.iter);
    return { ds: await decryptWithKey(env, key), key, salt, auth, authHash };
  }
  async function newKey(pin) { const salt = randomBytes(16); const k = await deriveKeys(pin, salt); return { key: k.key, salt, auth: k.auth, authHash: k.authHash }; }

  // ------------------------------------------------------------------ dataset
  function datasetVacio(planData, params) {
    return { empresa: 'Eleganza Academia · CEINDER S.A.S.', version: 2, sedes: NOMBRES_SEDES, plan: planData || null, params: params || null, reales: {}, cargas: [] };
  }
  /** Incorpora un informe parseado (reemplaza el mismo mes). */
  function incorporar(ds, parsed, periodo, archivo) {
    const k = periodo || parsed.periodo;
    if (!k) throw new Error('No se pudo determinar el mes del informe');
    const reemplaza = !!ds.reales[k];
    ds.reales[k] = { archivo: archivo || '', hoja: parsed.hoja, cargado: new Date().toISOString(), sedes: parsed.sedes, cuentas: parsed.cuentas };
    ds.cargas = ds.cargas || [];
    ds.cargas.unshift({ fecha: new Date().toISOString(), periodo: k, archivo: archivo || '', ingresos: parsed.control.ingresosSedes, reemplaza });
    ds.cargas = ds.cargas.slice(0, 100);
    return k;
  }

  return {
    MESES, MESES_CORTO, SEDES, NOMBRES_SEDES, LINEAS, CLAVES, ESCENARIOS,
    num, norm, pad2, keyOf, keyParts, keyLabel, addMonths, round,
    clasificaCuenta, clasificaEspecial, periodoDeTexto, encontrarHoja, parseInforme,
    completar, sumar, real, plan, acumular, mesesReales, mesesPlan, porSede,
    deriveKey, deriveKeys, sha256hex, newKey, encryptDataset, decryptDataset, decryptWithKey, b64e, b64d,
    datasetVacio, incorporar,
    CURSOS, LINEAS_FIJAS, vigenteSede, recalcular, capacidad, cursosDetalle, presupuestoMes, evaluarInversion, mesesDesde,
    SIM_LINEAS_FIJAS, SIM_PLANTILLAS, simDesdeExcel, simPlantilla, simular, simResolver, resumirSim, simCostosCurso
  };
});
