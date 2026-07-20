-- ============================================================================
-- PitaIA — amostra de Row Level Security (RLS)
--
-- Generalizado a partir do schema real para fins de portfólio: nomes de
-- coluna específicos do domínio (ciclo menstrual, exames) foram omitidos,
-- mas a estrutura de autorização abaixo é a mesma usada em produção.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Problema: como decidir, dentro do próprio Postgres, se o usuário autenticado
-- pode ler a linha de "checkins" de OUTRO usuário?
--
-- Regra de negócio: um profissional (trainer/psicólogo) só pode ler os
-- check-ins de um paciente se existir um vínculo ativo entre os dois.
-- ----------------------------------------------------------------------------

create table if not exists public.professional_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id),
  professional_id uuid not null references auth.users(id),
  status text not null check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Por que uma função SECURITY DEFINER em vez de checar direto na policy?
--
-- Se a policy da tabela `checkins` consultasse `professional_links`
-- diretamente, e `professional_links` também tivesse RLS habilitado, o
-- Postgres precisaria avaliar a RLS de `professional_links` para avaliar a
-- RLS de `checkins` — o que pode entrar em recursão dependendo de como as
-- duas se referenciam. Uma função `SECURITY DEFINER` roda com os
-- privilégios de quem a criou (não do usuário chamador), então ela lê
-- `professional_links` sem reavaliar RLS — quebrando o ciclo. Esse é o
-- padrão recomendado pela documentação do Supabase para RLS que depende de
-- outra tabela.
-- ----------------------------------------------------------------------------
create or replace function public.is_professional_of(target_patient_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.professional_links
    where patient_id = target_patient_id
      and professional_id = auth.uid()
      and status = 'active'
  );
$$;

alter table public.checkins enable row level security;

-- O próprio usuário sempre pode ler/escrever seus dados.
create policy "patients read own checkins"
  on public.checkins for select
  using (user_id = auth.uid());

-- Um profissional vinculado pode LER (nunca escrever) check-ins do paciente.
create policy "linked professionals read patient checkins"
  on public.checkins for select
  using (public.is_professional_of(user_id));

-- ----------------------------------------------------------------------------
-- Isolamento adicional: o diário pessoal usa a MESMA função de vínculo para
-- outras tabelas, mas aqui a política de leitura para profissionais foi
-- deliberadamente OMITIDA — é uma decisão de produto (privacidade por
-- padrão), não um esquecimento. Só existe a policy do próprio dono.
-- ----------------------------------------------------------------------------
alter table public.diary_entries enable row level security;

create policy "users manage own diary"
  on public.diary_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Nota: a ausência de uma segunda policy de SELECT para profissionais é o
-- ponto central deste arquivo — em RLS, "não conceder" é o padrão seguro;
-- não é preciso negar explicitamente.
