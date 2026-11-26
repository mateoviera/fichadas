-- Gestión de Personal · tareas y recordatorios + turno cortado en rotativos.
-- Requiere haber corrido antes las migraciones anteriores. Se puede correr más de una vez.

-- Tareas y recordatorios (propios o de una persona: legajo vacío = tarea propia).
create table if not exists tasks (
  id         text primary key,
  legajo     text not null default '',
  text       text not null default '',
  due        date,
  note       text not null default '',
  done       boolean not null default false,
  done_at    bigint,   -- milisegundos
  created_at bigint,
  updated_at bigint,
  updated_by text not null default ''
);
create index if not exists tasks_legajo_idx on tasks (legajo);

alter table tasks enable row level security;
drop policy if exists "usuarios autenticados" on tasks;
create policy "usuarios autenticados" on tasks for all to authenticated using (true) with check (true);
revoke all on tasks from anon;
grant select, insert, update, delete on tasks to authenticated;

-- Rotativo con turno cortado: los tramos del día forman un solo turno (ej. 4 h + 4 h = 8 h).
alter table schedules add column if not exists split boolean not null default false;
