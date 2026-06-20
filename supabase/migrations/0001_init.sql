-- Red de Vida — Esquema inicial (datos de asistencia en la nube)
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run.

create table if not exists colaboradores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cedula text,
  puesto text,
  activo boolean default true,
  created_at timestamptz default now()
);

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fecha date not null,
  hora_entrada text,
  hora_salida text,
  tolerancia int default 10,
  notas text,
  created_at timestamptz default now()
);

create table if not exists registros (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid references eventos(id) on delete cascade,
  colaborador_id uuid references colaboradores(id) on delete cascade,
  entrada text,
  salida text,
  minutos_tarde int default 0,
  tarde boolean default false,
  ausente boolean default false,
  justificada boolean default false,
  motivo text,
  updated_at timestamptz default now(),
  unique (evento_id, colaborador_id)
);

create table if not exists config (
  clave text primary key,
  valor text
);

-- Seguridad: solo usuarios autenticados (la clave compartida) acceden a los datos.
alter table colaboradores enable row level security;
alter table eventos        enable row level security;
alter table registros      enable row level security;
alter table config         enable row level security;

create policy "acceso autenticado" on colaboradores for all to authenticated using (true) with check (true);
create policy "acceso autenticado" on eventos        for all to authenticated using (true) with check (true);
create policy "acceso autenticado" on registros      for all to authenticated using (true) with check (true);
create policy "acceso autenticado" on config         for all to authenticated using (true) with check (true);
