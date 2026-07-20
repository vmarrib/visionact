-- ============================================================================
-- Ponto Inteligente — amostra de RLS + auditoria de biometria
--
-- Generalizado a partir do schema real: nomes de local/cliente e o limiar de
-- similaridade configurado em produção foram substituídos por exemplos.
-- ============================================================================

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('admin', 'employee')),
  primary key (user_id, role)
);

-- ----------------------------------------------------------------------------
-- has_role(): mesma razão de existir das funções SECURITY DEFINER dos
-- outros dois projetos — evitar que a policy de uma tabela precise reavaliar
-- a RLS de `user_roles` para decidir se o usuário é admin.
-- ----------------------------------------------------------------------------
create or replace function public.has_role(target_role text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = target_role
  );
$$;

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references auth.users(id),
  clocked_at timestamptz not null default now(),
  location_id uuid,
  selfie_url text,
  latitude double precision,
  longitude double precision
);

alter table public.time_entries enable row level security;

create policy "employees read own entries"
  on public.time_entries for select
  using (employee_id = auth.uid());

create policy "admins read all entries"
  on public.time_entries for select
  using (public.has_role('admin'));

-- ----------------------------------------------------------------------------
-- face_match_attempts: auditoria de TODA tentativa de verificação facial,
-- aprovada ou não — decisão de tratar biometria como algo investigável, não
-- como um sim/não descartado assim que a decisão é tomada.
-- ----------------------------------------------------------------------------
create table if not exists public.face_match_attempts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references auth.users(id),
  attempted_at timestamptz not null default now(),
  similarity numeric not null,
  approved boolean not null,
  reason text
);

alter table public.face_match_attempts enable row level security;

create policy "admins read match attempts"
  on public.face_match_attempts for select
  using (public.has_role('admin'));

-- Só o backend (via service role, fora da RLS) grava tentativas — nenhum
-- usuário final tem policy de INSERT aqui, de propósito: o registro de
-- auditoria não pode ser algo que o próprio cliente possa manipular.
