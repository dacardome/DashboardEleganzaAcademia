// Arma el dataset inicial cifrado desde data-raw/ (no versionado):
//   data-raw/plan2027.json   (exportado del Excel del plan con tools/export_plan.py)
//   data-raw/*.xlsx          (informes a socios mensuales; el mes sale del nombre del archivo o de la hoja)
// Uso: CLAVE='frase-larga' npm run seed
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const C = require('../src/core.js');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'data-raw');
const clave = process.env.CLAVE;
if (!clave || clave.length < 10) { console.error('Defina CLAVE (mínimo 10 caracteres).'); process.exit(1); }

export function leerLibro(file) {
  const wb = XLSX.readFile(file, { cellDates: true });
  const rows = {};
  for (const n of wb.SheetNames) rows[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
  return rows;
}

const planData = JSON.parse(fs.readFileSync(path.join(RAW, 'plan2027.json'), 'utf8'));
const ds = C.datasetVacio(planData);
for (const f of fs.readdirSync(RAW).filter(f => /\.xlsx?$/i.test(f)).sort()) {
  const parsed = C.parseInforme(leerLibro(path.join(RAW, f)), process.env['MES_' + f] ? '' : f);
  const k = process.env['MES_' + f] || parsed.periodo || process.env.MES;
  C.incorporar(ds, parsed, k, f);
  console.log(f, '->', k, 'hoja', parsed.hoja, 'sedes', parsed.sedesDetectadas, 'ingresos', parsed.control.ingresosSedes, 'cuadra', parsed.control.cuadra);
}
const { key, salt } = await C.newKey(clave);
const env = await C.encryptDataset(ds, key, salt);
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/dataset.json'), JSON.stringify(env));
console.log('data/dataset.json', Math.round(JSON.stringify(env).length / 1024) + ' KB', 'meses reales:', Object.keys(ds.reales));
