// Genera dist/index.html (una sola pagina, sin dependencias locales) a partir de src/.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const core = rd('core.js'), ui = rd('ui.js'), css = rd('styles.css');
for (const [n, s] of [['core.js', core], ['ui.js', ui]]) {
  if (/<\/script/i.test(s)) throw new Error(n + ' contiene "</script" literal');
}
let html = rd('index.template.html')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__CORE__*/', () => core)
  .replace('/*__UI__*/', () => ui);

// Opcional: incrustar el dataset cifrado en la pagina (para un unico archivo autocontenido).
if (process.argv.includes('--inline-data')) {
  const env = fs.readFileSync(path.join(ROOT, 'data/dataset.json'), 'utf8');
  html = html.replace('<!--__DATA__-->', () => '<script id="ea-data" type="application/json">' + env.replace(/</g, '\\u003c') + '</script>');
} else {
  html = html.replace('<!--__DATA__-->', '');
}
fs.mkdirSync(path.join(ROOT, 'dist/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/index.html'), html);
// datos cifrados versionados en data/dataset.json -> dist/data/dataset.json
const fuenteDatos = path.join(ROOT, 'data/dataset.json');
if (fs.existsSync(fuenteDatos)) fs.copyFileSync(fuenteDatos, path.join(ROOT, 'dist/data/dataset.json'));
console.log('dist/index.html', Math.round(html.length / 1024) + ' KB');
