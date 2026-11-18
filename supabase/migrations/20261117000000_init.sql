-- Control de Fichadas · esquema inicial
-- Sirve igual para Supabase en la nube (SQL Editor o `supabase db push`)
-- y para Supabase local (`npx supabase start` lo aplica solo).
--
-- Seguridad: solo usuarios con sesión iniciada pueden leer y escribir.
-- Los usuarios se crean a mano desde el panel (Authentication → Users);
-- conviene desactivar el registro público ("Allow new users to sign up").

create table if not exists establishments (
  id        text primary key,
  name      text not null default '',
  device    text not null default '',
  format    text not null default '',
  firmware  text not null default ''
);

create table if not exists files (
  id         text primary key,
  est_id     text not null,
  name       text not null default '',
  loaded_at  bigint,
  count      integer not null default 0,
  total      integer not null default 0,
  date_from  text,
  date_to    text,
  format     text not null default ''
);

-- Una fila por fichada. id = "establecimiento|legajo|timestamp" para las importadas
-- (así recargar el mismo TXT no duplica) o un id propio para las manuales.
create table if not exists punches (
  id       text primary key,
  est_id   text not null,
  legajo   text not null,
  ts       bigint not null,            -- segundos, hora local del reloj
  file_id  text not null,              -- id del archivo o 'manual'
  note     text
);
create index if not exists punches_legajo_ts on punches (legajo, ts);
create index if not exists punches_ts on punches (ts);
create index if not exists punches_file on punches (file_id);

create table if not exists employees (
  legajo       text primary key,
  name         text not null default '',
  sector       text not null default '',
  schedule_id  text not null default ''
);

create table if not exists schedules (
  id      text primary key,
  name    text not null default '',
  type    text not null default 'fijo',  -- 'fijo' | 'rotativo'
  blocks  jsonb not null default '[]',
  v       text not null default ''
);

create table if not exists holidays (
  date  text primary key,                -- 'YYYY-MM-DD'
  name  text not null default ''
);

create table if not exists leaves (
  id         text primary key,
  legajo     text not null,
  date_from  text not null,
  date_to    text not null,
  type       text not null default ''
);

create table if not exists settings (
  id    integer primary key default 1 check (id = 1),
  data  jsonb not null default '{}'
);

-- Permisos: RLS activado y acceso completo solo para usuarios autenticados.
do $$
declare t text;
begin
  foreach t in array array['establishments','files','punches','employees','schedules','holidays','leaves','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "usuarios autenticados" on %I', t);
    execute format('create policy "usuarios autenticados" on %I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- Datos iniciales: los mismos horarios de ejemplo que trae la app.
insert into schedules (id, name, type, blocks) values
  ('enf-rot', 'Enfermería · rotativo 8 h', 'rotativo',
   '[{"start":"06:00","end":"14:00","est":""},{"start":"14:00","end":"22:00","est":""},{"start":"22:00","end":"06:00","est":""}]'),
  ('adm-lv', 'Lunes a viernes 08–16', 'fijo',
   '[{"days":[1,2,3,4,5],"start":"08:00","end":"16:00","est":""}]')
on conflict (id) do nothing;

insert into settings (id, data) values (1, '{}') on conflict (id) do nothing;
