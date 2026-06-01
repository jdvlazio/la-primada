// @ts-check
// playwright.config.js — E2E de navegador real para La Primada.
// Réplica del andamiaje de Otrofestiv, adaptado al dominio (primadas/asistentes)
// y al servidor local de La Primada (localhost:4178, ver .claude/launch.json).
//
// Capa de tests:
//   · npm test        → suite node/jsdom (run.js + api.js + e2e.js) — modelo/migración/MVC.
//   · npm run test:e2e → ESTA suite Playwright (Chromium real, viewport mobile).
// Es ADITIVA: no reemplaza la suite node, la complementa con navegador real.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // Solo los .spec.js son Playwright; run.js/api.js/e2e.js (node) quedan fuera por nombre.
  testMatch: /.*\.spec\.js/,
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  // SERIAL (workers:1, sin paralelo): el webServer es `python3 -m http.server`, monohilo;
  // peticiones concurrentes de varios workers a los módulos JS se atascan y la app no monta.
  // Además alinea con la regla del proyecto (CLAUDE.md): secuencial, no en paralelo.
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4178',
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 14 — mobile-first (referencia 390px)
    locale: 'es-CO',                       // moneda/fecha deterministas — coincide con la app
    timezoneId: 'America/Bogota',
    // Bloquea el Service Worker en tests: su activate hace clients.navigate(url) (recarga dura
    // para propagar deploys) que, en un contexto fresco, recarga la página a mitad del bootstrap
    // y destruye el execution context. El SW es otra preocupación; aquí auditamos la app.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Sirve el sitio estático tal cual lo hace GitHub Pages (sin build).
  webServer: {
    command: 'python3 -m http.server 4178',
    url: 'http://localhost:4178',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
