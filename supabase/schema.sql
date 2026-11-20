-- Chinchetas · esquema en Supabase (proyecto tablero-equipo)
-- Lectura pública; escritura solo mediante funciones que comprueban la clave de edición.

create table if not exists public.rs_sitios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 120),
  categoria text not null default 'restaurante',
  estado text not null default 'pendiente' check (estado in ('pendiente','probado')),
  favorito boolean not null default false,
  lat double precision not null,
  lng double precision not null,
  direccion text,
  zona text,
  gmaps_url text,
  web text,
  telefono text,
  instagram text,
  precio smallint check (precio between 1 and 4),
  cocina text[] not null default '{}',
  para text[] not null default '{}',
  recomendado_por text,
  que_pedir text,
  notas text,
  fotos text[] not null default '{}',
  nota numeric(3,1) check (nota between 0 and 10),
  visitado date,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.rs_sitios enable row level security;
drop policy if exists rs_sitios_lectura on public.rs_sitios;
create policy rs_sitios_lectura on public.rs_sitios for select to anon, authenticated using (true);
revoke insert, update, delete on public.rs_sitios from anon, authenticated;

create table if not exists public.rs_config (
  id int primary key default 1 check (id = 1),
  clave_hash text not null
);
alter table public.rs_config enable row level security;
revoke all on public.rs_config from anon, authenticated;

create or replace function public.rs_clave_ok(p_clave text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select clave_hash into h from public.rs_config where id = 1;
  if h is null or p_clave is null then return false; end if;
  if extensions.crypt(p_clave, h) = h then return true; end if;
  perform pg_sleep(0.6); -- frena intentos por fuerza bruta
  return false;
end $$;

create or replace function public.rs_comprobar_clave(p_clave text) returns boolean
language sql security definer set search_path = public as $$ select public.rs_clave_ok(p_clave) $$;

create or replace function public.rs_guardar_sitio(p_clave text, p_sitio jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.rs_clave_ok(p_clave) then raise exception 'clave_incorrecta' using errcode = '28000'; end if;
  v_id := nullif(p_sitio->>'id','')::uuid;
  if v_id is null then
    insert into public.rs_sitios (nombre, categoria, estado, favorito, lat, lng, direccion, zona, gmaps_url, web, telefono, instagram,
      precio, cocina, para, recomendado_por, que_pedir, notas, fotos, nota, visitado)
    values (p_sitio->>'nombre', coalesce(p_sitio->>'categoria','restaurante'), coalesce(p_sitio->>'estado','pendiente'),
      coalesce((p_sitio->>'favorito')::boolean,false), (p_sitio->>'lat')::float8, (p_sitio->>'lng')::float8,
      p_sitio->>'direccion', p_sitio->>'zona', p_sitio->>'gmaps_url', p_sitio->>'web', p_sitio->>'telefono', p_sitio->>'instagram',
      (p_sitio->>'precio')::smallint,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_sitio->'cocina','[]'::jsonb))),'{}'),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_sitio->'para','[]'::jsonb))),'{}'),
      p_sitio->>'recomendado_por', p_sitio->>'que_pedir', p_sitio->>'notas',
      coalesce(array(select jsonb_array_elements_text(coalesce(p_sitio->'fotos','[]'::jsonb))),'{}'),
      (p_sitio->>'nota')::numeric, (p_sitio->>'visitado')::date)
    returning id into v_id;
  else
    update public.rs_sitios set
      nombre = p_sitio->>'nombre', categoria = coalesce(p_sitio->>'categoria','restaurante'), estado = coalesce(p_sitio->>'estado','pendiente'),
      favorito = coalesce((p_sitio->>'favorito')::boolean,false), lat = (p_sitio->>'lat')::float8, lng = (p_sitio->>'lng')::float8,
      direccion = p_sitio->>'direccion', zona = p_sitio->>'zona', gmaps_url = p_sitio->>'gmaps_url', web = p_sitio->>'web',
      telefono = p_sitio->>'telefono', instagram = p_sitio->>'instagram', precio = (p_sitio->>'precio')::smallint,
      cocina = coalesce(array(select jsonb_array_elements_text(coalesce(p_sitio->'cocina','[]'::jsonb))),'{}'),
      para = coalesce(array(select jsonb_array_elements_text(coalesce(p_sitio->'para','[]'::jsonb))),'{}'),
      recomendado_por = p_sitio->>'recomendado_por', que_pedir = p_sitio->>'que_pedir', notas = p_sitio->>'notas',
      fotos = coalesce(array(select jsonb_array_elements_text(coalesce(p_sitio->'fotos','[]'::jsonb))),'{}'),
      nota = (p_sitio->>'nota')::numeric, visitado = (p_sitio->>'visitado')::date, actualizado = now()
    where id = v_id;
    if not found then raise exception 'no_existe'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.rs_borrar_sitio(p_clave text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.rs_clave_ok(p_clave) then raise exception 'clave_incorrecta' using errcode = '28000'; end if;
  delete from public.rs_sitios where id = p_id;
  return found;
end $$;

create or replace function public.rs_cambiar_clave(p_clave text, p_nueva text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.rs_clave_ok(p_clave) then raise exception 'clave_incorrecta' using errcode = '28000'; end if;
  if char_length(coalesce(p_nueva,'')) < 6 then raise exception 'clave_corta'; end if;
  update public.rs_config set clave_hash = extensions.crypt(p_nueva, extensions.gen_salt('bf')) where id = 1;
  return true;
end $$;

revoke execute on function public.rs_clave_ok(text) from public, anon, authenticated;
grant execute on function public.rs_comprobar_clave(text), public.rs_guardar_sitio(text, jsonb),
  public.rs_borrar_sitio(text, uuid), public.rs_cambiar_clave(text, text) to anon, authenticated;

-- Clave inicial (cámbiala desde la app: Ajustes → Cambiar clave)
-- insert into public.rs_config (id, clave_hash) values (1, extensions.crypt('TU-CLAVE', extensions.gen_salt('bf')))
--   on conflict (id) do nothing;
