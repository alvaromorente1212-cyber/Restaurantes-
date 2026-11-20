(() => {
  "use strict";

  const CFG = window.RS_CONFIG;
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /* ------------------------------------------------------------------ */
  /* Catálogos                                                           */
  /* ------------------------------------------------------------------ */
  const CATS = [
    { id: "restaurante", label: "Restaurantes", one: "Restaurante", em: "🍽️", color: "#E4572E" },
    { id: "tapas", label: "Bares y tapas", one: "Bar y tapas", em: "🍷", color: "#8E2C48" },
    { id: "cafe", label: "Café y brunch", one: "Café y brunch", em: "☕", color: "#8B5E3C" },
    { id: "dulce", label: "Dulces", one: "Dulces", em: "🍰", color: "#D9468F" },
    { id: "copas", label: "Copas", one: "Copas", em: "🍸", color: "#3B4CCA" },
    { id: "plan", label: "Planes", one: "Plan", em: "🎟️", color: "#0E8F9A" },
    { id: "tienda", label: "Tiendas", one: "Tienda", em: "🛍️", color: "#6D8A1F" },
    { id: "otro", label: "Otros", one: "Otro", em: "📍", color: "#5A6178" },
  ];
  const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const catOf = (id) => CAT[id] || CAT.otro;

  const PARA = [
    { id: "pareja", label: "Pareja", em: "💑" },
    { id: "familia", label: "Familia", em: "👨‍👩‍👦" },
    { id: "ninos", label: "Con niños", em: "🧒" },
    { id: "amigos", label: "Amigos", em: "🍻" },
    { id: "trabajo", label: "Trabajo", em: "💼" },
    { id: "perro", label: "Con perro", em: "🐕" },
  ];
  const PARA_BY = Object.fromEntries(PARA.map((p) => [p.id, p]));

  const COCINAS = ["Española", "Tapas", "Arroces", "Asador", "Marisco", "Mediterránea", "Italiana", "Pizza", "Japonesa", "Asiática",
    "Mexicana", "Peruana", "India", "Hamburguesas", "Vegetariana", "Brunch", "Postres", "Cócteles"];

  const PRICE = ["€", "€€", "€€€", "€€€€"];

  /* ------------------------------------------------------------------ */
  /* Estado                                                              */
  /* ------------------------------------------------------------------ */
  const S = {
    sitios: store.get("rs_cache", []),
    estado: "todos",          // todos | pendiente | probado | fav
    cats: new Set(),
    para: new Set(),
    precio: new Set(),
    q: "",
    orden: store.get("rs_orden", "cerca"),
    me: null,
    clave: store.get("rs_clave", null),
    selId: null,
    snap: "peek",
    view: "list",
  };

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function km(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function fmtDist(d) {
    if (d == null) return "";
    if (d < 1) return `${Math.round(d * 1000 / 10) * 10} m`;
    if (d < 10) return `${d.toFixed(1).replace(".", ",")} km`;
    return `${Math.round(d)} km`;
  }
  const fmtNota = (n) => (n == null ? "" : (Math.round(n * 10) / 10).toString().replace(".", ","));
  const initials = (s) => norm(s).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  const ref = () => S.me || map.getCenter() && { lat: map.getCenter().lat, lng: map.getCenter().lng };
  const distTo = (s) => (S.me ? km(S.me, s) : null);

  function gmapsLink(s) {
    if (s.gmaps_url) return s.gmaps_url;
    const q = [s.nombre, s.direccion].filter(Boolean).join(", ") || `${s.lat},${s.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  const directionsLink = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
  const canEdit = () => !!S.clave;

  /* ------------------------------------------------------------------ */
  /* Mapa                                                                */
  /* ------------------------------------------------------------------ */
  const map = L.map("map", { zoomControl: false, attributionControl: true, tap: true })
    .setView([CFG.origen.lat, CFG.origen.lng], 12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 20, subdomains: "abcd",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 44, spiderfyOnMaxZoom: true,
    iconCreateFunction: (c) => L.divIcon({ html: `<div class="cluster">${c.getChildCount()}</div>`, className: "", iconSize: [46, 46] }),
  });
  map.addLayer(cluster);
  const markers = new Map();
  let meMarker = null;

  function pinHtml(s, sel) {
    const c = catOf(s.categoria);
    const pend = s.estado === "pendiente";
    const ring = pend ? `<circle cx="20" cy="20" r="18.5" fill="none" stroke="#F2A007" stroke-width="3"/>` : "";
    return `<div class="pin${sel ? " is-sel" : ""}">
      <svg viewBox="0 0 40 54" aria-hidden="true">
        <path d="M20 52 L20 34" stroke="#1B2238" stroke-width="3" stroke-linecap="round"/>
        <circle cx="20" cy="20" r="16" fill="${c.color}" stroke="#fff" stroke-width="3.5"/>${ring}
      </svg>
      <span class="pin-emoji">${c.em}</span>
      ${s.estado === "probado" && s.nota != null ? `<span class="pin-note">${fmtNota(s.nota)}</span>` : ""}
      ${s.favorito ? `<span class="pin-fav">❤️</span>` : ""}
    </div>`;
  }
  const pinIcon = (s, sel) => L.divIcon({ html: pinHtml(s, sel), className: "", iconSize: [40, 54], iconAnchor: [20, 52] });

  function renderMarkers(list) {
    cluster.clearLayers();
    markers.clear();
    const ms = list.map((s) => {
      const m = L.marker([s.lat, s.lng], { icon: pinIcon(s, s.id === S.selId), title: s.nombre, riseOnHover: true });
      m.on("click", () => openDetail(s.id, { fly: false }));
      markers.set(s.id, m);
      return m;
    });
    cluster.addLayers(ms);
  }

  map.on("click", () => { if (S.view === "detail") closeDetail(); else setSnap("peek"); });

  /* ------------------------------------------------------------------ */
  /* Panel inferior (snap: peek / half / full)                           */
  /* ------------------------------------------------------------------ */
  const sheet = $("#sheet");
  const isDesktop = () => matchMedia("(min-width: 900px)").matches;
  function snapY(name) {
    const h = sheet.offsetHeight;
    const vh = window.innerHeight;
    if (name === "full") return 0;
    if (name === "half") return Math.max(0, h - vh * 0.52);
    return Math.max(0, h - 148);
  }
  function setSnap(name, { animate = true } = {}) {
    S.snap = name;
    if (!animate) sheet.classList.add("is-dragging");
    sheet.classList.toggle("snap-peek", name === "peek");
    const y = snapY(name);
    sheet.style.setProperty("--sheet-y", `${y}px`);
    const visible = sheet.offsetHeight - y;
    document.documentElement.style.setProperty("--fab-bottom", `${visible + 14}px`);
    document.documentElement.style.setProperty("--attr-offset", `${visible}px`);
    $("#mapFabs").classList.toggle("is-hidden", name === "full" && !isDesktop());
    if (!animate) requestAnimationFrame(() => sheet.classList.remove("is-dragging"));
  }
  (function dragSheet() {
    let startY = 0, startT = 0, baseY = 0, dragging = false, moved = false, scrollEl = $("#sheetScroll");
    const onDown = (e) => {
      if (isDesktop()) return;
      const fromHandle = e.target.closest(".sheet-handle, .list-head, .detail-top");
      const atTop = scrollEl.scrollTop <= 0;
      if (!fromHandle && !(atTop && S.snap !== "full") && !(atTop && S.snap === "full" && e.target.closest(".sheet-scroll"))) return;
      if (e.target.closest("button, a, input") && !fromHandle) return;
      dragging = true; moved = false;
      startY = e.clientY; startT = performance.now();
      baseY = snapY(S.snap);
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < 6) return;
      // En "full" con scroll interno, solo arrastramos hacia abajo
      if (S.snap === "full" && dy < 0 && !e.target.closest(".sheet-handle")) { dragging = false; return; }
      if (!moved) { moved = true; sheet.classList.add("is-dragging"); }
      e.preventDefault();
      const y = Math.min(snapY("peek"), Math.max(0, baseY + dy));
      sheet.style.setProperty("--sheet-y", `${y}px`);
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("is-dragging");
      if (!moved) {
        if (e.target.closest(".sheet-handle")) setSnap(S.snap === "peek" ? "half" : S.snap === "half" ? "full" : "half");
        return;
      }
      const dy = e.clientY - startY;
      const v = dy / Math.max(1, performance.now() - startT); // px/ms
      const y = baseY + dy;
      const points = ["full", "half", "peek"].map((n) => [n, snapY(n)]);
      let target;
      if (v < -0.5) target = S.snap === "peek" ? "half" : "full";
      else if (v > 0.5) target = S.snap === "full" ? "half" : "peek";
      else target = points.reduce((a, b) => (Math.abs(b[1] - y) < Math.abs(a[1] - y) ? b : a))[0];
      setSnap(target);
    };
    sheet.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  })();
  window.addEventListener("resize", () => setSnap(S.snap, { animate: false }));

  /* ------------------------------------------------------------------ */
  /* Filtros                                                             */
  /* ------------------------------------------------------------------ */
  function matches(s, { ignoreEstado = false, ignoreCats = false } = {}) {
    if (!ignoreEstado) {
      if (S.estado === "pendiente" && s.estado !== "pendiente") return false;
      if (S.estado === "probado" && s.estado !== "probado") return false;
      if (S.estado === "fav" && !s.favorito) return false;
    }
    if (!ignoreCats && S.cats.size && !S.cats.has(s.categoria)) return false;
    if (S.para.size && !(s.para || []).some((p) => S.para.has(p))) return false;
    if (S.precio.size && !S.precio.has(s.precio)) return false;
    if (S.q) {
      const hay = norm([s.nombre, s.zona, s.direccion, s.recomendado_por, s.que_pedir, s.notas, (s.cocina || []).join(" "), catOf(s.categoria).one].join(" "));
      if (!norm(S.q).split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }
  function filtered() {
    const list = S.sitios.filter((s) => matches(s));
    const by = {
      cerca: (a, b) => (distTo(a) ?? 1e9) - (distTo(b) ?? 1e9),
      recientes: (a, b) => (b.creado || "").localeCompare(a.creado || ""),
      nota: (a, b) => (b.nota ?? -1) - (a.nota ?? -1) || a.nombre.localeCompare(b.nombre),
      nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
    }[S.orden === "cerca" && !S.me ? "recientes" : S.orden];
    return list.sort(by);
  }

  function renderChips() {
    const base = S.sitios.filter((s) => matches(s, { ignoreEstado: true, ignoreCats: true }));
    const count = (fn) => base.filter(fn).length;
    const st = [
      ["todos", "Todos", "", base.length],
      ["pendiente", "Pendientes", "🕐", count((s) => s.estado === "pendiente")],
      ["probado", "Probados", "✓", count((s) => s.estado === "probado")],
      ["fav", "Favoritos", "❤️", count((s) => s.favorito)],
    ];
    const baseE = S.sitios.filter((s) => matches(s, { ignoreCats: true }));
    const catsPresent = CATS.filter((c) => S.sitios.some((s) => s.categoria === c.id));
    $("#chips").innerHTML =
      st.map(([id, label, em, n]) => `<button type="button" class="chip st-${id}" data-estado="${id}" aria-pressed="${S.estado === id}">${em ? `<span class="em">${em}</span>` : ""}${label}<span class="n">${n}</span></button>`).join("") +
      (catsPresent.length > 1 ? `<span class="chip-sep" aria-hidden="true"></span>` +
        catsPresent.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${S.cats.has(c.id)}"><span class="em">${c.em}</span>${c.label}<span class="n">${baseE.filter((s) => s.categoria === c.id).length}</span></button>`).join("") : "");
    const nAdv = S.para.size + S.precio.size;
    const b = $("#filtersCount");
    b.hidden = !nAdv; b.textContent = nAdv;
  }
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    if (b.dataset.estado) S.estado = b.dataset.estado;
    if (b.dataset.cat) { const c = b.dataset.cat; S.cats.has(c) ? S.cats.delete(c) : S.cats.add(c); }
    render({ fit: true });
  });
  let qT;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qT);
    qT = setTimeout(() => { S.q = e.target.value.trim(); render({ fit: !!S.q }); if (S.q && S.snap === "peek") setSnap("half"); }, 160);
  });
  $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });

  function openFilters() {
    const d = $("#filtersDialog");
    const draw = () => {
      $("#filtersBody").innerHTML = `
        <h2 id="filtersTitle">Filtros</h2>
        <p>Combínalos con los de arriba.</p>
        <p class="f-title">Para ir con</p>
        <div class="opts">${PARA.map((p) => `<button type="button" class="opt" data-para="${p.id}" aria-pressed="${S.para.has(p.id)}">${p.em} ${p.label}</button>`).join("")}</div>
        <p class="f-title">Precio</p>
        <div class="opts price">${PRICE.map((p, i) => `<button type="button" class="opt" data-precio="${i + 1}" aria-pressed="${S.precio.has(i + 1)}">${p}</button>`).join("")}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-soft" data-act="clear">Quitar filtros</button>
          <button type="button" class="btn btn-primary" data-act="ok">Ver ${S.sitios.filter((s) => matches(s)).length} sitios</button>
        </div>`;
    };
    draw();
    d.onclick = (e) => {
      if (e.target === d) return d.close();
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.para) { const v = b.dataset.para; S.para.has(v) ? S.para.delete(v) : S.para.add(v); }
      if (b.dataset.precio) { const v = +b.dataset.precio; S.precio.has(v) ? S.precio.delete(v) : S.precio.add(v); }
      if (b.dataset.act === "clear") { S.para.clear(); S.precio.clear(); }
      if (b.dataset.act === "ok") { d.close(); render({ fit: true }); return; }
      draw();
    };
    d.showModal();
  }
  $("#filtersBtn").addEventListener("click", openFilters);

  /* ------------------------------------------------------------------ */
  /* Lista                                                               */
  /* ------------------------------------------------------------------ */
  function cardHtml(s) {
    const c = catOf(s.categoria);
    const d = distTo(s);
    const meta = [];
    if ((s.cocina || []).length) meta.push(esc(s.cocina.slice(0, 2).join(", ")));
    if (s.zona) meta.push(esc(s.zona));
    if (s.precio) meta.push(PRICE[s.precio - 1]);
    return `<li><button type="button" class="card" data-id="${s.id}">
      <span class="disc" style="background:${c.color}1F">${c.em}${s.estado === "pendiente" ? `<i class="ring" aria-hidden="true"></i>` : ""}</span>
      <span>
        <span class="card-name">${esc(s.nombre)}${s.favorito ? `<span class="heart" aria-label="Favorito">❤</span>` : ""}</span>
        <span class="card-meta">${meta.map((m) => `<span>${m}</span>`).join("") || `<span>${c.one}</span>`}</span>
        ${s.recomendado_por ? `<span class="card-rec">Te lo recomendó ${esc(s.recomendado_por)}</span>` : ""}
      </span>
      <span class="card-side">
        ${s.estado === "probado" && s.nota != null ? `<span class="score">${fmtNota(s.nota)}</span>` : s.estado === "pendiente" ? `<span class="tag-pend">Pendiente</span>` : ""}
        ${d != null ? `<span class="dist">${fmtDist(d)}</span>` : ""}
      </span>
    </button></li>`;
  }

  function renderList(list) {
    const total = S.sitios.length;
    const el = $("#listView");
    if (!total) {
      el.innerHTML = `<div class="list-head"><div><h2 class="list-title">Tus chinchetas</h2><p class="list-sub">Todavía no hay ningún sitio</p></div></div>
        <div class="empty"><div class="empty-art" aria-hidden="true">📌</div>
          ${canEdit() ? `<h3>Clava tu primera chincheta</h3>
          <p>Cuando alguien te recomiende un sitio, búscalo por su nombre o pega el enlace de Google Maps.</p>
          <button type="button" class="btn btn-primary" data-act="add">Añadir sitio</button>` : `<h3>Aún no hay sitios</h3><p>En cuanto se añada alguno aparecerá aquí y en el mapa.</p>`}</div>`;
      return;
    }
    const pend = list.filter((s) => s.estado === "pendiente").length;
    const eff = S.orden === "cerca" && !S.me ? "recientes" : S.orden;
    const sub = eff === "cerca" ? "Ordenados por cercanía" : S.orden === "nota" ? "Ordenados por nota" : S.orden === "nombre" ? "Por orden alfabético" : "Los últimos que añadiste primero";
    el.innerHTML = `
      <div class="list-head">
        <div>
          <h2 class="list-title">${list.length === 1 ? "1 sitio" : `${list.length} sitios`}</h2>
          <p class="list-sub">${sub}</p>
        </div>
        ${pend ? `<button type="button" class="surprise" data-act="surprise">🎲 Sorpréndeme</button>` : ""}
      </div>
      <div class="sortbar" role="group" aria-label="Ordenar">
        ${[["cerca", "Cerca"], ["recientes", "Recientes"], ["nota", "Mejor nota"], ["nombre", "A-Z"]]
          .map(([id, l]) => `<button type="button" class="sort" data-orden="${id}" aria-pressed="${eff === id}">${l}</button>`).join("")}
      </div>
      ${list.length ? `<ul class="cards">${list.map(cardHtml).join("")}</ul>` :
        `<div class="empty"><div class="empty-art" aria-hidden="true">🔍</div><h3>Nada con estos filtros</h3>
          <p>Prueba a quitar alguno o busca otra palabra.</p><button type="button" class="btn btn-soft" data-act="clearAll">Quitar filtros</button></div>`}`;
  }

  $("#listView").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) return openDetail(card.dataset.id);
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.orden) {
      S.orden = b.dataset.orden; store.set("rs_orden", S.orden);
      if (S.orden === "cerca" && !S.me) locate({ quiet: false });
      render();
    }
    if (b.dataset.act === "add") startAdd();
    if (b.dataset.act === "surprise") surprise();
    if (b.dataset.act === "clearAll") {
      S.estado = "todos"; S.cats.clear(); S.para.clear(); S.precio.clear(); S.q = ""; $("#q").value = "";
      render({ fit: true });
    }
  });

  function surprise() {
    const pool = filtered().filter((s) => s.estado === "pendiente");
    if (!pool.length) return toast("No hay pendientes con estos filtros");
    // Si sabemos dónde estás, favorece lo cercano
    const near = S.me ? pool.filter((s) => distTo(s) < 5) : [];
    const from = near.length ? near : pool;
    openDetail(from[Math.floor(Math.random() * from.length)].id);
  }

  /* ------------------------------------------------------------------ */
  /* Ficha                                                               */
  /* ------------------------------------------------------------------ */
  const ICON = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    route: '<svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8z"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    insta: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" class="fill"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    here: '<svg viewBox="0 0 24 24"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" class="fill"/></svg>',
    tap: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><path d="M12 7v5M9.5 9.5h5"/></svg>',
  };

  function openDetail(id, { fly = true } = {}) {
    const s = S.sitios.find((x) => x.id === id);
    if (!s) return;
    const prev = S.selId;
    S.selId = id; S.view = "detail";
    [prev, id].forEach((pid) => {
      const m = markers.get(pid); const ps = S.sitios.find((x) => x.id === pid);
      if (m && ps) m.setIcon(pinIcon(ps, pid === id));
    });
    renderDetail(s);
    $("#listView").hidden = true;
    $("#detailView").hidden = false;
    $("#sheetScroll").scrollTop = 0;
    setSnap(isDesktop() ? "full" : "half");
    const m = markers.get(id);
    const go = () => {
      const target = [s.lat, s.lng];
      const zoom = Math.max(map.getZoom(), 15);
      if (isDesktop()) { map.flyTo(target, zoom, { duration: .6 }); return; }
      // Centra el sitio en la parte visible por encima del panel
      const visible = sheet.offsetHeight - snapY("half");
      const pt = map.project(target, zoom).add([0, visible / 2 - 30]);
      map.flyTo(map.unproject(pt, zoom), zoom, { duration: fly ? .6 : .35 });
    };
    if (m && cluster.hasLayer(m)) cluster.zoomToShowLayer(m, go); else go();
  }
  function closeDetail() {
    const prev = S.selId;
    S.selId = null; S.view = "list";
    const m = markers.get(prev); const ps = S.sitios.find((x) => x.id === prev);
    if (m && ps) m.setIcon(pinIcon(ps, false));
    $("#detailView").hidden = true;
    $("#listView").hidden = false;
    setSnap(isDesktop() ? "full" : "half");
  }

  function renderDetail(s) {
    const c = catOf(s.categoria);
    const d = distTo(s);
    const facts = [];
    facts.push(s.estado === "probado" ? `<span class="fact ok">✓ Probado${s.visitado ? ` el ${new Date(s.visitado + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span>` : `<span class="fact pend">🕐 Pendiente</span>`);
    if (s.precio) facts.push(`<span class="fact">${PRICE[s.precio - 1]}</span>`);
    if (d != null) facts.push(`<span class="fact">${fmtDist(d)}</span>`);
    if (s.zona) facts.push(`<span class="fact">${esc(s.zona)}</span>`);
    const links = [];
    if (s.web) links.push(`<a href="${esc(/^https?:/.test(s.web) ? s.web : "https://" + s.web)}" target="_blank" rel="noopener">${ICON.web}${esc(s.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>`);
    if (s.instagram) {
      const h = s.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
      links.push(`<a href="https://instagram.com/${encodeURIComponent(h)}" target="_blank" rel="noopener">${ICON.insta}@${esc(h)}</a>`);
    }
    if (s.telefono) links.push(`<a href="tel:${esc(s.telefono.replace(/\s/g, ""))}">${ICON.phone}${esc(s.telefono)}</a>`);

    $("#detailView").innerHTML = `
      <div class="detail-top">
        <button type="button" class="icon-btn" data-act="back" aria-label="Volver a la lista">${ICON.back}</button>
        <div class="right">
          ${canEdit() ? `<button type="button" class="icon-btn ${s.favorito ? "fav-on" : ""}" data-act="fav" aria-label="${s.favorito ? "Quitar de favoritos" : "Marcar como favorito"}" aria-pressed="${!!s.favorito}">${ICON.heart}</button>` : ""}
          <button type="button" class="icon-btn" data-act="back" aria-label="Cerrar">${ICON.close}</button>
        </div>
      </div>
      <span class="d-cat" style="color:${c.color}">${c.em} ${c.one}</span>
      <h2 class="d-name">${esc(s.nombre)}</h2>
      <div class="d-facts">${facts.join("")}</div>

      <div class="actions">
        <a class="action primary" href="${directionsLink(s)}" target="_blank" rel="noopener">${ICON.route}Cómo llegar</a>
        <a class="action" href="${esc(gmapsLink(s))}" target="_blank" rel="noopener">${ICON.map}Google Maps</a>
        <a class="action" href="${s.telefono ? `tel:${esc(s.telefono.replace(/\s/g, ""))}` : "#"}" aria-disabled="${!s.telefono}">${ICON.phone}Llamar</a>
        <button type="button" class="action" data-act="share">${ICON.share}Compartir</button>
      </div>

      ${s.estado === "probado" && s.nota != null ? `<div class="d-block"><h3>Mi nota</h3><div class="myscore"><span class="big">${fmtNota(s.nota)}</span><span class="of">sobre 10</span></div></div>` : ""}
      ${s.que_pedir ? `<div class="d-block"><h3>Qué pedir</h3><p class="d-order">${esc(s.que_pedir)}</p></div>` : ""}
      ${s.recomendado_por ? `<div class="d-block"><h3>Te lo recomendó</h3><div class="rec-who"><span class="avatar">${esc(initials(s.recomendado_por))}</span><b>${esc(s.recomendado_por)}</b></div></div>` : ""}
      ${s.notas ? `<div class="d-block"><h3>Notas</h3><p>${esc(s.notas)}</p></div>` : ""}
      ${(s.cocina || []).length ? `<div class="d-block"><h3>Cocina</h3><div class="tags">${s.cocina.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div></div>` : ""}
      ${(s.para || []).length ? `<div class="d-block"><h3>Para ir con</h3><div class="tags">${s.para.map((p) => PARA_BY[p] ? `<span class="tag">${PARA_BY[p].em} ${PARA_BY[p].label}</span>` : "").join("")}</div></div>` : ""}
      ${s.direccion ? `<div class="d-block"><h3>Dirección</h3><p>${esc(s.direccion)}</p></div>` : ""}
      ${links.length ? `<div class="d-block"><h3>Contacto</h3><div class="links">${links.join("")}</div></div>` : ""}

      ${canEdit() ? `<div class="owner-actions">
        <button type="button" class="btn btn-soft" data-act="edit">${ICON.edit}Editar</button>
        ${s.estado === "pendiente" ? `<button type="button" class="btn btn-ok" data-act="tried">${ICON.check}Ya he ido</button>` : ""}
      </div>` : ""}
      <p class="d-foot">Añadido el ${new Date(s.creado).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</p>`;
  }

  $("#detailView").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const s = S.sitios.find((x) => x.id === S.selId);
    if (!s) return;
    const act = b.dataset.act;
    if (act === "back") closeDetail();
    if (act === "edit") openEditor(s);
    if (act === "tried") openEditor({ ...s, estado: "probado", visitado: s.visitado || new Date().toISOString().slice(0, 10) }, { focus: "nota" });
    if (act === "fav") {
      const ok = await saveSitio({ ...s, favorito: !s.favorito }, { quiet: true });
      if (ok) toast(s.favorito ? "Quitado de favoritos" : "Añadido a favoritos");
    }
    if (act === "share") {
      const text = [`${s.nombre}`, s.que_pedir ? `Pide: ${s.que_pedir}` : "", gmapsLink(s)].filter(Boolean).join("\n");
      try {
        if (navigator.share) await navigator.share({ title: s.nombre, text });
        else { await navigator.clipboard.writeText(text); toast("Copiado para compartir"); }
      } catch { /* cancelado */ }
    }
  });

  /* ------------------------------------------------------------------ */
  /* Render global                                                       */
  /* ------------------------------------------------------------------ */
  function render({ fit = false } = {}) {
    const list = filtered();
    renderChips();
    renderMarkers(list);
    renderList(list);
    if (S.view === "detail") {
      const s = S.sitios.find((x) => x.id === S.selId);
      if (s) renderDetail(s); else closeDetail();
    }
    if (fit && list.length) fitTo(list);
  }
  function fitTo(list) {
    if (!list.length) return;
    const b = L.latLngBounds(list.map((s) => [s.lat, s.lng]));
    const bottom = isDesktop() ? 40 : sheet.offsetHeight - snapY(S.snap) + 20;
    const left = isDesktop() ? 460 : 30;
    map.flyToBounds(b, { paddingTopLeft: [left, 140], paddingBottomRight: [30, bottom], maxZoom: 16, duration: .6 });
  }

  /* ------------------------------------------------------------------ */
  /* Datos                                                               */
  /* ------------------------------------------------------------------ */
  async function load() {
    const { data, error } = await sb.from("rs_sitios").select("*").order("creado", { ascending: false });
    if (error) {
      console.error(error);
      toast(S.sitios.length ? "Sin conexión: mostrando la última copia" : "No se han podido cargar los sitios");
      return false;
    }
    S.sitios = data.map((s) => ({ ...s, nota: s.nota == null ? null : Number(s.nota) }));
    store.set("rs_cache", S.sitios);
    return true;
  }

  function rpcError(error) {
    const m = String(error?.message || "");
    if (m.includes("clave_incorrecta")) {
      S.clave = null; store.del("rs_clave"); updateLock();
      return "La clave de edición no es correcta. Vuelve a introducirla en Ajustes.";
    }
    if (m.includes("clave_corta")) return "La clave nueva debe tener al menos 6 caracteres.";
    return "No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.";
  }

  async function saveSitio(s, { quiet = false } = {}) {
    if (!canEdit()) { askKey(); return false; }
    const payload = { ...s };
    ["creado", "actualizado"].forEach((k) => delete payload[k]);
    const { data, error } = await sb.rpc("rs_guardar_sitio", { p_clave: S.clave, p_sitio: payload });
    if (error) { toast(rpcError(error)); return false; }
    await load();
    S.selId = data;
    render();
    if (!quiet) toast(s.id ? "Cambios guardados" : "Chincheta clavada 📌");
    return data;
  }

  async function deleteSitio(id) {
    const { error } = await sb.rpc("rs_borrar_sitio", { p_clave: S.clave, p_id: id });
    if (error) { toast(rpcError(error)); return false; }
    S.sitios = S.sitios.filter((s) => s.id !== id);
    store.set("rs_cache", S.sitios);
    S.view = "list"; S.selId = null;
    $("#detailView").hidden = true; $("#listView").hidden = false;
    render();
    toast("Sitio borrado");
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Ubicación                                                           */
  /* ------------------------------------------------------------------ */
  function locate({ quiet = true, center = false } = {}) {
    if (!navigator.geolocation) { if (!quiet) toast("Tu navegador no permite ubicarte"); return Promise.resolve(null); }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition((p) => {
        S.me = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (!meMarker) meMarker = L.marker([S.me.lat, S.me.lng], { icon: L.divIcon({ html: '<div class="me-dot"></div>', className: "", iconSize: [18, 18] }), interactive: false, zIndexOffset: -100 }).addTo(map);
        else meMarker.setLatLng([S.me.lat, S.me.lng]);
        $("#locateBtn").classList.add("is-on");
        if (center) map.flyTo([S.me.lat, S.me.lng], Math.max(map.getZoom(), 15), { duration: .6 });
        render();
        resolve(S.me);
      }, () => {
        if (!quiet) toast("No tengo permiso para ver tu ubicación");
        resolve(null);
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });
  }
  $("#locateBtn").addEventListener("click", () => locate({ quiet: false, center: true }));

  /* ------------------------------------------------------------------ */
  /* Búsqueda de sitios (OpenStreetMap / Photon) y enlaces de Google Maps */
  /* ------------------------------------------------------------------ */
  const OSM_CAT = {
    restaurant: "restaurante", fast_food: "restaurante", food_court: "restaurante",
    bar: "tapas", pub: "tapas", biergarten: "tapas", wine_bar: "tapas",
    cafe: "cafe", coffee: "cafe", tea: "cafe",
    ice_cream: "dulce", confectionery: "dulce", bakery: "dulce", pastry: "dulce", chocolate: "dulce",
    nightclub: "copas", cocktail_bar: "copas",
    museum: "plan", attraction: "plan", theme_park: "plan", zoo: "plan", park: "plan", cinema: "plan", theatre: "plan", viewpoint: "plan",
  };
  function photonToPlace(f) {
    const p = f.properties || {};
    const [lng, lat] = f.geometry.coordinates;
    const street = [p.street, p.housenumber].filter(Boolean).join(", ");
    const town = p.city || p.town || p.village || p.county || "";
    let categoria = OSM_CAT[p.osm_value] || (p.osm_key === "shop" ? "tienda" : (p.osm_key === "tourism" || p.osm_key === "leisure") ? "plan" : null);
    return {
      nombre: p.name || street || town, lat, lng,
      direccion: [street, p.postcode, town].filter(Boolean).join(", ").replace(/, (\d{5}), /, " $1 "),
      zona: p.district || p.locality || town || "",
      categoria, cocina: p.cuisine ? String(p.cuisine).split(";").map(cocinaEs).filter(Boolean) : [],
    };
  }
  const COCINA_ES = { spanish: "Española", tapas: "Tapas", italian: "Italiana", pizza: "Pizza", japanese: "Japonesa", sushi: "Japonesa", chinese: "Asiática", asian: "Asiática", thai: "Asiática", mexican: "Mexicana", peruvian: "Peruana", indian: "India", burger: "Hamburguesas", vegetarian: "Vegetariana", vegan: "Vegetariana", seafood: "Marisco", mediterranean: "Mediterránea", regional: "Española", steak_house: "Asador", grill: "Asador" };
  const cocinaEs = (c) => COCINA_ES[c.trim().toLowerCase()] || "";

  async function searchPlaces(q, bias) {
    const u = new URL("https://photon.komoot.io/api/");
    u.searchParams.set("q", q);
    u.searchParams.set("limit", "8");
    if (bias) { u.searchParams.set("lat", bias.lat.toFixed(4)); u.searchParams.set("lon", bias.lng.toFixed(4)); }
    const r = await fetch(u);
    if (!r.ok) throw new Error("photon");
    const j = await r.json();
    return (j.features || []).map(photonToPlace);
  }
  async function reverse(lat, lng) {
    try {
      const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`);
      const j = await r.json();
      const f = j.features && j.features[0];
      return f ? photonToPlace(f) : null;
    } catch { return null; }
  }

  // Lee nombre y coordenadas de un enlace largo de Google Maps sin salir del navegador
  function parseGmaps(u) {
    const out = {};
    const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, " ")).trim(); } catch { return s; } };
    const place = u.match(/\/maps\/place\/([^/@?]+)/);
    if (place) out.nombre = dec(place[1]);
    const m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) { out.lat = parseFloat(m[1]); out.lng = parseFloat(m[2]); }
    if (!out.nombre) {
      const q = u.match(/[?&](?:q|query)=([^&]+)/);
      if (q && !/^-?\d+\.\d+,/.test(dec(q[1]))) out.nombre = dec(q[1]);
    }
    return out;
  }
  async function resolveGmaps(text) {
    const url = (text.match(/https?:\/\/\S+/) || [])[0];
    if (!url) return null;
    // Texto compartido desde la app de Google Maps: "Nombre\nDirección\nhttps://maps.app.goo.gl/..."
    const firstLine = text.split(/\n/).map((l) => l.trim()).find((l) => l && !/^https?:/.test(l));
    let info = parseGmaps(url);
    if (info.lat == null) {
      try {
        const r = await fetch(`${CFG.supabaseUrl}/functions/v1/rs-gmaps`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey },
          body: JSON.stringify({ url }),
        });
        if (r.ok) info = { ...info, ...(await r.json()) };
      } catch { /* sin función: seguimos con lo que haya */ }
    }
    const nombre = info.nombre || firstLine || "";
    return { ...info, nombre, gmaps_url: url.replace(/[)\].,]+$/, "") };
  }

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */
  let draft = null, miniMap = null, miniPin = null, searchT = null;

  function startAdd(prefill = {}) {
    if (!canEdit()) return askKey(() => startAdd(prefill));
    openEditor({ estado: "pendiente", categoria: "restaurante", cocina: [], para: [], ...prefill });
  }
  $("#addBtn").addEventListener("click", () => startAdd());

  function openEditor(s, { focus } = {}) {
    if (!canEdit()) return askKey(() => openEditor(s, { focus }));
    draft = { cocina: [], para: [], ...JSON.parse(JSON.stringify(s)) };
    $("#editorTitle").textContent = s.id ? "Editar sitio" : "Nuevo sitio";
    $("#editor").hidden = false;
    drawEditor();
    if (focus === "nota") setTimeout(() => $("#f-nota")?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
    else if (!s.id && draft.lat == null) setTimeout(() => $("#f-search")?.focus(), 250);
  }
  function closeEditor() {
    $("#editor").hidden = true;
    if (miniMap) { miniMap.remove(); miniMap = null; miniPin = null; }
    draft = null;
  }
  $("#editorCancel").addEventListener("click", closeEditor);
  $("#editorSave").addEventListener("click", () => submitEditor());

  const recomendadores = () => [...new Set(S.sitios.map((s) => s.recomendado_por).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

  function drawEditor() {
    const d = draft;
    const hasLoc = d.lat != null && d.lng != null;
    $("#editorForm").innerHTML = `
      <div class="group">
        <h3>¿Dónde está?</h3>
        <p class="help">Búscalo por su nombre, pega el enlace de Google Maps o márcalo tú.</p>
        <div class="searchbox">${ICON.search}<input class="input" id="f-search" type="search" placeholder="Nombre del sitio o dirección" autocomplete="off" enterkeyhint="search"></div>
        <ul class="results" id="f-results"></ul>
        <div class="locate-tools">
          <button type="button" class="tool" data-tool="paste">${ICON.link}Pegar enlace de Google Maps</button>
          <button type="button" class="tool" data-tool="here">${ICON.here}Estoy aquí</button>
          <button type="button" class="tool" data-tool="pick">${ICON.tap}Elegir en el mapa</button>
        </div>
        <label class="field" id="f-link-wrap" ${d.gmaps_url || d._showLink ? "" : "hidden"}>
          <span>Enlace de Google Maps</span>
          <input class="input" id="f-link" type="url" inputmode="url" placeholder="https://maps.app.goo.gl/…" value="${esc(d.gmaps_url || "")}">
        </label>
        ${hasLoc ? `<div class="mini-map-wrap"><div class="mini-map" id="miniMap"></div><span class="mini-map-cap">Arrastra la chincheta para afinar</span></div>
          ${d.direccion ? `<p class="addr-line">${ICON.check}<span>${esc(d.direccion)}</span></p>` : ""}` : ""}
      </div>

      <div class="group">
        <h3>El sitio</h3>
        <label class="field"><span>Nombre</span><input class="input" id="f-nombre" maxlength="120" value="${esc(d.nombre || "")}" placeholder="Ej.: Casa Dani" autocapitalize="words"></label>
        <div class="field"><span>Tipo</span>
          <div class="opts" id="f-cat">${CATS.map((c) => `<button type="button" class="opt cat" data-v="${c.id}" aria-pressed="${d.categoria === c.id}" style="${d.categoria === c.id ? `background:${c.color}` : ""}">${c.em} ${c.one}</button>`).join("")}</div>
        </div>
        <div class="field"><span>Cocina <small>(opcional)</small></span>
          <div class="taginput" id="f-cocina">${(d.cocina || []).map((t, i) => `<span class="tagx">${esc(t)}<button type="button" data-rm="${i}" aria-label="Quitar ${esc(t)}">✕</button></span>`).join("")}<input id="f-cocina-in" placeholder="${(d.cocina || []).length ? "" : "Escribe o elige abajo"}" enterkeyhint="done"></div>
          <div class="suggest" id="f-cocina-sug">${COCINAS.filter((c) => !(d.cocina || []).includes(c)).slice(0, 12).map((c) => `<button type="button" data-add="${esc(c)}">+ ${esc(c)}</button>`).join("")}</div>
        </div>
        <div class="row2">
          <label class="field"><span>Zona <small>(barrio o pueblo)</small></span><input class="input" id="f-zona" value="${esc(d.zona || "")}" placeholder="Ej.: Chamberí"></label>
          <div class="field"><span>Precio</span>
            <div class="opts price" id="f-precio">${PRICE.map((p, i) => `<button type="button" class="opt" data-v="${i + 1}" aria-pressed="${d.precio === i + 1}">${p}</button>`).join("")}</div>
          </div>
        </div>
      </div>

      <div class="group">
        <h3>La recomendación</h3>
        <label class="field"><span>¿Quién te lo recomendó?</span>
          <input class="input" id="f-rec" list="recList" value="${esc(d.recomendado_por || "")}" placeholder="Ej.: Marta, del trabajo" autocapitalize="words">
          <datalist id="recList">${recomendadores().map((r) => `<option value="${esc(r)}">`).join("")}</datalist>
        </label>
        <label class="field"><span>Qué pedir</span><textarea class="textarea" id="f-pedir" placeholder="Ej.: El cachopo y la tarta de queso">${esc(d.que_pedir || "")}</textarea></label>
        <div class="field"><span>Para ir con</span>
          <div class="opts" id="f-para">${PARA.map((p) => `<button type="button" class="opt" data-v="${p.id}" aria-pressed="${(d.para || []).includes(p.id)}">${p.em} ${p.label}</button>`).join("")}</div>
        </div>
        <label class="field"><span>Notas <small>(reservar, horarios, aparcamiento…)</small></span><textarea class="textarea" id="f-notas" placeholder="Ej.: Reservar con una semana. Cierra los lunes.">${esc(d.notas || "")}</textarea></label>
      </div>

      <div class="group">
        <h3>¿Has ido ya?</h3>
        <div class="seg" id="f-estado" role="group" aria-label="Estado">
          <button type="button" class="p" data-v="pendiente" aria-pressed="${d.estado !== "probado"}">Pendiente</button>
          <button type="button" class="o" data-v="probado" aria-pressed="${d.estado === "probado"}">Ya he ido</button>
        </div>
        ${d.estado === "probado" ? `
          <div class="field" id="f-nota"><span>Mi nota</span>
            <div class="rating"><output id="f-nota-out">${d.nota != null ? fmtNota(d.nota) : "–"}</output>
            <input type="range" id="f-nota-in" min="0" max="10" step="0.5" value="${d.nota ?? 7}" aria-label="Nota de 0 a 10"></div>
          </div>
          <label class="field"><span>Día que fuiste</span><input class="input" id="f-visitado" type="date" value="${esc(d.visitado || "")}"></label>` : ""}
        <label class="switch-row"><span>❤️ Favorito</span><input type="checkbox" class="switch" id="f-fav" ${d.favorito ? "checked" : ""}></label>
      </div>

      <div class="group">
        <h3>Contacto <small style="font:500 14px var(--text);color:var(--ink-faint)">(opcional)</small></h3>
        <label class="field"><span>Teléfono</span><input class="input" id="f-tel" type="tel" inputmode="tel" value="${esc(d.telefono || "")}" placeholder="91 000 00 00"></label>
        <label class="field"><span>Web</span><input class="input" id="f-web" type="url" inputmode="url" value="${esc(d.web || "")}" placeholder="casadani.es"></label>
        <label class="field"><span>Instagram</span><input class="input" id="f-ig" value="${esc(d.instagram || "")}" placeholder="@casadani" autocapitalize="off"></label>
      </div>

      ${d.id ? `<div class="danger-zone"><button type="button" class="btn btn-danger" data-act="delete">Borrar este sitio</button></div>` : ""}`;

    if (hasLoc) initMiniMap();
  }

  function initMiniMap() {
    if (miniMap) { miniMap.remove(); miniMap = null; }
    miniMap = L.map("miniMap", { zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false })
      .setView([draft.lat, draft.lng], 17);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 20 }).addTo(miniMap);
    miniPin = L.marker([draft.lat, draft.lng], { draggable: true, icon: pinIcon({ ...draft, estado: draft.estado || "pendiente" }, false) }).addTo(miniMap);
    miniPin.on("dragend", async () => {
      const p = miniPin.getLatLng();
      draft.lat = p.lat; draft.lng = p.lng;
      const r = await reverse(p.lat, p.lng);
      if (r && r.direccion) { draft.direccion = r.direccion; const a = $(".addr-line span"); if (a) a.textContent = r.direccion; }
    });
    setTimeout(() => miniMap && miniMap.invalidateSize(), 60);
  }

  // Lee el formulario al borrador antes de redibujar
  function syncDraft() {
    if (!draft) return;
    const v = (id) => ($(id)?.value ?? "").trim();
    draft.nombre = v("#f-nombre");
    draft.zona = v("#f-zona");
    draft.recomendado_por = v("#f-rec");
    draft.que_pedir = v("#f-pedir");
    draft.notas = v("#f-notas");
    draft.telefono = v("#f-tel");
    draft.web = v("#f-web");
    draft.instagram = v("#f-ig");
    if ($("#f-link")) draft.gmaps_url = v("#f-link");
    if ($("#f-visitado")) draft.visitado = v("#f-visitado") || null;
    if ($("#f-fav")) draft.favorito = $("#f-fav").checked;
    const extra = v("#f-cocina-in");
    if (extra) addCocina(extra, false);
  }
  function redraw() { syncDraft(); const y = $("#editorForm").scrollTop; drawEditor(); $("#editorForm").scrollTop = y; }

  function addCocina(raw, re = true) {
    raw.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => {
      const nice = t.charAt(0).toUpperCase() + t.slice(1);
      if (!draft.cocina.some((c) => norm(c) === norm(nice))) draft.cocina.push(nice);
    });
    if (re) { const inp = $("#f-cocina-in"); if (inp) inp.value = ""; redraw(); setTimeout(() => $("#f-cocina-in")?.focus(), 0); }
  }

  function applyPlace(p, { keepName = false } = {}) {
    syncDraft();
    if (p.lat != null) { draft.lat = p.lat; draft.lng = p.lng; }
    if (p.nombre && (!keepName || !draft.nombre)) draft.nombre = p.nombre;
    if (p.direccion) draft.direccion = p.direccion;
    if (p.zona && !draft.zona) draft.zona = p.zona;
    if (p.categoria && !draft.id) draft.categoria = p.categoria;
    if (p.cocina && p.cocina.length) p.cocina.forEach((c) => { if (!draft.cocina.includes(c)) draft.cocina.push(c); });
    if (p.gmaps_url) draft.gmaps_url = p.gmaps_url;
    drawEditor();
  }

  const editorForm = $("#editorForm");
  editorForm.addEventListener("submit", (e) => e.preventDefault());
  editorForm.addEventListener("input", (e) => {
    if (e.target.id === "f-search") {
      clearTimeout(searchT);
      const q = e.target.value.trim();
      const out = $("#f-results");
      if (/https?:\/\//.test(q)) { handleLink(q); return; }
      if (q.length < 3) { out.innerHTML = ""; return; }
      out.innerHTML = `<li class="res-note">Buscando…</li>`;
      searchT = setTimeout(async () => {
        try {
          const bias = S.me || (draft.lat != null ? draft : { lat: map.getCenter().lat, lng: map.getCenter().lng });
          const res = await searchPlaces(q, bias);
          if (!$("#f-results")) return;
          out._res = res;
          out.innerHTML = res.length ? res.map((p, i) => {
            const c = p.categoria ? catOf(p.categoria) : null;
            return `<li><button type="button" class="result" data-i="${i}"><span class="em">${c ? c.em : "📍"}</span><span><b>${esc(p.nombre)}</b><small>${esc(p.direccion || p.zona || "")}</small></span><span class="dist">${S.me ? fmtDist(km(S.me, p)) : ""}</span></button></li>`;
          }).join("") + `<li class="res-note">¿No sale? Pega el enlace de Google Maps o márcalo en el mapa.</li>`
            : `<li class="res-note">Sin resultados. Prueba con el enlace de Google Maps o márcalo en el mapa.</li>`;
        } catch {
          out.innerHTML = `<li class="res-note">El buscador no responde ahora. Usa el enlace de Google Maps o el mapa.</li>`;
        }
      }, 350);
    }
    if (e.target.id === "f-nota-in") {
      draft.nota = parseFloat(e.target.value);
      $("#f-nota-out").textContent = fmtNota(draft.nota);
    }
    if (e.target.id === "f-link") {
      const val = e.target.value.trim();
      if (/^https?:\/\/\S+$/.test(val) && val !== draft._lastLink) { draft._lastLink = val; handleLink(val, { fromField: true }); }
    }
  });
  editorForm.addEventListener("keydown", (e) => {
    if (e.target.id === "f-cocina-in" && (e.key === "Enter" || e.key === ",")) { e.preventDefault(); if (e.target.value.trim()) addCocina(e.target.value); }
    if (e.target.id === "f-cocina-in" && e.key === "Backspace" && !e.target.value && draft.cocina.length) { draft.cocina.pop(); redraw(); setTimeout(() => $("#f-cocina-in")?.focus(), 0); }
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.id !== "f-cocina-in") e.preventDefault();
  });
  editorForm.addEventListener("click", async (e) => {
    const r = e.target.closest(".result");
    if (r) {
      const p = $("#f-results")._res[+r.dataset.i];
      applyPlace(p);
      return;
    }
    const cat = e.target.closest("#f-cat .opt");
    if (cat) { draft.categoria = cat.dataset.v; return redraw(); }
    const pr = e.target.closest("#f-precio .opt");
    if (pr) { const v = +pr.dataset.v; draft.precio = draft.precio === v ? null : v; return redraw(); }
    const pa = e.target.closest("#f-para .opt");
    if (pa) { const v = pa.dataset.v; draft.para = draft.para.includes(v) ? draft.para.filter((x) => x !== v) : [...draft.para, v]; return redraw(); }
    const es = e.target.closest("#f-estado button");
    if (es) {
      draft.estado = es.dataset.v;
      if (draft.estado === "probado") { if (draft.nota == null) draft.nota = 7; if (!draft.visitado) draft.visitado = new Date().toISOString().slice(0, 10); }
      return redraw();
    }
    const add = e.target.closest("[data-add]");
    if (add) return addCocina(add.dataset.add);
    const rm = e.target.closest("[data-rm]");
    if (rm) { syncDraft(); draft.cocina.splice(+rm.dataset.rm, 1); return redraw(); }
    if (e.target.closest(".taginput") && !e.target.closest("button")) $("#f-cocina-in")?.focus();
    const tool = e.target.closest("[data-tool]");
    if (tool) {
      const t = tool.dataset.tool;
      if (t === "paste") {
        let txt = "";
        try { txt = await navigator.clipboard.readText(); } catch { /* sin permiso */ }
        if (/https?:\/\//.test(txt)) handleLink(txt);
        else { syncDraft(); draft._showLink = true; drawEditor(); $("#f-link").focus(); toast("Pega aquí el enlace de Google Maps"); }
      }
      if (t === "here") {
        tool.disabled = true;
        const me = await locate({ quiet: false });
        tool.disabled = false;
        if (me) {
          const rr = await reverse(me.lat, me.lng);
          applyPlace({ ...(rr || {}), lat: me.lat, lng: me.lng, nombre: undefined, categoria: undefined }, { keepName: true });
        }
      }
      if (t === "pick") startPicker();
    }
    if (e.target.closest("[data-act=delete]")) {
      if (confirm(`¿Borrar "${draft.nombre}"? No se puede deshacer.`)) {
        const id = draft.id;
        closeEditor();
        await deleteSitio(id);
      }
    }
  });

  async function handleLink(text, { fromField = false } = {}) {
    const out = $("#f-results");
    if (out) out.innerHTML = `<li class="res-note">Leyendo el enlace de Google Maps…</li>`;
    const info = await resolveGmaps(text);
    if (!draft) return;
    if (!info) { if (out) out.innerHTML = ""; return; }
    if (info.lat != null) {
      const rr = await reverse(info.lat, info.lng);
      // Si OSM tiene el local en ese punto, aprovechamos tipo y cocina
      const same = rr && info.nombre && norm(rr.nombre).includes(norm(info.nombre).split(" ")[0]);
      applyPlace({ ...(rr || {}), ...(same ? {} : { categoria: undefined, cocina: [] }), nombre: info.nombre || rr?.nombre, lat: info.lat, lng: info.lng, gmaps_url: info.gmaps_url });
      toast("Sitio leído desde Google Maps");
    } else if (info.nombre) {
      // Sin coordenadas: buscamos el nombre
      syncDraft();
      draft.gmaps_url = info.gmaps_url; draft._showLink = true;
      if (!draft.nombre) draft.nombre = info.nombre;
      drawEditor();
      const s = $("#f-search"); s.value = info.nombre; s.dispatchEvent(new Event("input", { bubbles: true }));
      toast("Elige el sitio correcto en la lista");
    } else {
      syncDraft(); draft.gmaps_url = info.gmaps_url; draft._showLink = true; drawEditor();
      if (!fromField) toast("Guardado el enlace. Busca el nombre o márcalo en el mapa.");
    }
  }

  // Elegir un punto moviendo el mapa grande
  function startPicker() {
    syncDraft();
    $("#editor").hidden = true;
    $("#picker").hidden = false;
    sheet.style.visibility = "hidden";
    $("#mapFabs").classList.add("is-hidden");
    $(".topbar").style.visibility = "hidden";
    if (draft.lat != null) map.setView([draft.lat, draft.lng], 18);
    else if (S.me) map.setView([S.me.lat, S.me.lng], 17);
  }
  function endPicker(ok) {
    $("#picker").hidden = true;
    sheet.style.visibility = "";
    $(".topbar").style.visibility = "";
    setSnap(S.snap);
    $("#editor").hidden = false;
    if (ok) {
      const c = map.getCenter();
      reverse(c.lat, c.lng).then((rr) => applyPlace({ ...(rr || {}), nombre: undefined, categoria: undefined, lat: c.lat, lng: c.lng }, { keepName: true }));
    } else drawEditor();
  }
  $("#pickerOk").addEventListener("click", () => endPicker(true));
  $("#pickerCancel").addEventListener("click", () => endPicker(false));

  async function submitEditor() {
    syncDraft();
    const d = draft;
    if (!d.nombre) { toast("Ponle un nombre al sitio"); $("#f-nombre").classList.add("is-invalid"); $("#f-nombre").focus(); return; }
    if (d.lat == null) { toast("Falta la ubicación: búscalo, pega el enlace o márcalo en el mapa"); $("#f-search").focus(); return; }
    const payload = {
      id: d.id || null, nombre: d.nombre, categoria: d.categoria || "otro", estado: d.estado || "pendiente", favorito: !!d.favorito,
      lat: d.lat, lng: d.lng, direccion: d.direccion || null, zona: d.zona || null, gmaps_url: d.gmaps_url || null,
      web: d.web || null, telefono: d.telefono || null, instagram: d.instagram || null, precio: d.precio || null,
      cocina: d.cocina || [], para: d.para || [], recomendado_por: d.recomendado_por || null, que_pedir: d.que_pedir || null,
      notas: d.notas || null, nota: d.estado === "probado" ? (d.nota ?? null) : null, visitado: d.estado === "probado" ? (d.visitado || null) : null,
    };
    const btn = $("#editorSave");
    btn.disabled = true; btn.textContent = "Guardando…";
    const id = await saveSitio(payload);
    btn.disabled = false; btn.textContent = "Guardar";
    if (id) { closeEditor(); openDetail(id); }
  }

  /* ------------------------------------------------------------------ */
  /* Clave de edición y ajustes                                          */
  /* ------------------------------------------------------------------ */
  // La vista de consulta (la que se comparte) no muestra nada de edición.
  // Para entrar como administrador: abrir la app con ?admin una vez e introducir la clave.
  const wantsAdmin = new URLSearchParams(location.search).has("admin");
  function updateLock() {
    $("#lockDot").classList.toggle("on", canEdit());
    document.body.classList.toggle("is-admin", canEdit() || wantsAdmin);
  }

  function askKey(then) {
    const d = $("#settingsDialog");
    $("#settingsBody").innerHTML = `
      <h2 id="settingsTitle">Modo edición</h2>
      <p>Introduce tu clave para añadir y editar sitios en este dispositivo. Sin ella, la app es solo de consulta.</p>
      <form id="keyForm">
        <input class="input" id="keyIn" type="password" autocomplete="current-password" placeholder="Clave de edición" required>
        <p class="err" id="keyErr"></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-soft" data-close>Ahora no</button>
          <button type="submit" class="btn btn-primary">Entrar</button>
        </div>
      </form>`;
    d.showModal();
    setTimeout(() => $("#keyIn").focus(), 50);
    $("[data-close]", d).onclick = () => d.close();
    $("#keyForm").onsubmit = async (e) => {
      e.preventDefault();
      const k = $("#keyIn").value;
      const btn = e.submitter || $("#keyForm button[type=submit]");
      btn.disabled = true;
      const { data, error } = await sb.rpc("rs_comprobar_clave", { p_clave: k });
      btn.disabled = false;
      if (error) { $("#keyErr").textContent = "No se ha podido comprobar. Revisa la conexión."; return; }
      if (!data) { $("#keyErr").textContent = "Clave incorrecta."; $("#keyIn").select(); return; }
      S.clave = k; store.set("rs_clave", k); updateLock();
      d.close();
      toast("Modo edición activado");
      render();
      if (typeof then === "function") then();
    };
  }

  function openSettings() {
    if (!canEdit()) return askKey();
    const d = $("#settingsDialog");
    const n = S.sitios.length, p = S.sitios.filter((s) => s.estado === "pendiente").length;
    $("#settingsBody").innerHTML = `
      <h2 id="settingsTitle">Ajustes</h2>
      <div class="status-line on"><i></i>Modo edición activo en este dispositivo</div>
      <p>${n} sitios guardados, ${p} pendientes.</p>
      <div class="settings-list">
        <button type="button" class="btn btn-soft" data-s="share">🔗 Compartir enlace de la app</button>
        <button type="button" class="btn btn-soft" data-s="export">⬇️ Descargar copia (JSON)</button>
        <button type="button" class="btn btn-soft" data-s="pass">🔑 Cambiar clave</button>
        <button type="button" class="btn btn-soft" data-s="lock">🔒 Salir del modo edición</button>
      </div>
      <div id="passBox" hidden>
        <p class="f-title">Nueva clave</p>
        <input class="input" id="passNew" type="password" autocomplete="new-password" minlength="6" placeholder="Mínimo 6 caracteres">
        <p class="err" id="passErr"></p>
        <button type="button" class="btn btn-primary" data-s="passOk" style="width:100%">Guardar clave nueva</button>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-soft" data-close>Cerrar</button></div>`;
    d.showModal();
    d.onclick = async (e) => {
      if (e.target === d || e.target.closest("[data-close]")) return d.close();
      const b = e.target.closest("[data-s]");
      if (!b) return;
      const a = b.dataset.s;
      if (a === "lock") { S.clave = null; store.del("rs_clave"); updateLock(); document.body.classList.remove("is-admin"); d.close(); render(); toast("Modo edición desactivado"); }
      if (a === "pass") { $("#passBox").hidden = false; $("#passNew").focus(); }
      if (a === "passOk") {
        const nv = $("#passNew").value;
        const { error } = await sb.rpc("rs_cambiar_clave", { p_clave: S.clave, p_nueva: nv });
        if (error) { $("#passErr").textContent = rpcError(error); return; }
        S.clave = nv; store.set("rs_clave", nv);
        d.close(); toast("Clave cambiada");
      }
      if (a === "export") {
        const blob = new Blob([JSON.stringify(S.sitios, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement("a"), { href: url, download: `chinchetas-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (a === "share") {
        const url = location.href.split(/[?#]/)[0];
        try { if (navigator.share) await navigator.share({ title: "Chinchetas", url }); else { await navigator.clipboard.writeText(url); toast("Enlace copiado"); } } catch { /* cancelado */ }
      }
    };
  }
  $("#settingsBtn").addEventListener("click", openSettings);

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */
  updateLock();
  if (wantsAdmin) {
    history.replaceState(null, "", location.pathname);
    if (!canEdit()) setTimeout(() => askKey(), 400);
  }
  setSnap("peek", { animate: false });
  render({ fit: S.sitios.length > 0 });
  load().then((ok) => {
    if (ok) render({ fit: true });
    // Compartido desde otra app (Android) o ?add=<texto>
    const params = new URLSearchParams(location.search);
    const shared = [params.get("title"), params.get("text"), params.get("url"), params.get("add")].filter(Boolean).join("\n");
    if (shared) {
      history.replaceState(null, "", location.pathname);
      startAdd();
      if (draft) handleLink(shared);
    }
  });
  locate({ quiet: true });
})();
