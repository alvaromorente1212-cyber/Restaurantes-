# Chinchetas

Los sitios que me recomiendan, en un mapa: restaurantes, bares, cafés, dulces, planes… Pensada para el móvil y para consultarla estando en la calle.

## Qué hace

- **Mapa** a pantalla completa con chinchetas por tipo de sitio. Anillo amarillo = pendiente; sello verde con la nota = ya probado; ❤️ = favorito.
- **Panel deslizante** con la lista ordenable por cercanía, recientes, nota o nombre, y botón *Sorpréndeme* (elige un pendiente, mejor si está cerca).
- **Filtros**: pendientes/probados/favoritos, tipo de sitio, con quién ir (pareja, familia, niños, amigos, trabajo, perro) y precio. Buscador por nombre, zona, cocina, plato o quién lo recomendó.
- **Ficha**: cómo llegar, abrir en Google Maps, llamar, compartir, qué pedir, quién lo recomendó, notas y contacto.
- **Añadir sitio** (solo administrador):
  - buscar por nombre o dirección (OpenStreetMap / Photon; sugiere tipo y cocina),
  - pegar un enlace de Google Maps, también los cortos `maps.app.goo.gl` (los resuelve la Edge Function `rs-gmaps`),
  - *Estoy aquí* (ubicación actual) o *Elegir en el mapa*,
  - mini mapa para arrastrar la chincheta y afinar.
- **Desde Claude**: con el conector de Supabase, basta con decirle "añade el restaurante X que me recomendó Y". Ver `docs/claude-admin.md`.

## Quién puede editar

- La web es **de consulta** para cualquiera con el enlace (no se ven botones de edición).
- Para administrar desde un dispositivo: abrir `…/?admin` una vez e introducir la clave de edición. Se queda guardada en ese navegador (Ajustes → Salir del modo edición para quitarla).
- Toda escritura pasa por funciones `rs_*` de Supabase que comprueban la clave (guardada con bcrypt en `rs_config`, que no es legible desde la web).

## Piezas

| Pieza | Dónde |
|---|---|
| Web estática | GitHub Pages (`index.html`, `app.js`, `styles.css`) |
| Datos | Supabase `tablero-equipo`: tabla `rs_sitios`, `rs_config` y funciones `rs_*` (`supabase/schema.sql`) |
| Enlaces de Google Maps | Edge Function `rs-gmaps` (`supabase/functions/rs-gmaps`) |
| Mapa | Leaflet 1.9.4 + teselas CARTO Voyager (datos © OpenStreetMap) |
| Búsqueda de sitios | Photon (komoot), gratis y sin clave |

Se puede instalar en el iPhone: Safari → Compartir → *Añadir a pantalla de inicio*.
