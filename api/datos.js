// Base de datos del tablero (Vercel Function + Upstash Redis por REST, sin dependencias).
//
// GET  /api/datos  -> { version, updatedAt, envelope }   404 si la base está vacía, 503 si no está configurada
// PUT  /api/datos  -> guarda el dataset cifrado.
//      Encabezado: Authorization: Bearer <permiso de escritura derivado de la clave en el navegador>
//      Cuerpo:     { envelope, baseVersion }  (envelope.auth = SHA-256 del permiso; cambia cuando cambia la clave)
//
// El servidor nunca recibe la clave ni los datos en claro: guarda el sobre cifrado (AES-GCM) y el SHA-256
// del permiso de escritura. La primera escritura se valida contra el sobre publicado en data/dataset.json.
'use strict';
const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const P = 'eza:'; // prefijo de llaves
const K = { datos: P + 'dataset', version: P + 'version', auth: P + 'auth', historial: P + 'historial' };
const MAX_BYTES = 3 * 1024 * 1024;

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Redis: ' + (j.error || r.status));
  return j.result;
}

const sha256 = txt => crypto.createHash('sha256').update(String(txt)).digest('hex');
function igual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function valido(env) {
  return env && typeof env === 'object' && env.app === 'eleganza-academia-dashboard' && env.kdf && typeof env.kdf.salt === 'string' &&
    typeof env.iv === 'string' && typeof env.ct === 'string' && /^[0-9a-f]{64}$/.test(env.auth || '');
}

// Permiso vigente: el guardado en la base o, si la base está vacía, el del sobre publicado en el repositorio.
async function authVigente(req) {
  const guardado = await redis(['GET', K.auth]);
  if (guardado) return guardado;
  try { // archivo incluido en la función (vercel.json › functions › includeFiles)
    const env = JSON.parse(require('fs').readFileSync(require('path').join(process.cwd(), 'data', 'dataset.json'), 'utf8'));
    if (env && env.auth) return env.auth;
  } catch (e) { /* sigue con la copia publicada */ }
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const r = await fetch(proto + '://' + req.headers.host + '/data/dataset.json', { cache: 'no-store' });
  if (!r.ok) return null;
  const env = await r.json().catch(() => null);
  return env && env.auth ? env.auth : null;
}

// Escritura atómica: solo guarda si la versión no cambió desde que el navegador la leyó.
const CAS = `
local v = tonumber(redis.call('GET', KEYS[2]) or '0')
if v ~= tonumber(ARGV[1]) then return {0, v} end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(v + 1))
redis.call('SET', KEYS[3], ARGV[3])
redis.call('LPUSH', KEYS[4], ARGV[2])
redis.call('LTRIM', KEYS[4], 0, 9)
return {1, v + 1}`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'sin_base', mensaje: 'La base de datos no está conectada al proyecto en Vercel.' });
  try {
    if (req.method === 'GET') {
      const [txt, version] = await Promise.all([redis(['GET', K.datos]), redis(['GET', K.version])]);
      if (!txt) return res.status(404).json({ vacio: true, version: 0 });
      const d = JSON.parse(txt);
      return res.status(200).json({ version: Number(version || 0), updatedAt: d.updatedAt, envelope: d.envelope });
    }
    if (req.method === 'PUT') {
      const permiso = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!/^[0-9a-f]{64}$/.test(permiso)) return res.status(401).json({ error: 'sin_permiso' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { envelope, baseVersion } = body;
      if (!valido(envelope)) return res.status(400).json({ error: 'sobre_invalido' });
      const auth = await authVigente(req);
      if (!auth || !igual(sha256(permiso), auth)) return res.status(401).json({ error: 'sin_permiso' });
      const updatedAt = new Date().toISOString();
      const txt = JSON.stringify({ updatedAt, envelope });
      if (txt.length > MAX_BYTES) return res.status(413).json({ error: 'muy_grande' });
      const [ok, version] = await redis(['EVAL', CAS, '4', K.datos, K.version, K.auth, K.historial, String(Number(baseVersion) || 0), txt, envelope.auth]);
      if (!ok) return res.status(409).json({ error: 'conflicto', version });
      return res.status(200).json({ version, updatedAt });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'metodo' });
  } catch (e) {
    return res.status(500).json({ error: 'servidor', mensaje: e.message });
  }
};
