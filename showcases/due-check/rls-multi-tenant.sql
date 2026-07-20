-- ============================================================================
-- Due Check — amostra de multi-tenancy via Row Level Security
--
-- Generalizado a partir do schema real: nomes de tabela e regras específicas
-- de negócio foram simplificados, mas o mecanismo de isolamento por
-- organização é o mesmo usado em produção.
-- ============================================================================

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'admin', 'analyst', 'viewer')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- is_org_member(): função central de autorização multi-tenant.
--
-- Por que SECURITY DEFINER? Se a policy de `risk_dossiers` consultasse
-- `organization_members` diretamente, e essa também tivesse RLS habilitado,
-- o Postgres avaliaria a RLS de uma tabela para avaliar a RLS da outra —
-- risco de recursão dependendo de como as duas se referenciam. Rodando com
-- privilégio do dono da função, a checagem de vínculo organizacional não
-- reavalia RLS, quebrando o ciclo.
-- ----------------------------------------------------------------------------
create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members
    where org_id = target_org_id
      and user_id = auth.uid()
  );
$$;

-- Variante para ações que exigem privilégio elevado (ex.: restaurar um
-- dossiê excluído, editar configuração da matriz de risco).
create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members
    where org_id = target_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create table if not exists public.risk_dossiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  counterparty_name text not null,
  score numeric,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

alter table public.risk_dossiers enable row level security;

create policy "org members read own org dossiers"
  on public.risk_dossiers for select
  using (public.is_org_member(org_id));

create policy "org members create dossiers"
  on public.risk_dossiers for insert
  with check (public.is_org_member(org_id));

-- Exclusão é sempre soft-delete (ver aplicação) e restauração exige papel
-- elevado, checado tanto aqui quanto de novo na função da aplicação — defesa
-- em profundidade: mesmo que a policy de RLS tivesse um bug, a segunda
-- checagem na aplicação ainda bloqueia a ação indevida.
create policy "org admins restore dossiers"
  on public.risk_dossiers for update
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));
