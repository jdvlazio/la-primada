/* ============================================================
   Util — utilidades puras, sin estado
   Se carga tras CONFIG. Expone window.Util (browser) y module.exports (Node/tests).
   ============================================================ */
(function (root) {
  'use strict';

  const CONFIG = root.CONFIG || (typeof require !== 'undefined' ? require('./config.js').CONFIG : {});

  const Util = {
    uid: (prefix = 'p') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    peso: n => '$' + Number(n || 0).toLocaleString(CONFIG.locale),
    esc: s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])),

    // 'YYYY-MM' del mes actual
    currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; },
    // 'YYYY-MM-DD' de hoy
    currentDate() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    // Extrae 'YYYY-MM' de una fecha 'YYYY-MM-DD' (o 'YYYY-MM'); fallback al mes actual.
    mesDeFecha(f) { const m = String(f || '').match(/^(\d{4}-\d{2})/); return m ? m[1] : Util.currentMonth(); },

    // 'YYYY-MM' → "Mayo de 2026" (capitalizado)
    monthLabel(ym) {
      if (!ym) return '';
      const [y, m] = String(ym).split('-').map(Number);
      if (!y || !m) return ym;
      const s = new Date(y, m - 1, 1).toLocaleDateString(CONFIG.locale, { month: 'long', year: 'numeric' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
    // 'YYYY-MM' → "Junio" (solo el mes, capitalizado). Para filas agrupadas bajo el año.
    monthName(ym) {
      if (!ym) return '';
      const [y, m] = String(ym).split('-').map(Number);
      if (!y || !m) return ym;
      const s = new Date(y, m - 1, 1).toLocaleDateString(CONFIG.locale, { month: 'long' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
    // 'YYYY-MM' → "Junio 2026" (mes + año, SIN "de"). Línea principal del selector cerrado.
    monthYear(ym) {
      if (!ym) return '';
      const [y, m] = String(ym).split('-').map(Number);
      if (!y || !m) return ym;
      return Util.monthName(ym) + ' ' + y;
    },
  };

  root.Util = Util;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Util };
})(typeof window !== 'undefined' ? window : globalThis);
