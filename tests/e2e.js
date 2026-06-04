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
// Acordeón: las tarjetas nacen CERRADAS; rol/cover/steppers/abonos viven en el .acc-body expandido.
// abrir(pid) es idempotente: togglea solo si está cerrada (sin .acc-body para ese pid).
function abrir(pid) {
  const head = q(`.acc-head[data-pid="${pid}"]`);
  if (!head) throw new Error('abrir: no existe la cabecera de ' + pid);
  if (!head.closest('.asis').querySelector('.acc-body')) click(head);
}

/* ============================================================ */
section('Arranque (bootstrap cableó la Vista sobre el modelo v4)');
check('Store, View y Controller existen en window', !!window.Store && !!window.View && !!window.Controller);
check('Render inicial: tab Primadas con estado vacío (UNA invitación)', /Tu primera primada/.test(q('#screen').innerHTML));
// Estado vacío SIN redundancia: no hay selector ni "+" en la cabecera; solo la invitación con el .btn.
check('Estado vacío: NO hay selector de primada (.selrow)', !q('#screen .selrow'));
check('Estado vacío: NO hay "+" chico (.icon-btn.nueva)', !q('#screen .icon-btn.nueva'));
check('Estado vacío: el botón "Crear primada" es un .btn[data-act=new-primada]', !!q('#screen .btn[data-act="new-primada"]'));
// El botón de la invitación abre el wizard; cancelar vuelve al estado vacío.
click('#screen .btn[data-act="new-primada"]');
check('Estado vacío: el botón abre el wizard', !!q('.wz'));
click('[data-act="wz-cancelar"]');
check('Cancelar el wizard vuelve a la invitación', !q('.wz') && /Tu primera primada/.test(q('#screen').innerHTML));
eq('localStorage limpio → 0 personas', st().personas.length, 0);

/* ---------- 1. Directorio de personas (overlay del engranaje) ---------- */
section('Personas: alta desde el overlay del engranaje');
click('#gearBtn');                                   // abre la pantalla Personas
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
section('Asignar principal — invariante "principal siempre ahorrador"');
// El ROL es CONFIGURACIÓN: vive en el overlay "Configurar primada" (sección Asistentes), no en operación.
click(`[data-act="open-config-primada"][data-id="${prm().id}"]`);
check('Sección Asistentes en Configurar', /Asistentes/.test(q('#overlay').innerHTML));
// Filas de asistente = acordeón (clon de Personas): expandir para acceder a rol/cover.
click(`[data-act="toggle-cfg-asis"][data-pid="${ana.id}"]`);
setVal(`select[data-ch="rol"][data-pid="${ana.id}"]`, 'principal');
eq('Ana es el principal', prm().organizadorPrincipalId, ana.id);
check('Ya no está incompleta', !Store.select.primadaIncompleta(prm()));
check('Snapshot de la llave Bre-B del principal en pago', 'breB' in prm().pago);

// Intentar hacer principal a Beto (invitado) → debe rechazarse por invariante
click(`[data-act="toggle-cfg-asis"][data-pid="${beto.id}"]`);
setVal(`select[data-ch="rol"][data-pid="${beto.id}"]`, 'principal');
eq('Beto NO pudo ser principal (sigue Ana)', prm().organizadorPrincipalId, ana.id);
check('Render se recuperó tras el error (config sigue con 2 asistentes)', qa('[data-act="toggle-cfg-asis"]').length === 2);
click('[data-act="close-overlay"]');

