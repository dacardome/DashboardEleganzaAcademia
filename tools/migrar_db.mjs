// Agrega a la base de producción los parámetros nuevos que falten (sin tocar lo que ya existe).
// Uso: CLAVE='...' node tools/migrar_db.mjs https://<dominio> data-raw/params_init.json
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../src/core.js');
const [url, archivo] = process.argv.slice(2);
const ini = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const g = await (await fetch(url + '/api/datos', { cache: 'no-store' })).json();
const r = await C.decryptDataset(g.envelope, process.env.CLAVE);
const P = r.ds.params; const agregados = [];
for (const k of ['cursosInfo', 'inscritosMes', 'inscripcionesTotal']) if (!P[k]) { P[k] = ini[k]; agregados.push(k); }
if (!agregados.length) { console.log('Nada que migrar, versión', g.version); process.exit(0); }
const env = await C.encryptDataset(r.ds, r.key, r.salt, r.authHash);
const res = await fetch(url + '/api/datos', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + r.auth }, body: JSON.stringify({ envelope: env, baseVersion: g.version }) });
console.log('Migrado', agregados.join(', '), '->', res.status, await res.text());
