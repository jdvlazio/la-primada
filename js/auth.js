/* ============================================================
   AUTH — Supabase Auth (magic link, sin registro)
   Aísla el SDK de auth del resto de la app (igual que api.js aísla los datos).
   Reusa el MISMO client de Api → un solo GoTrueClient (sin warnings).
   ------------------------------------------------------------
   Sin SDK/client (tests/jsdom/offline) → `enabled()` es false: la app NO
   exige login (los 216 tests siguen corriendo sin gate).
   ------------------------------------------------------------
   Magic link, sin registro: el admin siembra los emails en Supabase.
   signIn(email) manda el link; al volver con el token en la URL, el SDK
   detecta la sesión (detectSessionInUrl) y onChange dispara el re-render.
   ============================================================ */
(function (root) {
  'use strict';

  const Api = root.Api || null;

  function client() { return Api && Api.client ? Api.client() : null; }
  // Hay auth real solo si hay client de Supabase (modo 'supabase').
  function enabled() { return !!client(); }

  // Sesión actual (o null). Async: el SDK lee del storage / procesa el token de la URL.
  async function getSession() {
    const c = client(); if (!c) return null;
    try { const { data } = await c.auth.getSession(); return data ? data.session : null; }
    catch (e) { return null; }
  }
  async function getUser() {
    const s = await getSession();
    return s ? s.user : null;
  }

  // Envía el magic link al email. redirectTo = la propia app (vuelve aquí autenticado).
  // No crea cuentas nuevas si el proyecto está en "invite only"; con signups abiertos, crea al entrar.
  async function signIn(email) {
    const c = client(); if (!c) throw new Error('Auth no disponible');
    const redirectTo = (typeof location !== 'undefined') ? (location.origin + location.pathname) : undefined;
    const { error } = await c.auth.signInWithOtp({ email: String(email || '').trim(), options: { emailRedirectTo: redirectTo } });
    if (error) throw new Error(error.message || 'No se pudo enviar el código');
    return true;
  }

  // Verifica el CÓDIGO (OTP) que llegó por correo → inicia sesión EN ESTE dispositivo (a diferencia
  // del magic link, que se abre donde se hace clic). type:'email' = el mismo signInWithOtp passwordless.
  // Requiere que el template de email de Supabase incluya el token ({{ .Token }}).
  async function verifyOtp(email, token) {
    const c = client(); if (!c) throw new Error('Auth no disponible');
    const { error } = await c.auth.verifyOtp({ email: String(email || '').trim(), token: String(token || '').trim(), type: 'email' });
    if (error) throw new Error(error.message || 'Código inválido o vencido');
    return true;
  }

  async function signOut() {
    const c = client(); if (!c) return;
    try { await c.auth.signOut(); } catch (e) {}
  }

  // Suscribe a cambios de sesión (SIGNED_IN al volver del magic link, SIGNED_OUT, etc.).
  function onChange(cb) {
    const c = client(); if (!c) return function () {};
    const { data } = c.auth.onAuthStateChange((_event, session) => cb(session));
    return function () { try { data.subscription.unsubscribe(); } catch (e) {} };
  }

  // Limpia el token de la URL tras procesarlo (deja la barra de direcciones limpia).
  function cleanUrl() {
    if (typeof history === 'undefined' || typeof location === 'undefined') return;
    if (location.hash && /access_token|error=/.test(location.hash)) {
      history.replaceState(null, '', location.origin + location.pathname + location.search);
    }
  }

  const Auth = { enabled, getSession, getUser, signIn, verifyOtp, signOut, onChange, cleanUrl };
  root.Auth = Auth;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Auth };
})(typeof window !== 'undefined' ? window : globalThis);
