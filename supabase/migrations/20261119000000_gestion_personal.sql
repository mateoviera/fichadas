-- Control de Fichadas · Gestión del personal
-- Legajo ampliado (ingreso, egreso, DNI, CUIL, puesto), grupos de vacaciones y estado de las licencias.
-- Pegar en Supabase → SQL Editor → Run (o `supabase db push`). Se puede correr más de una vez.

alter table employees add column if not exists position   text not null default '';
alter table employees add column if not exists hire_date  text;          -- 'YYYY-MM-DD'
alter table employees add column if not exists exit_date  text;          -- 'YYYY-MM-DD' (baja)
alter table employees add column if not exists birth_date text;          -- 'YYYY-MM-DD'
alter table employees add column if not exists dni        text not null default '';
alter table employees add column if not exists cuil       text not null default '';
alter table employees add column if not exists vac_group  text not null default '';

-- Licencias: 'aprobada' | 'pendiente' | 'rechazada'. Solo las aprobadas cuentan en el control de fichadas.
-- exception = aprobada como excepción aunque se superponga con otra del mismo grupo.
alter table leaves add column if not exists status    text not null default 'aprobada';
alter table leaves add column if not exists exception boolean not null default false;
alter table leaves add column if not exists note      text not null default '';

-- Grupos de vacaciones: max_concurrent = cuántas personas del grupo pueden estar de vacaciones a la vez
-- (0 = sin control). Si se superponen de más, tiene prioridad la de mayor antigüedad.
create table if not exists vac_groups (
  id              text primary key,
  name            text not null default '',
  max_concurrent  integer not null default 1,
  note            text not null default ''
);

alter table vac_groups enable row level security;
drop policy if exists "usuarios autenticados" on vac_groups;
create policy "usuarios autenticados" on vac_groups for all to authenticated using (true) with check (true);
revoke all on vac_groups from anon;
grant select, insert, update, delete on vac_groups to authenticated;