/* ---------- 5. Consumos ± (progressive disclosure) ---------- */
section('Consumos: primer ítem por el chip-picker, luego steppers ±');
// v6: la cantidad se cuenta desde consumos[] (Σ filas), no desde el viejo items{}.
const cervezas = () => (prm().consumos || []).filter(c => c.personaId === beto.id && c.productoId === 'cerveza').reduce((n, c) => n + (c.cantidad || 1), 0);
abrir(beto.id);   // idempotente: asegura su tarjeta expandida
// Progressive disclosure: sin cantidad>0 NO hay stepper; el primer consumo entra por "+ Agregar" → chip.
click(`[data-act="open-pickprod"][data-pid="${beto.id}"]`);
click(`[data-act="add-item"][data-pid="${beto.id}"][data-prod="cerveza"]`);   // 0→1 vía chip (INSERT fila)
eq('Beto lleva 1 cerveza (agregada por chip)', cervezas(), 1);
// Ya con cantidad>0 aparece el stepper: subir a 2 con +
click(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
eq('Beto lleva 2 cervezas', cervezas(), 2);
click(`[data-act="item-minus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
eq('Stepper baja a 1 (borró la fila más reciente)', cervezas(), 1);
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

// El cover (exonerar/cobrar) también es CONFIGURACIÓN → en Configurar, sección Asistentes.
click(`[data-act="open-config-primada"][data-id="${prm().id}"]`);
click(`[data-act="toggle-exonerado"][data-pid="${beto.id}"]`);
check('Beto exonerado', betoAsis().coverExonerado === true);
eq('Cover de Beto ahora 0', Store.select.coverDe(prm(), betoAsis()), 0);
eq('Ganancia baja al margen puro (2.000)', Store.select.ganancia(prm()), 2000);
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
// Beto debe (cover 0, pero 2 cervezas = 7.000 sin pagar) → ABIERTA: héroe = "Por cobrar" (NO "provisional").
check('Recaudo ABIERTA: microcopy "Por cobrar"', /Por cobrar/.test(q('#screen').innerHTML));
check('Recaudo ABIERTA: el héroe usa tono proceso (.por-cobrar), NO --alert/.owe',
  /class="bal-amount por-cobrar"/.test(q('#screen').innerHTML) && !/bal-amount owe/.test(q('#screen').innerHTML));
check('Recaudo ABIERTA: teaser con ambos números (Entrega … · Por cobrar …)', /Entrega .*al Tesorero · Por cobrar/.test(q('#screen').innerHTML));
check('Recaudo: "provisional" NO aparece en esta tarjeta (sí queda en Ganancia)',
  (q('#screen').innerHTML.match(/provisional/gi) || []).length === 1);   // solo la nota de Ganancia
click('[data-act="set-cara"][data-cara="operacion"]');

/* ---------- 8. Cerrar congela consumos pero la UI sigue viva ---------- */
section('Cerrar cuenta (INVARIANTE #4): "Cerrar" salió de Config; congela consumos');
// P5 lote visual: "Cerrar" YA NO vive en Configuración. Es un CTA contextual que aparece arriba de la
// operación SOLO cuando todos saldaron. Mientras Beto deba (7.000), el CTA NO está y Config no lo ofrece.
check('CTA "Cerrar" ausente mientras Beto debe', !q('[data-act="cerrar-primada"]'));
click(`[data-act="open-config-primada"][data-id="${prm().id}"]`);
check('Overlay de config abierto', !q('#overlay').hidden && /Configurar primada/.test(q('#overlay').innerHTML));
check('Config ya NO ofrece "Cerrar"', !/data-act="cerrar-primada"/.test(q('#overlay').innerHTML));
click('[data-act="close-overlay"]');
// El modelo permite cerrar con deuda (la UI lo gatea tras el CTA); aquí cerramos por acción para
// probar el congelado con un deudor pendiente (escenario de pago-tras-cerrar en 8b).
Store.actions.cerrarPrimada(prm().id);
click('[data-act="set-cara"][data-cara="balance"]'); click('[data-act="set-cara"][data-cara="operacion"]');   // forzar re-render de la operación
eq('Primada cerrada', prm().estado, 'cerrada');
const before = cervezas();
const plus = q(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
check('Steppers deshabilitados al cerrar', !!plus && plus.disabled === true);
if (plus) click(plus);   // aunque hagamos click, la acción debe ignorarlo
eq('Consumo congelado tras cerrar', cervezas(), before);

/* ---------- 8b. Pago BINARIO vía UI con la cuenta CERRADA (INVARIANTE #4) ---------- */
section('Pago: "Pagar" → hoja con llave → "Ya pagué", con la primada cerrada');
// Beto exonerado, 2 cervezas → total 7.000, saldo 7.000 (no pagado)
eq('Saldo de Beto antes de pagar = 7.000', Store.select.saldoDe(prm(), betoAsis()), 7000);
abrir(beto.id);                                            // la UI de pago vive en la tarjeta expandida
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
check('Cerrada Recaudo: nota "Entregado", sin "Por cobrar"', /Entregado/.test(q('#screen').innerHTML) && !/Por cobrar/.test(q('#screen').innerHTML));
click('[data-act="set-cara"][data-cara="operacion"]');           // la cara Consumos sigue accesible…
check('Cara Consumos accesible con la cuenta cerrada', /Asistentes/.test(q('#screen').innerHTML));
const congelado = q(`[data-act="item-plus"][data-pid="${beto.id}"][data-prod="cerveza"]`);
check('…pero congelada (steppers deshabilitados)', !!congelado && congelado.disabled === true);

/* ---------- 8c. Directorio: cambiar estado NO reescribe snapshots (INVARIANTE #1) vía UI ---------- */
section('Directorio: cambiar estado vigente conserva la historia (INV#1)');
eq('Snapshot de Beto en la asistencia = invitado', betoAsis().estadoEnEseMomento, 'invitado');
click('#gearBtn');                                   // abre la pantalla Personas
check('Beto aparece en 1 primada (historia)', Store.select.aparicionesDe(beto.id) === 1);
click(`[data-act="toggle-persona"][data-pid="${beto.id}"]`);   // expandir la fila para editar inline
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
click('[data-act="new-primada"]');                          // abre el wizard
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
click('[data-act="new-primada"]');
click('[data-act="wz-cancelar"]');
check('Cancelar el wizard cierra sin crear', q('#overlay').hidden && st().primadas.length === antesCancelar);

/* ---------- Resumen ---------- */
console.log(`\n${'='.repeat(50)}`);
console.log(`E2E: ${pass} pasaron, ${fail} fallaron`);
if (fail) { console.log('Fallaron:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('E2E verde ✓');

}   // fin runTests
