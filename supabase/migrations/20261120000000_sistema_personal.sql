-- Gestión de Personal · rediseño
-- Apellido y nombre separados, datos de contacto, solicitudes por horas y "última modificación" en todo.
-- Requiere haber corrido antes 20261119000000_gestion_personal.sql. Se puede correr más de una vez.

alter table employees add column if not exists first_name text not null default '';
alter table employees add column if not exists last_name  text not null default '';
alter table employees add column if not exists phone      text not null default '';
alter table employees add column if not exists email      text not null default '';
alter table employees add column if not exists notes      text not null default '';
alter table employees add column if not exists updated_at bigint;   -- milisegundos
alter table employees add column if not exists updated_by text not null default '';

-- Solicitudes (tabla leaves): permisos por horas y fechas de alta/modificación.
alter table leaves add column if not exists start_time text not null default '';
alter table leaves add column if not exists end_time   text not null default '';
alter table leaves add column if not exists created_at bigint;
alter table leaves add column if not exists updated_at bigint;
alter table leaves add column if not exists updated_by text not null default '';

alter table schedules  add column if not exists updated_at bigint;
alter table schedules  add column if not exists updated_by text not null default '';
alter table vac_groups add column if not exists updated_at bigint;
alter table vac_groups add column if not exists updated_by text not null default '';
