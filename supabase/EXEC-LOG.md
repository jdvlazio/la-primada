# Ejecución del esquema — registro

**Fecha de ejecución:** sesión dedicada Supabase (vía SQL Editor con sesión del usuario en Chrome).
**Proyecto:** la-primada (`iaxlefbmtgowtusghwkz`) · org Otrofestiv · región Americas · rol `postgres`.

## Resultado
`schema.sql` ejecutado → **"Success. No rows returned"** (DDL, sin filas — correcto).

### Tablas creadas (4/4)
`personas`, `primadas`, `settings`, `profiles` — verificado `count(*) = 4` en `information_schema.tables`.

### RLS habilitada (4/4)
`personas`, `primadas`, `settings`, `profiles` → `relrowsecurity = true`.

### Políticas activas (10)
| Tabla    | Políticas |
|----------|-----------|
| personas | select_all (SELECT) · insert_all (INSERT) · update_admin (UPDATE) · delete_admin (DELETE) |
| primadas | select_all (SELECT) · write_all (ALL) |
| settings | select_all (SELECT) · admin_write (ALL) |
| profiles | select_all (SELECT) · admin_write (ALL) |

Coincide con el ajuste #3: en `personas`, INSERT abierto a todos; UPDATE/DELETE solo admin.

## Pendiente (próximos pasos, NO en este paso)
- Sembrar el admin: tras su primer login por magic link, `update profiles set role='admin' where email='…'`.
- PASO 2: adaptador `js/api.js`. PASO 3: auth magic link. PASO 4: verificación cross-device.
