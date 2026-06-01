-- ============================================================
-- La Primada — Esquema Supabase (Opción C: híbrido relacional + JSONB)
-- Plano: CLAUDE.md › "Arquitectura de backend — Supabase (CONFIRMADA)"
-- Ejecutar en: Supabase → SQL Editor (proyecto la-primada).
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

-- ------------------------------------------------------------
-- 0. profiles — rol por usuario (admin sembrado a mano)
--    El admin se designa por email; aquí guardamos su rol.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text,
  role    text not null default 'miembro' check (role in ('admin','miembro')),
  created_at timestamptz not null default now()
);

-- Helper: ¿el usuario actual es admin? (SECURITY DEFINER evita recursión de RLS)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

-- Alta automática de profile al crear usuario (rol 'miembro' por defecto).
-- El admin se promueve luego a mano (ver README).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, role)
  values (new.id, new.email, 'miembro')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 1. settings — singleton global (cover vigente + productos por defecto)
--    Una sola fila id='singleton'; el resto en jsonb.
-- ------------------------------------------------------------
create table if not exists public.settings (
  id   text primary key default 'singleton' check (id = 'singleton'),
  data jsonb not null default '{}'::jsonb,   -- { cover:{ahorrador,invitado}, defaultProducts:[...] }
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. personas — directorio relacional (mutable; sede de la INVARIANTE #1)
--    IDs de texto actuales del modelo ('per…'), sin migrar a uuid.
-- ------------------------------------------------------------
create table if not exists public.personas (
  id     text primary key,                       -- Util.uid('per')
  nombre text not null,
  estado text not null default 'ahorrador' check (estado in ('ahorrador','invitado')),
  breb   text,                                   -- llave Bre-B (NO sensible: es para recibir)
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. primadas — columnas indexables + data jsonb con los snapshots congelados
--    data = { pago:{breB}, cover:{...}, productos:[...], asistencias:[...] }
--    Las columnas espejean campos del modelo para poder filtrar/ordenar por SQL.
-- ------------------------------------------------------------
create table if not exists public.primadas (
  id                       text primary key,     -- Util.uid('prm')
  nombre                   text not null,
  fecha                    date not null,        -- 'YYYY-MM-DD'
  mes_contable             text not null,        -- 'YYYY-MM'
  organizador_principal_id text references public.personas(id) on delete set null,
  estado                   text not null default 'abierta' check (estado in ('abierta','cerrada')),
  data                     jsonb not null default '{}'::jsonb,
  updated_at               timestamptz not null default now()
);

create index if not exists primadas_fecha_idx        on public.primadas (fecha desc);
create index if not exists primadas_mes_contable_idx on public.primadas (mes_contable);
create index if not exists primadas_estado_idx       on public.primadas (estado);

-- ============================================================
-- RLS — frontera real de seguridad
--   · Datos de primadas (personas, primadas): lectura+escritura TODOS los autenticados.
--   · settings + personas: el directorio/ajustes los controla ADEMÁS el admin.
--     Decisión (CLAUDE.md): SELECT para todos; INSERT/UPDATE/DELETE de personas y settings
--     SOLO admin (control adicional). primadas: escritura para todos los autenticados.
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.settings  enable row level security;
alter table public.personas  enable row level security;
alter table public.primadas  enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select to authenticated using (true);          -- todos ven los roles (transparencia)

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- settings (control ADICIONAL del admin) ----------
drop policy if exists settings_select_all on public.settings;
create policy settings_select_all on public.settings
  for select to authenticated using (true);

drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- personas (directorio) ----------
-- SELECT: todos. INSERT: todos (en plena primada cualquiera agrega una persona nueva).
-- UPDATE/DELETE: SOLO admin (cambiar estado ahorrador↔invitado o borrar = control del admin).
drop policy if exists personas_select_all on public.personas;
create policy personas_select_all on public.personas
  for select to authenticated using (true);

drop policy if exists personas_insert_all on public.personas;
create policy personas_insert_all on public.personas
  for insert to authenticated with check (true);

drop policy if exists personas_update_admin on public.personas;
create policy personas_update_admin on public.personas
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists personas_delete_admin on public.personas;
create policy personas_delete_admin on public.personas
  for delete to authenticated using (public.is_admin());

-- ---------- primadas (datos de evento: lectura+escritura TODOS) ----------
drop policy if exists primadas_select_all on public.primadas;
create policy primadas_select_all on public.primadas
  for select to authenticated using (true);

drop policy if exists primadas_write_all on public.primadas;
create policy primadas_write_all on public.primadas
  for all to authenticated using (true) with check (true);

-- ============================================================
-- Realtime (opcional, fase 2): publicar cambios para verlos en vivo.
-- ============================================================
-- alter publication supabase_realtime add table public.primadas, public.personas, public.settings;
