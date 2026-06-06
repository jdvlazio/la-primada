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

ready().then(async () => {
  window.localStorage.clear();   // arrancar de cero (defaultState)
  // jsdom no implementa window.confirm; las acciones destructivas (cerrar/borrar) lo usan.
  // Stub que confirma siempre (simula que el usuario acepta el diálogo).
  window.confirm = () => true;
  // Orden real de carga (incluye el adaptador): config → util → api → store → view → controller.
  ['js/config.js', 'js/util.js', 'js/api.js', 'js/auth.js', 'js/store.js', 'js/view.js', 'js/controller.js'].forEach(rel => {
    const s = document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    document.body.appendChild(s);   // ejecuta sincrónicamente (runScripts:'dangerously')
  });
  // El bootstrap (controller start) es ASYNC: hidrata vía Api.load() (modo 'local' en jsdom, sin SDK).
  // Esperamos a que el estado quede listo antes de manejar la app con clics.
  for (let i = 0; i < 50 && !(window.Store && window.Store.select.state()); i++) {
    await new Promise(r => setTimeout(r, 10));
  }
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
// MODELO 3 — Lista viva: la fila del asistente está SIEMPRE visible; tap = activar (reveal inline con
// chips + pago). activar(pid) es idempotente: activa solo si no está ya activa (sin .asis-reveal en su .asis).
function activar(pid) {
  const fila = q(`.asis-fila[data-pid="${pid}"]`);
  if (!fila) throw new Error('activar: no existe la fila de ' + pid);
  if (!fila.closest('.asis').querySelector('.asis-reveal')) click(fila);
}
// ÚNICA config: el gear global tiene 4 tabs (Primada · Calendario · Personas · Ajustes). La config del
// evento activo vive en el tab "Primada". abrirConfig() abre el gear y deja ese tab listo (Asistentes default).
function abrirConfig() {
  if (!q('#overlay') || q('#overlay').hidden) click('#gearBtn');            // abre el gear (→ Primada si hay activa)
  const ptab = q('[data-act="overlay-tab"][data-overlay="primada"]');
  if (ptab) click(ptab);                                                     // asegura el tab Primada (config)
}

/* ============================================================ */
section('Arranque (bootstrap cableó la Vista sobre el modelo v4)');
check('Store, View y Controller existen en window', !!window.Store && !!window.View && !!window.Controller);
check('Render inicial: tab Primadas con estado vacío ("Tu primera primada")', /Tu primera primada/.test(q('#screen').innerHTML));
// Estado vacío ESTRICTO: sin selector, sin "+" en la cabecera, y SIN botón inline de crear — orienta al gear.
check('Estado vacío: NO hay selector de primada (.selrow)', !q('#screen .selrow'));
check('Estado vacío: NO hay "+" chico (.icon-btn.nueva)', !q('#screen .icon-btn.nueva'));
check('Estado vacío: SIN botón inline de crear; orienta al gear (⚙ → Calendario → Nueva primada)',
  !q('#screen [data-act="new-primada"]') && /Nueva primada/.test(q('#screen').innerHTML));
// ÚNICO punto de creación: gear global › Calendario › "Nueva primada" → abre el wizard. Cancelar cierra todo.
click('#gearBtn');
click('[data-act="overlay-tab"][data-overlay="calendario"]');
check('Gear › Calendario: "Nueva primada" es el único punto de creación', !!q('[data-act="new-primada"]'));
click('[data-act="new-primada"]');
check('El wizard se abre desde el gear', !!q('.wz'));
click('[data-act="wz-cancelar"]');
check('Cancelar el wizard cierra todo y vuelve a la invitación', q('#overlay').hidden && /Tu primera primada/.test(q('#screen').innerHTML));
eq('localStorage limpio → 0 personas', st().personas.length, 0);

/* ---------- 1. Directorio de personas (overlay del engranaje) ---------- */
section('Personas: alta desde el overlay del engranaje');
click('#gearBtn'); click('[data-act="overlay-tab"][data-overlay="personas"]');   // gear → tab Personas
check('Pantalla Personas visible', !q('#overlay').hidden && /Agregar persona/.test(q('#overlay').innerHTML));
click('[data-act="open-nueva-persona"]');            // despliega el form al pie (sin cajas siempre abiertas)
setVal('#np-nombre', 'Ana'); setVal('#np-estado', 'ahorrador'); click('[data-act="add-persona"]');
setVal('#np-nombre', 'Beto'); setVal('#np-estado', 'invitado'); click('[data-act="add-persona"]');
eq('2 personas en el directorio', st().personas.length, 2);
const ana  = st().personas.find(p => p.nombre === 'Ana');
const beto = st().personas.find(p => p.nombre === 'Beto');
check('Ana es ahorradora, Beto invitado', ana.estado === 'ahorrador' && beto.estado === 'invitado');
click('[data-act="close-overlay"]');
check('Overlay cerrado', q('#overlay').hidden);

/* ---------- 2. Crear primada (queda incompleta) ----------
   El botón "+ Nueva primada" ahora abre el WIZARD (se prueba por clics en la sección 12).
   Aquí creamos una incompleta vía acción para cubrir el flujo de asignar principal por rol. */
section('Crear y seleccionar primada');
Store.actions.createPrimada({});
eq('1 primada creada', st().primadas.length, 1);
const prm = () => st().primadas[0];
check('Primada activa = la nueva', st().activePrimadaId === prm().id);
check('Incompleta: sin principal en la UI', /sin principal/.test(q('#screen').innerHTML));

/* ---------- 3. Agregar asistencias desde el directorio ---------- */
section('Asistencias desde el directorio');
click('[data-act="open-add-asis"]');   // abre la HOJA simple del directorio (overlay add-asis)
check('Hoja Agregar asistente abierta', !q('#overlay').hidden && /Agregar asistente/.test(q('#overlay').innerHTML));
click(`[data-act="add-asistencia"][data-pid="${ana.id}"]`);   // un toque agrega
click(`[data-act="add-asistencia"][data-pid="${beto.id}"]`);
click('[data-act="close-overlay"]');
eq('2 asistencias', prm().asistencias.length, 2);
check('Snapshot inmutable: Ana=ahorrador, Beto=invitado en la asistencia',
  prm().asistencias.find(a => a.personaId === ana.id).estadoEnEseMomento === 'ahorrador' &&
  prm().asistencias.find(a => a.personaId === beto.id).estadoEnEseMomento === 'invitado');

/* ---------- 4. Asignar principal (INVARIANTE #2) ---------- */
section('Asignar principal — fix mínimo en Configurar › Asistentes (primada incompleta)');
// El ROL se fija al crear; el ÚNICO caso editable es asignar el principal de una primada INCOMPLETA
// (lista compacta agrupada). La config vive en el gear › tab Primada (Asistentes por defecto).
abrirConfig();
check('Gear › Primada: config del evento (tab Asistentes, lista agrupada)',
  /data-act="config-tab" data-ctab="asistentes"/.test(q('#overlay').innerHTML) && /Ahorradores/.test(q('#overlay').innerHTML));
check('Tab Primada = SOLO config (sin Calendario ni segundo engranaje)',
  !/data-act="new-primada"/.test(q('#overlay').innerHTML) && !q('[data-act="open-config-primada"]'));
check('El Calendario es un tab SEPARADO (Nueva primada + lista)', (() => {
  click('[data-act="overlay-tab"][data-overlay="calendario"]');
  const ok = !!q('[data-act="new-primada"]') && /data-act="borrar-primada"/.test(q('#overlay').innerHTML);
  click('[data-act="overlay-tab"][data-overlay="primada"]'); return ok;   // volver al tab Primada
})());
check('Aviso "falta principal" visible (incompleta)', /falta principal/.test(q('#overlay').innerHTML));
// Beto es INVITADO → la UI NO le ofrece "Hacer principal" (INVARIANTE #2 por construcción).
check('Beto (invitado) SIN botón "Hacer principal"', !q(`[data-act="hacer-principal"][data-pid="${beto.id}"]`));
// Ana es ahorrador → sí se le ofrece. Click la hace principal.
click(`[data-act="hacer-principal"][data-pid="${ana.id}"]`);
eq('Ana es el principal', prm().organizadorPrincipalId, ana.id);
check('Ya no está incompleta', !Store.select.primadaIncompleta(prm()));
check('Snapshot de la llave Bre-B del principal en pago', 'breB' in prm().pago);
// Completa → ya no hay botones "Hacer principal" (rol fijo tras asignar).
check('Sin "Hacer principal" una vez completa', !q('[data-act="hacer-principal"]'));
click('[data-act="close-overlay"]');

/* ---------- 5. Consumos ± (Lista viva: chips inline) ---------- */
section('Consumos (Lista viva): tap persona → chips; tap chip disponible = +1; chip consumido +/−');
// v6: la cantidad se cuenta desde consumos[] (Σ filas), no desde el viejo items{}.
const cervezas = () => (prm().consumos || []).filter(c => c.personaId === beto.id && c.productoId === 'cerveza').reduce((n, c) => n + (c.cantidad || 1), 0);
activar(beto.id);   // tap persona → reveal con chips inline (idempotente)
check('Lista viva: al activar aparece el reveal con chips', !!q(`.asis-fila[data-pid="${beto.id}"].on`) && !!q('.chips-viva'));
// Modelo 3: el primer consumo entra por el chip DISPONIBLE (tap = +1 = INSERT fila); mismo data-act item-plus.
click(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);   // 0→1
eq('Beto lleva 1 cerveza (chip disponible → +1)', cervezas(), 1);
check('El chip pasó a CONSUMIDO (.chip.has con ×N)', !!q(`.chip.has [data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`));
// Stepper [− 🍺×N +]: − a la izquierda, + EXPLÍCITO a la derecha (gesto universal), + cuerpo tappable.
check('Chip consumido: + explícito a la derecha (.chip-add) y − a la izquierda (.chip-minus)',
  !!q('.chip.has .chip-add') && !!q('.chip.has .chip-minus'));
// El chip consumido: + explícito y cuerpo = +1, − = −1 (mismo data-act item-plus/item-minus).
click(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
eq('Beto lleva 2 cervezas (tap chip = +1)', cervezas(), 2);
click(`[data-act="item-minus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
eq('El − corrige a 1 (borró la fila más reciente)', cervezas(), 1);
click(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);   // de vuelta a 2

// Auditoría (C2): el detalle por evento NO se exhibe; el ⓘ lo abre bajo demanda.
check('Auditoría: ⓘ presente con consumos', !!q(`[data-act="toggle-auditoria"][data-pid="${beto.id}"]`));
check('Auditoría: panel NO se exhibe por defecto', !q('.aud-panel'));
click(`[data-act="toggle-auditoria"][data-pid="${beto.id}"]`);
check('Auditoría: al tocar ⓘ aparece el panel con 2 eventos', !!q('.aud-panel') && q('.aud-panel').querySelectorAll('.aud-row').length === 2);
click(`[data-act="toggle-auditoria"][data-pid="${beto.id}"]`);
check('Auditoría: se cierra al re-tocar', !q('.aud-panel'));

/* ---------- 6. Cover automático + exoneración ---------- */
section('Cover automático por tipo + exoneración manual');
const betoAsis = () => prm().asistencias.find(a => a.personaId === beto.id);
eq('Cover de Beto (invitado) = 10.000 por defecto', Store.select.coverDe(prm(), betoAsis()), 10000);
const anaAsis = () => prm().asistencias.find(a => a.personaId === ana.id);
eq('Ana (principal) sin cover', Store.select.coverDe(prm(), anaAsis()), 0);

// Ganancia ANTES de exonerar: cover 10000 + margen 2*(3500-2500)=2000 → 12000
eq('Ganancia = cover + margen (12.000)', Store.select.ganancia(prm()), 12000);
// El reparto YA NO vive en la cara Consumos (operar) → ahora en la CARA Balance (ver la plata).
check('Reparto NO está en la cara Consumos', !/Ganancia/.test(q('#screen').innerHTML));
click('[data-act="set-cara"][data-cara="balance"]');
check('Reparto visible en la cara Balance', /Ganancia/.test(q('#screen').innerHTML));
// HERO NUMBER: la cifra protagonista (.bal-amount) está SIEMPRE visible, sin abrir el acorde.
check('Balance: cifra héroe (.bal-amount) visible sin tocar el acorde', !!q('.bal-amount'));
check('Balance: el desglose (acc-body) está OCULTO por defecto', !q('.bal-card .acc-body') && !q('.acc-body'));
// STATE-AWARE: primada ABIERTA → nota provisional bajo el héroe.
check('Balance ABIERTA: nota "Provisional" bajo el héroe', /Provisional/.test(q('#screen').innerHTML));
// Abrir el acorde del reparto → aparece el desglose (Cover/Margen/Sobrante…).
click('[data-act="toggle-balance"][data-sec="reparto"]');
check('Toggle reparto: el desglose se muestra (Sobrante en el acc-body)', /Sobrante/.test(q('#screen').innerHTML));
click('[data-act="toggle-balance"][data-sec="reparto"]');   // colapsar de nuevo
check('Toggle reparto: el desglose se oculta otra vez', !/Sobrante/.test(q('#screen').innerHTML));
click('[data-act="set-cara"][data-cara="operacion"]');   // volver a operar

// Exoneración: la decisión vive al AGREGAR (acción add-asistencia-cortesia). Beto ya está agregado y
// CON consumos, así que aquí aplicamos la exoneración por la MISMA acción de modelo que usa la cortesía
// (toggleCoverExonerado) para verificar el EFECTO en el cálculo. La cara compacta la MUESTRA, no la edita.
Store.actions.toggleCoverExonerado(prm().id, beto.id);
check('Beto exonerado', betoAsis().coverExonerado === true);
eq('Cover de Beto ahora 0', Store.select.coverDe(prm(), betoAsis()), 0);
eq('Ganancia baja al margen puro (2.000)', Store.select.ganancia(prm()), 2000);
// La lista compacta de Configurar (gear › Primadas) MUESTRA la excepción "Sin cover" (no la edita).
abrirConfig();
check('Gear › Primadas › Asistentes marca "Sin cover" en el exonerado', /Sin cover/.test(q('#overlay').innerHTML));
click('[data-act="close-overlay"]');

/* ---------- 7. Balance: Ganancia y Recaudo ---------- */
section('Balance: Ganancia + Recaudo (proceso de cobro)');
const inf = Store.select.informePrincipal(prm());
check('Informe completo (ya hay principal)', inf.incompleta === false);
eq('Entrega al Tesorero = ganancia', inf.entregaTesorero, Store.select.ganancia(prm()));
eq('Parte igual a la única ahorradora (Ana) = ganancia', Store.select.parteIgual(prm()), 2000);
eq('Sobrante indivisible = 0', Store.select.sobranteFondo(prm()), 0);
// La 2ª tarjeta se llama RECAUDO (proceso de cobro), sin nombre ni rol.
click('[data-act="set-cara"][data-cara="balance"]');
check('2ª tarjeta titulada "Recaudo" (sin nombre/rol)', /Recaudo/.test(q('#screen').innerHTML) && !/Principal — Ana/.test(q('#screen').innerHTML));
// Beto debe (cover 0, pero 2 cervezas = 7.000 sin pagar) → ABIERTA: héroe en registro PENDIENTE ámbar
// (.por-cobrar). NO destructivo (salmón) ni "entregado" (teal): la deuda es proceso, no alarma (DESIGN.md §1).
check('Recaudo ABIERTA: el héroe usa el registro pendiente ámbar (.por-cobrar), no "entregado"',
  /class="bal-amount por-cobrar"/.test(q('#screen').innerHTML) && !/bal-amount entregado/.test(q('#screen').innerHTML));
// El TEASER no repite el héroe: el héroe ya es el "por cobrar" (saldoPendiente) → el teaser solo añade
// el OTRO número (lo que se entrega), sin "· Por cobrar $Y".
check('Recaudo ABIERTA: teaser solo "Entrega … al Tesorero" (no repite el número del héroe)',
  /Entrega .*al Tesorero/.test(q('#screen').innerHTML) && !/al Tesorero · Por cobrar/.test(q('#screen').innerHTML));
// MENOS ES MÁS: el héroe del Recaudo NO lleva microcopy (el conteo "de N personas" confundía). Quién debe
// vive un nivel abajo, en la lista del acordeón ("Debe").
check('Recaudo ABIERTA: el héroe NO muestra conteo "de N personas"', !/de \d+ persona/.test(q('#screen').innerHTML));
check('Recaudo ABIERTA: el texto "Por cobrar" ya NO aparece (0 veces, acorde colapsado)',
  (q('#screen').innerHTML.match(/Por cobrar/g) || []).length === 0);
// El detalle de quién debe sigue disponible al abrir el acordeón del Recaudo.
click('[data-act="toggle-balance"][data-sec="informe"]');
check('Recaudo: la lista de deudores vive DENTRO del acorde ("Debe" + el deudor)',
  /Debe/.test(q('#screen').innerHTML) && new RegExp(beto.nombre).test(q('#screen').innerHTML));
click('[data-act="toggle-balance"][data-sec="informe"]');   // colapsar de nuevo
check('Recaudo: "provisional" NO aparece en esta tarjeta (sí queda en Ganancia)',
  (q('#screen').innerHTML.match(/provisional/gi) || []).length === 1);   // solo la nota de Ganancia
click('[data-act="set-cara"][data-cara="operacion"]');

/* ---------- 7b. Informe compartible (template PNG) ---------- */
section('Compartir informe: trigger en la cabecera + template HTML (puro)');
// El botón "Compartir informe" aparece en la cabecera (hay datos: Beto consumió) y vive en ambas caras.
check('Trigger "Compartir informe" visible con datos', !!q('[data-act="compartir-informe"]'));
const informe = window.View.informeTemplateHTML(prm());
check('Informe: marca "Primadapp" + período', /informe-brand">Primadapp/.test(informe) && /Junio 2026/.test(informe));
check('Informe: título = nombre de la primada', new RegExp('informe-title">' + prm().nombre).test(informe));
// COMPACTO: productos inline (emoji+nombre+×N) en .informe-prods, SIN subtotal por ítem.
check('Informe: Beto con su producto inline (emoji + nombre + ×cantidad)', /informe-prods">🍺 Costeñita ×2/.test(informe));
check('Informe: SIN subtotal por producto (no hay "×2…$7.000" en la fila)', !/×2<\/span><span>\$7\.000/.test(informe));
// Dos columnas: izquierda (nombre+productos) + TOTAL a la derecha (.informe-total), centrado, SIN label "Total".
check('Informe: total de la persona = .informe-total $7.000 (sin label "Total")',
  /informe-total">\$7\.000<\/div>/.test(informe) && !/>Total</.test(informe));
check('Informe: Ana (principal, sin consumo ni cover) OMITIDA', !new RegExp('informe-nombre">' + ana.nombre).test(informe));
check('Informe ABIERTA: resumen "Por cobrar" en ámbar (.cobrar), no "Ganancia"',
  /informe-resumen cobrar">Por cobrar \$7\.000/.test(informe) && !/informe-resumen gan/.test(informe));
// El cover se rotula "Cover" (no "Entrada") como chip SIN precio (el precio ya está en el Total). Quito la exoneración → cover 10.000.
Store.actions.toggleCoverExonerado(prm().id, beto.id);
const conCover = window.View.informeTemplateHTML(prm());
check('Informe: cover como chip "Cover" SIN precio (no "Cover $X", no "Entrada")',
  /· Cover<\/div>/.test(conCover) && !/Cover \$/.test(conCover) && !/Entrada/.test(conCover));
Store.actions.toggleCoverExonerado(prm().id, beto.id);   // restaurar exoneración (cover 0) para el resto del flujo
check('Informe: footer "Generado con Primadapp"', /informe-foot">Generado con Primadapp/.test(informe));
// Bre-B del principal (snapshot p.pago.breB): línea destacada 🔑 tras el título. Sin breB → omitida.
check('Informe: sin Bre-B → la línea 🔑 se omite', !/informe-llave/.test(informe));
const prevBreB = prm().pago.breB;
prm().pago.breB = 'ana@bre-b';
const conLlave = window.View.informeTemplateHTML(prm());
check('Informe: Bre-B como línea "🔑 Bre-B {valor}" (etiqueta + valor)', /informe-llave">🔑 Bre-B ana@bre-b/.test(conLlave));
check('Informe: la 🔑 va tras el título y antes de los asistentes',
  conLlave.indexOf('informe-title') < conLlave.indexOf('informe-llave') &&
  conLlave.indexOf('informe-llave') < conLlave.indexOf('informe-asis'));
prm().pago.breB = prevBreB || null;   // restaurar el snapshot
// FALLBACK (bug): si el snapshot pago.breB es null pero la PERSONA principal ya tiene Bre-B (se agregó
// DESPUÉS de crear la primada), el 🔑 igual aparece tomando la llave vigente de la persona.
prm().pago.breB = null;                                  // snapshot vacío (como una primada vieja)
Store.actions.setBreBPersona(ana.id, 'ana-nueva@bre-b'); // llave agregada a la persona después
check('Informe: Bre-B por FALLBACK a la persona principal cuando el snapshot es null',
  /informe-llave">🔑 Bre-B ana-nueva@bre-b/.test(window.View.informeTemplateHTML(prm())));
Store.actions.setBreBPersona(ana.id, '');                // restaurar (persona sin llave)
// View.shareInforme existe y es invocable (la captura/share real se prueba en navegador, no en jsdom).
check('View.shareInforme expuesta', typeof window.View.shareInforme === 'function');

/* ---------- 7c. Orden por consumo (mayor total arriba) en app e informe ---------- */
section('Orden por consumo: el que más debe, primero (cara Consumos + informe)');
click('[data-act="set-cara"][data-cara="operacion"]');   // volver a la cara Consumos
// Beto (2 cervezas = 7.000, exonerado) vs Ana (principal, 0) → Beto arriba en la lista.
const ordenDom = qa('[data-act="activar-asis"]').map(el => el.dataset.pid);
check('Consumos: mayor total primero (Beto $7.000 antes que Ana $0)',
  ordenDom.indexOf(beto.id) >= 0 && ordenDom.indexOf(beto.id) < ordenDom.indexOf(ana.id));
// Informe: pendientes primero, saldadas al final. Doy a Ana un consumo (3.500) para que aparezca.
// Ana es principal → saldo 0 → SALDADA (va al final, con ✓). Beto debe 7.000 → PENDIENTE (arriba).
Store.actions.changeItem(prm().id, ana.id, 'cerveza', +1);
const infOrden = window.View.informeTemplateHTML(prm());
check('Informe: pendiente arriba, saldada al final (Beto $7.000 antes que Ana, principal saldada)',
  infOrden.indexOf('informe-nombre">' + beto.nombre) < infOrden.indexOf(ana.nombre + '</div>'));
check('Informe: saldada (Ana, principal) lleva ✓ delante del nombre',
  infOrden.indexOf('informe-check') >= 0 && infOrden.indexOf('informe-check') < infOrden.indexOf(ana.nombre + '</div>'));
Store.actions.changeItem(prm().id, ana.id, 'cerveza', -1);   // restaurar (Ana sin consumo) para el resto del flujo
check('Orden es presentación: Ana volvió a total 0 tras restaurar', Store.select.totalAsistencia(prm(), anaAsis()) === 0);

/* ---------- 8. Cerrar congela consumos pero la UI sigue viva ---------- */
section('Cerrar cuenta (INVARIANTE #4): "Cerrar" salió de Config; congela consumos');
// P5 lote visual: "Cerrar" YA NO vive en Configuración. Es un CTA contextual que aparece arriba de la
// operación SOLO cuando todos saldaron. Mientras Beto deba (7.000), el CTA NO está y Config no lo ofrece.
check('CTA "Cerrar" ausente mientras Beto debe', !q('[data-act="cerrar-primada"]'));
abrirConfig();
check('Gear › Primada: 2 sub-tabs de config (Asistentes | Productos)',
  !q('#overlay').hidden && !!q('[data-act="config-tab"][data-ctab="asistentes"]') && !!q('[data-act="config-tab"][data-ctab="productos"]'));
check('La config NO ofrece "Cerrar" (CTA contextual de la operación) ni "Eliminar" (vive en Calendario)',
  !/data-act="cerrar-primada"/.test(q('#overlay').innerHTML) && !/data-act="borrar-primada"/.test(q('#overlay').innerHTML));
click('[data-act="close-overlay"]');
// El modelo permite cerrar con deuda (la UI lo gatea tras el CTA); aquí cerramos por acción para
// probar el congelado con un deudor pendiente (escenario de pago-tras-cerrar en 8b).
Store.actions.cerrarPrimada(prm().id);
click('[data-act="set-cara"][data-cara="balance"]'); click('[data-act="set-cara"][data-cara="operacion"]');   // forzar re-render de la operación
eq('Primada cerrada', prm().estado, 'cerrada');
const before = cervezas();
activar(beto.id);                                                // ver sus chips (solo lectura en cerrada)
check('Cerrada: sin chips +/− para apuntar (consumo congelado en la UI)',
  !q(`[data-act="item-plus"][data-pid="${beto.id}"]`) && !q(`[data-act="item-minus"][data-pid="${beto.id}"]`));
Store.actions.changeItem(prm().id, beto.id, 'cerveza', +1);      // y el modelo ignora el intento directo
eq('Consumo congelado tras cerrar (changeItem no-op en cerrada)', cervezas(), before);

/* ---------- 8b. Pago BINARIO vía UI con la cuenta CERRADA (INVARIANTE #4) ---------- */
section('Pago: "Pagar" → hoja con llave → "Ya pagué", con la primada cerrada');
// Beto exonerado, 2 cervezas → total 7.000, saldo 7.000 (no pagado)
eq('Saldo de Beto antes de pagar = 7.000', Store.select.saldoDe(prm(), betoAsis()), 7000);
activar(beto.id);                                          // la UI de pago vive en el reveal de la persona activa
click(`[data-act="open-pagar"][data-pid="${beto.id}"]`);   // abre la hoja "Pagar"
check('Hoja Pagar abierta (aún cerrada la primada)', !q('#overlay').hidden && /sheet-title">Pagar a/.test(q('#overlay').innerHTML));
click(`[data-act="marcar-pagado"][data-pid="${beto.id}"]`); // "Ya pagué"
eq('Beto marcado pagado', betoAsis().pagado, true);
eq('Saldo de Beto = 0 tras pagar', Store.select.saldoDe(prm(), betoAsis()), 0);
eq('Informe: recaudado real = 7.000', Store.select.informePrincipal(prm()).recaudadoReal, 7000);
eq('Informe: saldo pendiente = 0', Store.select.informePrincipal(prm()).saldoPendiente, 0);
check('La hoja Pagar se cerró al marcar', q('#overlay').hidden);
// Deshacer (vuelve a deber) y re-marcar (queda pagado para la persistencia)
click(`[data-act="set-no-pagado"][data-pid="${beto.id}"]`);
eq('Deshacer: Beto vuelve a deber 7.000', Store.select.saldoDe(prm(), betoAsis()), 7000);
click(`[data-act="open-pagar"][data-pid="${beto.id}"]`);
click(`[data-act="marcar-pagado"][data-pid="${beto.id}"]`);
eq('Re-marcado pagado (persistencia)', betoAsis().pagado, true);

/* ---------- 8b·3. Feedback visual del pago: check en Consumos + Recaudo no oculta saldados ---------- */
section('Pago saldado: check en la tarjeta Consumos + Recaudo lista al saldado (nadie desaparece)');
// Beto saldado (saldo 0, total 7.000>0). En la cara Consumos su fila debe llevar check + nombre teal.
click('[data-act="set-cara"][data-cara="operacion"]'); activar(beto.id);
check('Consumos: Beto saldado muestra .asis-check junto al nombre',
  /asis-check/.test(q('#screen').querySelector(`[data-act="activar-asis"][data-pid="${beto.id}"]`).innerHTML));
check('Consumos: la fila saldada lleva el nombre en teal (.asis-fila-id.saldado)',
  !!q('#screen').querySelector(`.asis-fila[data-pid="${beto.id}"] .asis-fila-id.saldado`));
// Recaudo: Beto NO desaparece — aparece al final como saldado (.kv.saldada con check), no como deudor ámbar.
click('[data-act="set-cara"][data-cara="balance"]');
click('[data-act="toggle-balance"][data-sec="informe"]');   // expandir el acorde del Recaudo (la lista vive dentro)
const recaudo = q('#screen').innerHTML;
check('Recaudo: bloque saldadas presente (.kv.saldada) con Beto y un check',
  /kv saldada/.test(recaudo) && new RegExp('kv saldada[^]*asis-check[^]*' + beto.nombre).test(recaudo));
check('Recaudo: Beto ya NO figura como pendiente con monto ámbar (.pend)',
  !new RegExp(beto.nombre + '</span><b class="pend"').test(recaudo));
// El VALOR no desaparece: la fila saldada muestra el monto que pagó (su total) en teal (.pagado).
const totalBeto = Store.select.totalAsistencia(prm(), betoAsis());
const pesoRe = window.Util.peso(totalBeto).replace(/[.$]/g, '\\$&');   // escapa $ y . para el RegExp
check('Recaudo: saldado conserva el monto pagado (.kv.saldada con <b class="pagado"> + total de Beto)',
  new RegExp('kv saldada"><span>[^]*' + beto.nombre + '</span><b class="pagado">' + pesoRe).test(recaudo));
click('[data-act="toggle-balance"][data-sec="informe"]');   // colapsar de nuevo (no contaminar tests posteriores)

/* ---------- 8b·2. CTA contextual "Todos pagaron · Cerrar primada" (P5 lote visual) ---------- */
section('CTA "Todos pagaron · Cerrar primada" aparece y cierra (P5)');
// Beto ya pagó → nadie debe (saldoPendiente 0) y hubo plata → el CTA debe ofrecerse en la operación.
Store.actions.reabrirPrimada(prm().id);
click('[data-act="set-cara"][data-cara="balance"]'); click('[data-act="set-cara"][data-cara="operacion"]');   // re-render de la operación
eq('Reabierta para probar el CTA', prm().estado, 'abierta');
check('Todos saldados (saldo pendiente 0)', Store.select.informePrincipal(prm()).saldoPendiente === 0);
const cta = q('[data-act="cerrar-primada"]');
check('CTA "Cerrar" presente cuando todos pagaron', !!cta && /Todos pagaron/.test(cta.textContent));
click(cta);                                                      // cerrar por el CTA real
eq('Primada cerrada vía CTA', prm().estado, 'cerrada');
// CARA por estado (refactor Resumen→Balance): al cerrar, la primada ABRE en su Balance (documento final),
// con el switch presente y la cara Consumos accesible (congelada). El cálculo no cambia.
check('Cerrada → cara Balance visible (reparto)', /Ganancia/.test(q('#screen').innerHTML));
check('Switch de cara presente (Consumos | Balance)',
  !!q('[data-act="set-cara"][data-cara="operacion"]') && !!q('[data-act="set-cara"][data-cara="balance"]'));
check('Seg Balance marcado activo (on) al abrir cerrada',
  /class="seg on"[^>]*data-cara="balance"/.test(q('#screen').innerHTML));
// STATE-AWARE en CERRADA: documento final → SIN nota provisional (Ganancia); Recaudo = lo ENTREGADO.
check('Cerrada: SIN nota "Provisional" (ni en Ganancia ni en Recaudo)', !/[Pp]rovisional/.test(q('#screen').innerHTML));
check('Cerrada Recaudo: héroe tono "entregado" (teal/--accent)', /class="bal-amount entregado"/.test(q('#screen').innerHTML));
check('Cerrada Recaudo: teaser en pasado "Entregó … al Tesorero"', /Entregó .*al Tesorero/.test(q('#screen').innerHTML));
// CERRADA: sin "Por cobrar"; y el microcopy se OMITE (el teaser ya lo dice todo) → no hay .bal-note en Recaudo.
check('Cerrada Recaudo: sin "Por cobrar"', !/Por cobrar/.test(q('#screen').innerHTML));
click('[data-act="set-cara"][data-cara="operacion"]');           // la cara Consumos sigue accesible…
check('Cara Consumos accesible con la cuenta cerrada', /Asistentes/.test(q('#screen').innerHTML));
activar(beto.id);                                                // activar para ver sus chips (solo lectura)
check('…pero congelada: sin chips +/− (consumo solo-lectura)',
  !q(`[data-act="item-plus"][data-pid="${beto.id}"]`) && !q(`[data-act="item-minus"][data-pid="${beto.id}"]`));
check('Cerrada: el consumo se ve como chip de solo lectura (.chip.has.ro)', !!q('.chip.has.ro'));

/* ---------- 8c. Directorio: cambiar estado NO reescribe snapshots (INVARIANTE #1) vía UI ---------- */
section('Directorio: cambiar estado vigente conserva la historia (INV#1)');
eq('Snapshot de Beto en la asistencia = invitado', betoAsis().estadoEnEseMomento, 'invitado');
click('#gearBtn'); click('[data-act="overlay-tab"][data-overlay="personas"]');   // gear → tab Personas
check('Beto aparece en 1 primada (historia)', Store.select.aparicionesDe(beto.id) === 1);
click(`[data-act="editar-persona"][data-pid="${beto.id}"]`);   // drill-in al detalle ENFOCADO de Beto
check('Detalle enfocado de Beto abierto (back + campos)', !!q('[data-act="cerrar-persona-edit"]') && !!q(`[data-ch="rename-persona"][data-pid="${beto.id}"]`));
click(`[data-act="set-estado-persona"][data-pid="${beto.id}"][data-estado="ahorrador"]`);
eq('Estado VIGENTE de Beto ahora = ahorrador', Store.select.persona(beto.id).estado, 'ahorrador');
eq('Snapshot histórico INTACTO (sigue invitado)', betoAsis().estadoEnEseMomento, 'invitado');
check('Reparto no cambió: Beto sigue sin contar como ahorradora (snapshot)',
  Store.select.asistenciasAhorradoras(prm()).every(a => a.personaId !== beto.id));
// Editar la llave Bre-B desde el directorio
click('[data-act="overlay-tab"][data-overlay="ajustes"]');
check('Seg-nav cambia a Ajustes (cover)', /Cover/.test(q('#overlay').innerHTML));
check('Ajustes enlaza la Política de Privacidad', !!q('#overlay a[href="privacy.html"]'));
// FASE 2b: "Borrar mi cuenta" (Apple 5.1.1(v)) SOLO con sesión. Sin sesión (modo local en jsdom): ausente.
check('Sin sesión: Ajustes NO ofrece "Borrar mi cuenta"', !q('[data-act="borrar-mi-cuenta"]'));
// La View es pura (state, ui)→DOM: con ui.sesion=true el botón aparece (gate de UI; el RPC lo gatea el server).
window.View.render(st(), Object.assign({}, window.Controller._ui, { overlay: 'ajustes', sesion: true }));
check('Con sesión: aparece "Borrar mi cuenta"', !!q('[data-act="borrar-mi-cuenta"]'));
check('La nota aclara que las primadas se conservan', /se conservan/.test(q('#overlay').innerHTML));
click('[data-act="overlay-tab"][data-overlay="personas"]');   // vuelve por el flujo real (rerender resetea sesion)
click('[data-act="close-overlay"]');
check('Pantalla cerrada', q('#overlay').hidden);

/* ---------- 9. Navegación de tabs ---------- */
section('Navegación: tab Fondo (Próximamente)');
click('[data-tab="fondo"]');
check('Tab Fondo muestra Próximamente', /Próximamente/.test(q('#screen').innerHTML));
click('[data-tab="primadas"]');
check('Vuelve a Primadas', /Asistentes/.test(q('#screen').innerHTML));

/* ---------- 10. Persistencia (lo escrito quedó en localStorage v4) ---------- */
section('Persistencia');
const saved = JSON.parse(window.localStorage.getItem('laPrimada'));
check('localStorage tiene schemaVersion 6', saved && saved.schemaVersion === 6);
check('Persistió la primada con sus 2 asistencias', saved.primadas[0].asistencias.length === 2);
check('v6: el espejo local guarda consumos[] en la primada', Array.isArray(saved.primadas[0].consumos));

/* ---------- 11. Historial: abrir una primada vieja muestra valores CONGELADOS ---------- */
section('Historial: abrir una primada pasada muestra sus snapshots (no recalcula con hoy)');
const viejaId = Store.select.activePrimada().id;
const coverViejo = JSON.stringify(Store.select.activePrimada().cover);   // snapshot original (15.000/10.000)
// Cambiar el cover GLOBAL en Ajustes (no debe reescribir la vieja)
click('#gearBtn');
click('[data-act="overlay-tab"][data-overlay="ajustes"]');
setVal('[data-ch="cover-ahorrador"]', '20000');
setVal('[data-ch="cover-invitado"]', '12000');
click('[data-act="close-overlay"]');
eq('Cover global cambiado a invitado 12.000', Store.select.state().settings.cover.invitado, 12000);
// Crear una primada nueva → toma el cover NUEVO (vía acción; el wizard se prueba en la sección 12)
Store.actions.createPrimada({});
const nuevaId = Store.select.activePrimada().id;
eq('La primada NUEVA toma el cover global nuevo (12.000)', Store.select.activePrimada().cover.invitado, 12000);
// El historial vive ahora en el SELECTOR (agrupado por año→mes): abrirlo y tocar la vieja.
click('[data-act="open-selector"]');
check('Selector abierto (hoja "Primadas")', !q('#overlay').hidden && /sheet-title">Primadas/.test(q('#overlay').innerHTML));
check('La vieja aparece en el selector', !!q(`[data-act="select-primada"][data-id="${viejaId}"]`));
click(`[data-act="select-primada"][data-id="${viejaId}"]`);
check('El selector se cerró al elegir', q('#overlay').hidden);
eq('Se abrió la primada vieja', Store.select.activePrimada().id, viejaId);
eq('Su cover sigue CONGELADO (10.000, no 12.000)', Store.select.activePrimada().cover.invitado, 10000);
eq('Snapshot del cover idéntico al original', JSON.stringify(Store.select.activePrimada().cover), coverViejo);

/* ---------- 12. Wizard "Nueva primada" (3 pasos) por clics REALES ---------- */
section('Wizard Nueva primada: organizadores → productos → fecha → crear');
const primadasAntes = st().primadas.length;
// Crear vive SOLO en el gear › Primadas (con primada activa, ya no hay "+" en la cabecera).
click('#gearBtn'); click('[data-act="overlay-tab"][data-overlay="calendario"]');
check('Gear › Primadas: "Nueva primada" (único punto de creación)', !!q('[data-act="new-primada"]'));
click('[data-act="new-primada"]');                          // abre el wizard SOBRE el gear
check('Wizard abierto (paso 1, overlay visible)', !q('#overlay').hidden && /wz-title">Organizadores/.test(q('#overlay').innerHTML));
check('Aún no se creó la primada (solo abrió el wizard)', st().primadas.length === primadasAntes);
// intentar avanzar sin principal → bloquea
click('[data-act="wz-siguiente"]');
check('Paso 1 sin principal NO avanza', /wz-title">Organizadores/.test(q('#overlay').innerHTML));
// elegir principal (Ana, ahorradora) + un co-organizador (Beto)
setVal('#wz-principal', ana.id);
check('Beto aparece como co-organizador candidato', !!q(`[data-act="wz-toggle-coorg"][data-pid="${beto.id}"]`));
click(`[data-act="wz-toggle-coorg"][data-pid="${beto.id}"]`);
click('[data-act="wz-siguiente"]');                         // → paso 2
check('Avanzó al paso 2 (productos)', /wz-title">Productos/.test(q('#overlay').innerHTML));
// quitar todos los productos y agregar uno desde cero
let nProd = qa('[data-act="wz-prod-remove"]').length;
for (let i = 0; i < nProd; i++) click('[data-act="wz-prod-remove"]');
click('[data-act="wz-prod-add"]');
setVal('[data-wz="nombre"][data-i="0"]', 'Cóctel');
setVal('[data-wz="emoji"][data-i="0"]', '🍹');
setVal('[data-wz="costoNeto"][data-i="0"]', '4000');
setVal('[data-wz="precioVenta"][data-i="0"]', '12000');
click('[data-act="wz-siguiente"]');                         // → paso 3
check('Avanzó al paso 3 (fecha y mes)', /wz-title">Fecha/.test(q('#overlay').innerHTML));
setVal('#wz-fecha', '2026-05-31');
setVal('#wz-mes', '2026-06');
click('[data-act="wz-crear"]');                             // crear
check('Wizard cerrado tras crear', q('#overlay').hidden);
eq('Se creó 1 primada nueva', st().primadas.length, primadasAntes + 1);
const nueva = Store.select.activePrimada();
eq('Primada activa = la del wizard', nueva.id, st().primadas[0].id);
eq('Wizard: principal = Ana', nueva.organizadorPrincipalId, ana.id);
check('Wizard: NO incompleta (tiene principal)', !Store.select.primadaIncompleta(nueva));
eq('Wizard: 2 organizadores (Ana principal + Beto co-org)', nueva.asistencias.length, 2);
check('Wizard: Beto co-organizador (rol organizador)', nueva.asistencias.find(a => a.personaId === beto.id).rol === 'organizador');
eq('Wizard: 1 producto (Cóctel)', nueva.productos.length, 1);
eq('Wizard: producto Cóctel nombre', nueva.productos[0].nombre, 'Cóctel');
eq('Wizard: margen Cóctel = 8000', Store.select.margenProducto(nueva.productos[0]), 8000);
eq('Wizard: fecha 2026-05-31', nueva.fecha, '2026-05-31');
eq('Wizard: mes contable 2026-06 (distinto a la fecha)', nueva.mesContable, '2026-06');
// cancelar un wizard nuevo no crea nada
const antesCancelar = st().primadas.length;
click('#gearBtn'); click('[data-act="overlay-tab"][data-overlay="calendario"]');
click('[data-act="new-primada"]');
click('[data-act="wz-cancelar"]');
check('Cancelar el wizard cierra sin crear', q('#overlay').hidden && st().primadas.length === antesCancelar);

/* ---------- 13. Ciclo de vida simplificado: dot DERIVADO de actividad (sin estado 'programada') ---------- */
section('Dot por actividad: abierta sin consumos = ámbar (idle); con consumos = verde; cerrada = gris');
// El selector es navegación PURA: ya NO tiene "Programar" ni "+" de crear.
click('[data-act="open-selector"]');
check('Selector SIN "Programar" (creación vive en el gear)', !q('#overlay').hidden && !q('[data-act="open-programar"]'));
check('Selector SIN sección "Próximas" (el estado programada se eliminó)', !/sel-anio">Próximas/.test(q('#overlay').innerHTML));
click('[data-act="close-overlay"]');
// Creamos una primada ABIERTA SIN consumos (vía wizard sería largo; usamos la acción del modelo).
const idNueva = Store.actions.createPrimada({ principalId: ana.id, organizadores: [ana.id], mesContable: '2026-10', fecha: '2026-10-05' });
Store.actions.seleccionarPrimada(idNueva);   // commit → notify → la Vista re-renderiza (suscripción)
const nueva13 = () => Store.select.state().primadas.find(p => p.id === idNueva);
eq('Recién creada → estado abierta (no programada)', nueva13().estado, 'abierta');
check('Sin consumos → dot ámbar (.dot.idle) en el selector', /class="dot idle"/.test(q('#screen').innerHTML));
// Registrar el primer consumo → el dot pasa a verde (.dot.open)
activar(ana.id);
click(`[data-act="item-plus"][data-pid="${ana.id}"][data-prod="cerveza"]`);
check('Con ≥1 consumo → dot verde (.dot.open), ya no ámbar',
  /class="dot open"/.test(q('#screen').innerHTML) && !/class="dot idle"/.test(q('#screen').innerHTML));
// El "+" de crear NO existe en la cabecera del selector (único punto = gear)
check('Cabecera del selector SIN "+" de crear (.icon-btn.nueva)', !q('#screen .icon-btn.nueva'));
check('Único punto de creación: "Nueva primada" vive en el gear › Primadas', (() => {
  click('#gearBtn'); click('[data-act="overlay-tab"][data-overlay="calendario"]');
  const ok = !!q('[data-act="new-primada"]') && !q('[data-act="open-programar"]');
  click('[data-act="close-overlay"]'); return ok;
})());
// Migración (tolerancia): inyectar un estado con una 'programada' histórica → carga como abierta autosanada.
const conProg = JSON.parse(JSON.stringify(Store.select.state()));
conProg.primadas.unshift({ id: 'prm_legacy_prog', nombre: 'Legacy', fecha: '', mesContable: '2026-11',
  organizadorPrincipalId: ana.id, pago: { breB: null }, cover: { ahorrador: 15000, invitado: 10000 },
  productos: [], asistencias: [{ personaId: ana.id, estadoEnEseMomento: 'ahorrador', rol: 'principal', coverExonerado: false, pagado: false }],
  consumos: [], estado: 'programada' });
Store.actions.replaceState(conProg);
const legacy = Store.select.state().primadas.find(p => p.id === 'prm_legacy_prog');
eq("Migración UI: 'programada' histórica → 'abierta'", legacy.estado, 'abierta');
check('Migración UI: autosana productos (no queda vacía)', legacy.productos.length > 0);

/* ---------- Resumen ---------- */
console.log(`\n${'='.repeat(50)}`);
console.log(`E2E: ${pass} pasaron, ${fail} fallaron`);
if (fail) { console.log('Fallaron:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('E2E verde ✓');

}   // fin runTests
