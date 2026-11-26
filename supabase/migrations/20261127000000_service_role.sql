-- Permisos para la clave secreta (service_role / sb_secret_): la usa la función programada de
-- recordatorios por email (api/recordatorios.js), que lee la base sin iniciar sesión.
-- Se puede correr más de una vez.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
