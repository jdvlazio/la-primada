#!/usr/bin/env node
/* ============================================================
   stamp-sw.js — estampa el CACHE_VERSION del Service Worker.
   Lo invoca el git hook pre-commit: reemplaza el valor de
   CACHE_VERSION en sw.js por un sello fecha+hash-corto, y re-stagea
   sw.js para que el commit incluya la versión nueva.
   Así cada commit/push invalida el caché viejo automáticamente.
   ------------------------------------------------------------
   Sello: YYYYMMDD-HHMMSS-<short> (corto = hash del árbol actual o 'wip').
   Idempotente: vuelve a sellar desde cualquier valor previo.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');
const HTML = path.join(ROOT, 'index.html');
const VERSION_JSON = path.join(ROOT, 'version.json');

function shortRef() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); }
  catch (e) { return 'wip'; }
}
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${ts}-${shortRef()}`;
}

let src = fs.readFileSync(SW, 'utf8');
const version = stamp();
// Reemplaza el placeholder o cualquier valor previo de CACHE_VERSION.
const re = /const CACHE_VERSION = '[^']*';/;
if (!re.test(src)) { console.error('stamp-sw: no encontré CACHE_VERSION en sw.js'); process.exit(1); }
src = src.replace(re, `const CACHE_VERSION = '${version}';`);
fs.writeFileSync(SW, src);
console.log('stamp-sw: CACHE_VERSION =', version);

// index.html: estampa el mismo sello en el ?v= de cada <script src="js/...">.
// El HTML viene con ?v=__BUILD__ (placeholder); cada deploy lo sincroniza con
// CACHE_VERSION → iOS WKWebView no sirve un .js viejo desde su HTTP cache.
let html = fs.readFileSync(HTML, 'utf8');
const reV = /(<script src="js\/[^"?]+)(?:\?v=[^"]*)?(")/g;
const before = html;
html = html.replace(reV, `$1?v=${version}$2`);
// <meta name="build" content="..."> = build incrustado en el HTML. La app compara version.json
// contra ESTO (verdad de tierra), no contra localStorage → no se atasca si un reload sirve viejo.
html = html.replace(/(<meta name="build" content=")[^"]*(">)/, `$1${version}$2`);
if (html !== before) {
  fs.writeFileSync(HTML, html);
  console.log('stamp-sw: ?v= y meta build en index.html =', version);
} else {
  console.error('stamp-sw: no encontré <script src="js/..."> ni meta build en index.html');
}

// version.json: misma marca de build. La app lo consulta no-store al abrir y al volver de
// background (modelo de Otrofestiv); si el build difiere del guardado → reload duro. Es la
// garantía REAL de propagación en iOS, independiente del Service Worker.
try {
  fs.writeFileSync(VERSION_JSON, '{ "build": "' + version + '" }\n');
  console.log('stamp-sw: version.json build =', version);
} catch (e) { console.error('stamp-sw: no pude escribir version.json'); }

// Re-stagear los tres archivos si estamos dentro de un commit (hook).
try { execSync('git add sw.js index.html version.json', { cwd: ROOT }); } catch (e) {}
