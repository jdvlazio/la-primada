# Supabase — La Primada

Backend confirmado en `CLAUDE.md` › "Arquitectura de backend — Supabase (CONFIRMADA)".

## Credenciales (públicas, van en el frontend)
- **Project URL:** `https://iaxlefbmtgowtusghwkz.supabase.co`
- **anon key:** pública por diseño (como las fuentes). RLS protege. **NUNCA** subir la `service_role` key.

## Paso 1 — Ejecutar el esquema
1. Supabase → **SQL Editor** → New query.
2. Pega el contenido de [`schema.sql`](schema.sql) y **Run**.
3. Es idempotente: se puede correr de nuevo sin romper.

## Sembrar el admin (una sola vez, a mano)
El trigger crea cada usuario nuevo como `role = 'miembro'`. El admin se promueve a mano:

1. El admin entra una vez por **magic link** (Paso 3) para que exista en `auth.users` / `profiles`.
2. En **SQL Editor**:
   ```sql
   update public.profiles set role = 'admin'
   where email = 'EMAIL_DEL_ADMIN';
   ```

## Sembrar emails de los ahorradores (sin registro)
No hay formulario de registro. El admin invita los emails desde
**Authentication → Users → Add user → Send invitation** (o por SQL/API).
Al recibir el magic link y entrar, el trigger les crea su `profile` como `miembro`.

## Modelo de permisos (RLS)
| Tabla    | SELECT            | INSERT            | UPDATE / DELETE   |
|----------|-------------------|-------------------|-------------------|
| primadas | todos autenticados| todos autenticados| todos autenticados|
| personas | todos autenticados| todos autenticados| **solo admin**    |
| settings | todos autenticados| **solo admin**    | **solo admin**    |
| profiles | todos autenticados| **solo admin**    | **solo admin**    |

Transparencia total en lectura. Los datos de evento (primadas) los edita cualquiera.
En personas, **cualquiera puede agregar** una persona nueva en plena primada, pero
**cambiar estado (ahorrador↔invitado) o borrar es solo del admin**. Los ajustes
globales (settings) los controla el admin.
