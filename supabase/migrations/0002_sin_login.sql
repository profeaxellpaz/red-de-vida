-- Quitar el requisito de inicio de sesión: ahora cualquiera con el link
-- de la app puede leer y escribir los datos (ya no hay clave compartida).
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run.

drop policy if exists "acceso autenticado" on colaboradores;
drop policy if exists "acceso autenticado" on eventos;
drop policy if exists "acceso autenticado" on registros;
drop policy if exists "acceso autenticado" on config;

create policy "acceso publico" on colaboradores for all to anon using (true) with check (true);
create policy "acceso publico" on eventos        for all to anon using (true) with check (true);
create policy "acceso publico" on registros      for all to anon using (true) with check (true);
create policy "acceso publico" on config         for all to anon using (true) with check (true);
