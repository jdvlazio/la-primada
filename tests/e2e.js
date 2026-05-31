/* ============================================================
   E2E — Flujo MVC del tab Primadas con clics REALES (jsdom)
   Carga index.html + js/*.js en orden, simula eventos de usuario y
   re-consulta el DOM tras cada render. Verifica el flujo completo:
   evento → acción → commit → render, y los invariantes vía UI.
   Correr:  node tests/e2e.js   (lo invoca `npm test` tras run.js)
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/* ---------- mini-harness ---------- */
let pass = 0, fail = 0; const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, got, want) { check(name, got === want, `esperado ${JSON.stringify(want)}, obtuve ${JSON.stringify(got)}`); }
function section(t) { console.log('\n' + t); }

/* ---------- montar el documento ---------- */
// Quitamos los <script src> reales: inyectamos los módulos a mano (en orden) para
// controlar la ejecución y evitar el loader de recursos / fuentes CDN.
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script src="js\/[^"]+"><\/script>\s*/g, '');

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;

// Esperar a que el documento termine de cargar: así, al inyectar los módulos,
// `document.readyState === 'complete'` y el bootstrap del controlador corre
// `start()` UNA sola vez (no por un DOMContentLoaded que ya pasó).
function ready() {
  return document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise(res => window.addEventListener('load', res));
}

ready().then(() => {
  window.localStorage.clear();   // arrancar de cero (defaultState)
  ['js/config.js', 'js/util.js', 'js/store.js', 'js/view.js', 'js/controller.js'].forEach(rel => {
    const s = document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    document.body.appendChild(s);   // ejecuta sincrónicamente (runScripts:'dangerously')
  });
  runTests();
});

