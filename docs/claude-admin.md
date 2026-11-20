# Cargar sitios desde Claude

Álvaro administra Chinchetas hablando con Claude (con el conector de Supabase). Su mujer y quien tenga el enlace solo ven la web.

## Datos

- Proyecto Supabase: `tablero-equipo` (id `xefnuudfxyisaogadnmp`)
- Tabla: `public.rs_sitios`
- Claude escribe con `execute_sql` (rol de servicio, no necesita la clave de edición de la web).

| Columna | Valores |
|---|---|
| `nombre` | texto (obligatorio) |
| `categoria` | `restaurante`, `tapas`, `cafe`, `dulce`, `copas`, `plan`, `tienda`, `otro` |
| `estado` | `pendiente` (por defecto) o `probado` |
| `favorito` | boolean |
| `lat`, `lng` | coordenadas del local (obligatorias) |
| `direccion`, `zona` | dirección completa; barrio o municipio |
| `gmaps_url`, `web`, `telefono`, `instagram` | opcionales |
| `precio` | 1 a 4 (€ a €€€€) |
| `cocina` | `text[]`, p. ej. `{Española,Arroces}` |
| `para` | `text[]` con `pareja`, `familia`, `ninos`, `amigos`, `trabajo`, `perro` |
| `recomendado_por`, `que_pedir`, `notas` | texto |
| `fotos` | `text[]` con URLs de imágenes públicas (web del local, prensa…); la primera es la miniatura |
| `nota` | 0 a 10 (solo si `probado`), `visitado` fecha |

## Cómo añadir un sitio

1. Identificar el local exacto (nombre + municipio). Si Álvaro pega un enlace de Google Maps, sacar nombre y coordenadas de él (`!3d<lat>!4d<lng>` o `@lat,lng`).
2. Si faltan coordenadas o dirección, buscarlas en la web (ficha oficial, Google Maps, TheFork…). No inventar coordenadas: si no se encuentran con precisión, preguntar.
3. Comprobar duplicados: `select id, nombre from rs_sitios where unaccent(lower(nombre)) like ...` o comparar por nombre y cercanía.
4. Insertar:

```sql
insert into public.rs_sitios (nombre, categoria, lat, lng, direccion, zona, precio, cocina, para, recomendado_por, que_pedir, notas, gmaps_url, web, telefono)
values ('Casa Dani', 'restaurante', 40.4245, -3.6795, 'Calle de Ayala, 28, 28001 Madrid', 'Salamanca', 2,
        '{Española}', '{amigos}', 'Marta', 'La tortilla', null, null, 'https://casadani.es', null)
returning id, nombre;
```

5. Confirmar a Álvaro qué se ha guardado (nombre, dirección, quién lo recomendó) en una o dos líneas.

Para marcar como probado: `update rs_sitios set estado='probado', nota=8.5, visitado=current_date, actualizado=now() where id=...`.
