// Edge Function rs-gmaps: recibe un enlace de Google Maps (también los cortos maps.app.goo.gl),
// sigue las redirecciones y devuelve nombre + coordenadas del sitio.
// Solo acepta dominios de Google para no servir de proxy abierto.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.|maps\.)?google\.[a-z.]{2,6})$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function parse(u: string) {
  const out: { nombre?: string; lat?: number; lng?: number } = {};
  const dec = (s: string) => decodeURIComponent(s.replace(/\+/g, " ")).trim();
  const place = u.match(/\/maps\/place\/([^/@?]+)/);
  if (place) out.nombre = dec(place[1]);
  // !3d!4d = coordenadas exactas del sitio (preferentes frente a @ que es el centro de la vista)
  const pin = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const at = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const ll = u.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  const m = pin || ll || at;
  if (m) { out.lat = parseFloat(m[1]); out.lng = parseFloat(m[2]); }
  if (!out.nombre) {
    const q = u.match(/[?&](?:q|query)=([^&]+)/);
    if (q && !/^-?\d+\.\d+,/.test(dec(q[1]))) out.nombre = dec(q[1]);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { url } = await req.json();
    let current = new URL(String(url || "").trim());
    if (!HOSTS.test(current.hostname)) return json({ error: "Solo se aceptan enlaces de Google Maps" }, 400);

    for (let i = 0; i < 6; i++) {
      const res = await fetch(current.toString(), {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "Accept-Language": "es-ES,es" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, current);
        // La página de consentimiento lleva la URL real en ?continue=
        const cont = next.searchParams.get("continue");
        current = cont ? new URL(cont) : next;
        if (!HOSTS.test(current.hostname) && !/consent\.google\./.test(current.hostname)) break;
        continue;
      }
      // Sin más redirecciones: buscamos coordenadas también en el HTML por si la URL no las lleva
      const data = parse(current.toString());
      if ((data.lat === undefined) && res.ok) {
        const html = (await res.text()).slice(0, 400000);
        const m = html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || html.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/);
        if (m) { data.lat = parseFloat(m[1]); data.lng = parseFloat(m[2]); }
      }
      return json({ ...data, url: current.toString() });
    }
    return json({ ...parse(current.toString()), url: current.toString() });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 400);
  }
});
