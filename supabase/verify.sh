#!/usr/bin/env bash
# Verifica, con la anon key pública (vía PostgREST), que el esquema quedó creado.
# No requiere credenciales de servicio. Correr DESPUÉS de ejecutar schema.sql en Supabase.
#   bash supabase/verify.sh
set -u
URL="https://iaxlefbmtgowtusghwkz.supabase.co/rest/v1"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlheGxlZmJtdGdvd3R1c2dod2t6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTU2NDgsImV4cCI6MjA5NTg3MTY0OH0.grK-ZTUCTQbo9GMUo1o6U2y6FDODcpwtfjK_7tct95c"

echo "== Existencia de tablas (vía PostgREST con anon key) =="
for t in personas primadas settings profiles; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL/$t?select=*&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
  case "$code" in
    200) echo "  ✓ $t        existe y es legible (200)";;
    401|403) echo "  ✓ $t        existe, RLS bloquea sin login ($code) — esperado para anónimo";;
    404) echo "  ✗ $t        NO existe (404) — ¿corriste schema.sql?";;
    *)   echo "  ? $t        HTTP $code";;
  esac
done

echo
echo "== Prueba de RLS: INSERT anónimo debe ser RECHAZADO =="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/personas" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"id":"per_probe_anon","nombre":"PROBE","estado":"invitado"}')
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  echo "  ✓ INSERT anónimo rechazado ($code) — RLS activa"
elif [ "$code" = "201" ]; then
  echo "  ✗ INSERT anónimo ACEPTADO (201) — ¡RLS NO está protegiendo! revisar."
else
  echo "  ? HTTP $code"
fi
echo
echo "Nota: con anon key (sin sesión) lo esperado es 401/403 por RLS. La lectura real"
echo "se prueba con un usuario autenticado en el PASO 4 (cross-device)."
