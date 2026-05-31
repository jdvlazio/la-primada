/* ============================================================
   CONFIG — constantes y valores por defecto (esquema v4)
   Se carga PRIMERO. Expone window.CONFIG (browser) y module.exports (Node/tests).
   ============================================================ */
(function (root) {
  'use strict';

  const CONFIG = {
    storageKey: 'laPrimada',
    schemaVersion: 4,
    locale: 'es-CO',

    // Cover "fijo": un único valor VIGENTE (editable hacia adelante). Sugerido SOLO para instalación nueva;
    // las primadas viejas conservan su propio snapshot y NO se reescriben.
    defaultCover: { ahorrador: 15000, invitado: 10000 },

    // Catálogo base de productos (dos precios). Se copia (snapshot) al crear una primada.
    // La rifa se modela como producto normal con costoNeto 0 (ganancia bruta); el premio de costo fijo
    // lo manejará el módulo de tesorería futuro (ver CLAUDE.md).
    defaultProducts: [
      { id: 'cerveza', nombre: 'Costeñita',       emoji: '🍺',  costoNeto: 2500, precioVenta: 3500, aportadoPor: null },
      { id: 'brownie', nombre: 'Brownie',         emoji: '🍫',  costoNeto: 6000, precioVenta: 9000, aportadoPor: null },
      { id: 'rollo',   nombre: 'Rollo de canela', emoji: '🌀',  costoNeto: 6000, precioVenta: 9000, aportadoPor: null },
      { id: 'rifa',    nombre: 'Boleta de rifa',  emoji: '🎟️', costoNeto: 0,    precioVenta: 5000, aportadoPor: null },
    ],
  };

  root.CONFIG = CONFIG;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CONFIG };
})(typeof window !== 'undefined' ? window : globalThis);