function runTests() {

/* ---------- helpers de interacción ---------- */
const Store = window.Store;
const st = () => Store.select.state();
const q  = sel => document.querySelector(sel);
const qa = sel => Array.from(document.querySelectorAll(sel));
function click(elOrSel) {
  const el = typeof elOrSel === 'string' ? q(elOrSel) : elOrSel;
  if (!el) throw new Error('click: no existe ' + elOrSel);
  el.dispatchEvent(new window.Event('click', { bubbles: true }));
}
function setVal(elOrSel, value) {
  const el = typeof elOrSel === 'string' ? q(elOrSel) : elOrSel;
  if (!el) throw new Error('setVal: no existe ' + elOrSel);
  el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

/* ============================================================ */
section('Arranque (bootstrap cableó la Vista sobre el modelo v4)');
check('Store, View y Controller existen en window', !!window.Store && !!window.View && !!window.Controller);
check('Render inicial: tab Primadas con estado vacío', /No hay primada activa/.test(q('#screen').innerHTML));
eq('localStorage limpio → 0 personas', st().personas.length, 0);

/* ---------- 1. Directorio de personas (overlay del engranaje) ---------- */
section('Personas: alta desde el overlay del engranaje');
click('#gearBtn');                                   // abre overlay Personas
check('Overlay Personas visible', !q('#overlay').hidden && /Agregar persona/.test(q('#overlay').innerHTML));
setVal('#np-nombre', 'Ana'); setVal('#np-estado', 'ahorrador'); click('[data-act="add-persona"]');
setVal('#np-nombre', 'Beto'); setVal('#np-estado', 'invitado'); click('[data-act="add-persona"]');
eq('2 personas en el directorio', st().personas.length, 2);
const ana  = st().personas.find(p => p.nombre === 'Ana');
const beto = st().personas.find(p => p.nombre === 'Beto');
check('Ana es ahorradora, Beto invitado', ana.estado === 'ahorrador' && beto.estado === 'invitado');
click('[data-act="close-overlay"]');
check('Overlay cerrado', q('#overlay').hidden);

/* ---------- 2. Crear primada (queda incompleta) ---------- */
section('Crear y seleccionar primada');
click('[data-act="new-primada"]');
eq('1 primada creada', st().primadas.length, 1);
const prm = () => st().primadas[0];
check('Primada activa = la nueva', st().activePrimadaId === prm().id);
check('Incompleta: sin principal en la UI', /sin principal/.test(q('#screen').innerHTML));

/* ---------- 3. Agregar asistencias desde el directorio ---------- */
section('Asistencias desde el directorio');
setVal('#as-pick', ana.id);  click('[data-act="add-asistencia"]');
setVal('#as-pick', beto.id); click('[data-act="add-asistencia"]');
eq('2 asistencias', prm().asistencias.length, 2);
check('Snapshot inmutable: Ana=ahorrador, Beto=invitado en la asistencia',
  prm().asistencias.find(a => a.personaId === ana.id).estadoEnEseMomento === 'ahorrador' &&
  prm().asistencias.find(a => a.personaId === beto.id).estadoEnEseMomento === 'invitado');

/* ---------- 4. Asignar principal (INVARIANTE #2) ---------- */
section('Asignar principal — invariante "principal siempre ahorrador"');
setVal(`select[data-ch="rol"][data-pid="${ana.id}"]`, 'principal');
eq('Ana es el principal', prm().organizadorPrincipalId, ana.id);
check('Ya no está incompleta', !Store.select.primadaIncompleta(prm()));
check('Snapshot de la llave Bre-B del principal en pago', 'breB' in prm().pago);

// Intentar hacer principal a Beto (invitado) → debe rechazarse por invariante
setVal(`select[data-ch="rol"][data-pid="${beto.id}"]`, 'principal');
eq('Beto NO pudo ser principal (sigue Ana)', prm().organizadorPrincipalId, ana.id);
check('Render se recuperó tras el error (sigue habiendo asistencias)', qa('.asis').length === 2);

/* ---------- 5. Consumos ± ---------- */
section('Consumos con los steppers ±');
click(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
click(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
eq('Beto lleva 2 cervezas', prm().asistencias.find(a => a.personaId === beto.id).items.cerveza, 2);
click(`[data-act="item-minus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
eq('Stepper baja a 1', prm().asistencias.find(a => a.personaId === beto.id).items.cerveza, 1);
click(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);   // de vuelta a 2

/* ---------- 6. Cover automático + exoneración ---------- */
section('Cover automático por tipo + exoneración manual');
const betoAsis = () => prm().asistencias.find(a => a.personaId === beto.id);
eq('Cover de Beto (invitado) = 10.000 por defecto', Store.select.coverDe(prm(), betoAsis()), 10000);
const anaAsis = () => prm().asistencias.find(a => a.personaId === ana.id);
eq('Ana (principal) sin cover', Store.select.coverDe(prm(), anaAsis()), 0);

// Ganancia ANTES de exonerar: cover 10000 + margen 2*(3500-2500)=2000 → 12000
eq('Ganancia = cover + margen (12.000)', Store.select.ganancia(prm()), 12000);
check('Reparto visible en la UI', /Ganancia de la primada/.test(q('#screen').innerHTML));

click(`[data-act="toggle-exonerado"][data-pid="${beto.id}"]`);
check('Beto exonerado', betoAsis().coverExonerado === true);
eq('Cover de Beto ahora 0', Store.select.coverDe(prm(), betoAsis()), 0);
eq('Ganancia baja al margen puro (2.000)', Store.select.ganancia(prm()), 2000);

/* ---------- 7. Resumen e informe del principal ---------- */
section('Resumen de ganancia + informe del principal');
const inf = Store.select.informePrincipal(prm());
check('Informe completo (ya hay principal)', inf.incompleta === false);
eq('Entrega al Tesorero = ganancia', inf.entregaTesorero, Store.select.ganancia(prm()));
eq('Parte igual a la única ahorradora (Ana) = ganancia', Store.select.parteIgual(prm()), 2000);
eq('Sobrante indivisible = 0', Store.select.sobranteFondo(prm()), 0);
check('Informe del principal renderizado con el nombre', /Informe del principal — Ana/.test(q('#screen').innerHTML));

/* ---------- 8. Cerrar congela consumos pero la UI sigue viva ---------- */
section('Cerrar cuenta (INVARIANTE #4) vía UI');
click(`[data-act="cerrar-primada"][data-id="${prm().id}"]`);
eq('Primada cerrada', prm().estado, 'cerrada');
const before = betoAsis().items.cerveza;
const plus = q(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
check('Steppers deshabilitados al cerrar', !!plus && plus.disabled === true);
if (plus) click(plus);   // aunque hagamos click, la acción debe ignorarlo
eq('Consumo congelado tras cerrar', betoAsis().items.cerveza, before);

/* ---------- 9. Navegación de tabs ---------- */
section('Navegación: tabs Resumen/Fondo (Próximamente)');
click('[data-tab="fondo"]');
check('Tab Fondo muestra Próximamente', /Próximamente/.test(q('#screen').innerHTML));
click('[data-tab="primadas"]');
check('Vuelve a Primadas', /Asistencias/.test(q('#screen').innerHTML));

/* ---------- 10. Persistencia (lo escrito quedó en localStorage v4) ---------- */
section('Persistencia');
const saved = JSON.parse(window.localStorage.getItem('laPrimada'));
check('localStorage tiene schemaVersion 4', saved && saved.schemaVersion === 4);
check('Persistió la primada con sus 2 asistencias', saved.primadas[0].asistencias.length === 2);

/* ---------- Resumen ---------- */
console.log(`\n${'='.repeat(50)}`);
console.log(`E2E: ${pass} pasaron, ${fail} fallaron`);
if (fail) { console.log('Fallaron:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('E2E verde ✓');

}   // fin runTests
