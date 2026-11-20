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

  const ESCENARIOS = { base: 'Plan base', ajustado: 'Plan ajustado', sinkit: 'Sin kit y sin aumento' };
  /** Plan de un mes (clave AAAA-MM del año del plan) para una sede o 'Todas'. */
  function plan(ds, esc, k, sede) {
    const PL = ds.plan; if (!PL) return null;
    const { y, m } = keyParts(k); if (y !== PL.anio) return null;
    const i = m - 1;
    const uno = s => {
      const d = PL.plan[esc][s]; const fx = PL.fijos[s];
      const fijBreak = ['personal', 'arriendo', 'servicios', 'mantenimiento', 'otros', 'iva'].reduce((a, kk) => a + fx[kk], 0);
      const ajuste = d.fij[i] - fijBreak; // diferencia de redondeo
      return {
        ing: d.ing[i], cvPlan: d.cv[i], bonPlan: d.bon[i], personal: fx.personal, arriendo: fx.arriendo, servicios: fx.servicios,
        mantenimiento: fx.mantenimiento, otros: fx.otros + ajuste, iva: fx.iva, pau: d.pau[i], corp: d.corp[i], fin: d.fin[i],
        nue: d.nue[i], act: d.act[i], ga: d.ga[i]
      };
    };
    const base = sede === 'Todas' ? sumar(PL.sedes.map(uno)) : uno(sede);
    return completar(base);
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
  async function deriveKey(pin, salt, iter) {
    const base = await subtle().importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter || ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function randomBytes(n) { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return b; }
  async function encryptDataset(ds, key, salt) {
    let bytes = new TextEncoder().encode(JSON.stringify(ds));
    let gz = false;
    if (typeof CompressionStream !== 'undefined') { bytes = await streamBytes(bytes, new CompressionStream('gzip')); gz = true; }
    const iv = randomBytes(12);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { app: 'eleganza-academia-dashboard', v: 1, updatedAt: new Date().toISOString(), kdf: { name: 'PBKDF2', hash: 'SHA-256', iter: ITER, salt: b64e(salt) }, iv: b64e(iv), gz, ct: b64e(ct) };
  }
  async function decryptDataset(env, pin) {
    const salt = b64d(env.kdf.salt);
    const key = await deriveKey(pin, salt, env.kdf.iter);
    let bytes;
    try { bytes = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: b64d(env.iv) }, key, b64d(env.ct))); }
    catch (e) { const err = new Error('Clave incorrecta'); err.code = 'bad_pin'; throw err; }
    if (env.gz) bytes = await streamBytes(bytes, new DecompressionStream('gzip'));
    return { ds: JSON.parse(new TextDecoder().decode(bytes)), key, salt };
  }
  async function newKey(pin) { const salt = randomBytes(16); const key = await deriveKey(pin, salt); return { key, salt }; }

  // ------------------------------------------------------------------ dataset
  function datasetVacio(planData) {
    return { empresa: 'Eleganza Academia · CEINDER S.A.S.', version: 1, sedes: NOMBRES_SEDES, plan: planData || null, reales: {}, cargas: [] };
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
    deriveKey, newKey, encryptDataset, decryptDataset, b64e, b64d,
    datasetVacio, incorporar
  };
});
