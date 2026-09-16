// ============================================================
// APP.JS — Urbano Envíos Dashboard
// ============================================================

let RAW = { actividades: [], compromisos: [], asignacion: [] };
let DATA = { actas: [], compromisos: [], asignacion: [], meses: [], vendedores: [] };
let curPage = "resumen";
let curFiltroMes = "__TODOS__";
let curFiltroVend = "__TODOS__";
let curFiltroTipo = "__TODOS__";
let curBusqueda = "";
let sortState = { col: null, dir: 1 };

function mo(x) { return "$" + Math.round(x || 0).toLocaleString("en-US"); }
function pct(v, t) { return t ? Math.round((v / t) * 100) : 0; }
function esc(s) { return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// ============================================================
// CARGA PRINCIPAL
// ============================================================
async function cargarTodo(forzado) {
  document.getElementById("loadingBox").classList.remove("hidden");
  document.getElementById("errorBox").classList.add("hidden");
  document.getElementById("content").classList.add("hidden");
  setStatus("Act", "load", "cargando…");
  setStatus("Comp", "load", "cargando…");
  setStatus("Asig", "load", "cargando…");

  const resultados = await Promise.allSettled([
    fetchCSV(FUENTES.actividades.url).then(r => { RAW.actividades = r; setStatus("Act", "ok", r.length - 1 + " filas"); }).catch(e => { setStatus("Act", "err", e.message); }),
    fetchCSV(FUENTES.compromisos.url).then(r => { RAW.compromisos = r; setStatus("Comp", "ok", r.length - 1 + " filas"); }).catch(e => { setStatus("Comp", "err", e.message); }),
    fetchCSV(FUENTES.asignacion.url).then(r => { RAW.asignacion = r; setStatus("Asig", "ok", r.length - 1 + " filas"); }).catch(e => { setStatus("Asig", "err", e.message); }),
  ]);

  const huboActividades = RAW.actividades && RAW.actividades.length > 1;

  if (!huboActividades) {
    document.getElementById("loadingBox").classList.add("hidden");
    document.getElementById("errorBox").classList.remove("hidden");
    document.getElementById("errorBox").innerHTML =
      "<b>No se pudieron cargar las Actividades.</b><br>Verifica que la URL en data.js sea la de publicación CSV (Archivo → Compartir → Publicar en la web → CSV) y que la hoja siga publicada.";
    return;
  }

  procesarActividades();
  procesarCompromisos();
  procesarAsignacion();

  const ahora = new Date();
  const hora = ahora.toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" });
  document.getElementById("lastUpdate").textContent = hora;
  document.getElementById("footTime").textContent = hora;

  document.getElementById("loadingBox").classList.add("hidden");
  document.getElementById("content").classList.remove("hidden");
  renderPage();
}

function setStatus(key, level, msg) {
  const dot = document.getElementById("dot" + key);
  const txt = document.getElementById("stat" + key);
  dot.className = "dot " + level;
  txt.textContent = msg;
}

// ============================================================
// PROCESAMIENTO: ACTIVIDADES (actas)
// ============================================================
function procesarActividades() {
  const rows = RAW.actividades;
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].some(c => limpiaTxt(c).toUpperCase() === "CODIGO")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) headerIdx = 1;

  const header = rows[headerIdx].map(h => limpiaTxt(h).toUpperCase());
  const idx = (name) => header.findIndex(h => h === name);

  const iCod = idx("CODIGO"), iCli = idx("CLIENTE/SHIPPER"), iFecha = idx("FECHA"), iHora = idx("HORA"),
    iMes = idx("MES"), iModal = idx("MODALIDAD"), iPart = idx("PARTICIPANTES DE REUNION"),
    iNuevo = idx("INGRESO DE CLIENTE NUEVO"), iVentas = idx("VENTAS Y CUMPLIMIENTO DEL PRESUPUESTO"),
    iKpi = idx("NIVELES DE SERVICIO KPI´S"), iFact = idx("FACTURACIÓN GENERADA Y PENDIENTE - RETENCIONES"),
    iCobranza = idx("COBRANZA - SALDOS DE CARTERA"), iCobertura = idx("COBERTURA"),
    iCapac = idx("CAPACITACIÓN USUARIOS Y SISTEMA"),
    iOtros1 = idx("OTROS"), iOtros2 = idx("OTROS 2"), iOtros3 = idx("OTROS 3"), iOtros4 = idx("OTROS 4"), iOtros5 = idx("OTROS 5"),
    iResp = idx("RESPONSABLE"), iTipo = idx("TIPO DE VISITA"), iEntrega = idx("FECHA DE ENTREGA");

  const actas = [];
  const mesesSet = new Set();
  const vendSet = new Set();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 3) continue;
    const cliente = limpiaShipper(r[iCli]);
    if (!cliente) continue;
    const mes = limpiaTxt(r[iMes]).toUpperCase();
    if (!mes) continue;
    const resp = normEjecutivo(r[iResp]);
    const tipoRaw = limpiaTxt(r[iTipo]);

    mesesSet.add(mes);
    if (resp) vendSet.add(resp);

    actas.push({
      cod: limpiaTxt(r[iCod]),
      cliente: cliente,
      fecha: limpiaTxt(r[iFecha]),
      hora: limpiaTxt(r[iHora]),
      mes: mes,
      modalidad: limpiaTxt(r[iModal]) || "—",
      participantes: limpiaTxt(r[iPart]),
      campos: {
        "Ingreso de cliente nuevo": limpiaTxt(r[iNuevo]),
        "Ventas y cumplimiento del presupuesto": limpiaTxt(r[iVentas]),
        "Niveles de servicio (KPI's)": limpiaTxt(r[iKpi]),
        "Facturación generada y pendiente - Retenciones": limpiaTxt(r[iFact]),
        "Cobranza - Saldos de cartera": limpiaTxt(r[iCobranza]),
        "Cobertura": limpiaTxt(r[iCobertura]),
        "Capacitación usuarios y sistema": limpiaTxt(r[iCapac]),
        "Otros": limpiaTxt(r[iOtros1]),
        "Otros 2": limpiaTxt(r[iOtros2]),
        "Otros 3": limpiaTxt(r[iOtros3]),
        "Otros 4": limpiaTxt(r[iOtros4]),
        "Otros 5": limpiaTxt(r[iOtros5]),
      },
      responsable: resp || "Sin asignar",
      tipo: tipoNorm(tipoRaw),
      tipoRaw: tipoRaw || "—",
      fechaEntrega: limpiaTxt(r[iEntrega])
    });
  }

  DATA.actas = actas;
  DATA.meses = Array.from(mesesSet);
  DATA.vendedores = Array.from(vendSet).sort();
}

// ============================================================
// PROCESAMIENTO: COMPROMISOS
// ============================================================
function procesarCompromisos() {
  const rows = RAW.compromisos;
  if (!rows || rows.length < 2) { DATA.compromisos = []; return; }

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].some(c => limpiaTxt(c).toUpperCase().includes("TIPO DE COMPROMISO"))) { headerIdx = i; break; }
  }
  if (headerIdx === -1) { DATA.compromisos = []; return; }

  const header = rows[headerIdx].map(h => limpiaTxt(h).toUpperCase());
  const idx = (name) => header.findIndex(h => h.includes(name));

  const iTipo = idx("TIPO DE COMPROMISO"), iGestion = idx("GESTION REQUERIDA"), iObs = idx("OBSERVACIONES"),
    iDepto = idx("DEPTO RESPONSABLE"), iEmision = idx("FECHA DE EMISION"), iEstado = idx("ESTADO"),
    iCierre = idx("FECHA DE CIERRE"), iSolucion = idx("SOLUCION"), iEjec = idx("EJECUTIVO"),
    iShip = idx("SHIPPER"), iMes = header.findIndex(h => h === "MES"), iRango = idx("RANGO");

  const compromisos = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 3) continue;
    const shipper = limpiaShipper(r[iShip]);
    if (!shipper && esVacio(r[iTipo])) continue;
    compromisos.push({
      tipo: limpiaTxt(r[iTipo]) || "Sin tipo",
      gestion: limpiaTxt(r[iGestion]),
      observaciones: limpiaTxt(r[iObs]),
      depto: limpiaTxt(r[iDepto]) || "—",
      emision: limpiaTxt(r[iEmision]),
      estado: limpiaTxt(r[iEstado]).toUpperCase() || "PENDIENTE",
      cierre: limpiaTxt(r[iCierre]),
      solucion: limpiaTxt(r[iSolucion]),
      ejecutivo: normEjecutivo(r[iEjec]) || "Sin asignar",
      shipper: shipper || "—",
      mes: limpiaTxt(r[iMes]).toUpperCase(),
      rango: limpiaTxt(r[iRango])
    });
  }
  DATA.compromisos = compromisos;
}

// ============================================================
// PROCESAMIENTO: ASIGNACIÓN DE CLIENTES
// ============================================================
function procesarAsignacion() {
  const rows = RAW.asignacion;
  if (!rows || rows.length < 2) { DATA.asignacion = []; return; }

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rows[i].some(c => limpiaTxt(c).toUpperCase() === "COD")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) { DATA.asignacion = []; return; }

  const header = rows[headerIdx].map(h => limpiaTxt(h).toUpperCase());
  const idx = (name) => header.findIndex(h => h.includes(name));

  const iCod = idx("COD"), iShip = idx("SHIPER"), iEjec = idx("EJECUTIVO"), iGrupo = idx("GRUPO"),
    iEstado = idx("ESTADO"), iTipo = header.findIndex(h => h === "TIPO"), iOblig = idx("VISITA OBLIGATORIA"),
    iObs = idx("OBSERVACIONES");

  const MESES_NOMBRE = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  const colsMes = {};
  header.forEach((h, i) => { if (MESES_NOMBRE.includes(h)) colsMes[h] = i; });

  const asign = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const cod = limpiaTxt(r[iCod]);
    const ship = limpiaShipper(r[iShip]);
    if (!cod && !ship) continue;
    const visitasPorMes = {};
    Object.entries(colsMes).forEach(([mes, ci]) => {
      const v = limpiaTxt(r[ci]).toUpperCase();
      visitasPorMes[mes] = v.includes("VISITADO") ? "VISITADO" : (v.includes("PENDIENTE") ? "PENDIENTE" : (v || "—"));
    });
    asign.push({
      cod: cod,
      shipper: ship,
      ejecutivo: normEjecutivo(r[iEjec]),
      grupo: limpiaTxt(r[iGrupo]),
      estado: limpiaTxt(r[iEstado]),
      tipo: limpiaTxt(r[iTipo]),
      obligatoria: limpiaTxt(r[iOblig]).toUpperCase() === "SI",
      visitas: visitasPorMes,
      observaciones: limpiaTxt(r[iObs])
    });
  }
  DATA.asignacion = asign;
}

// ============================================================
// NAVEGACIÓN
// ============================================================
function nav(page, el) {
  curPage = page;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  if (el) el.classList.add("active");
  renderPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderPage() {
  const c = document.getElementById("content");
  if (curPage === "resumen") c.innerHTML = renderResumen();
  else if (curPage === "actas") c.innerHTML = renderActasPage();
  else if (curPage === "vendedores") c.innerHTML = renderVendedoresPage();
  else if (curPage === "compromisos") c.innerHTML = renderCompromisosPage();
  else if (curPage === "clientes") c.innerHTML = renderClientesPage();
  wireEvents();
}

// ============================================================
// FILTRO BASE
// ============================================================
function actasFiltradas() {
  return DATA.actas.filter(a => {
    if (curFiltroMes !== "__TODOS__" && a.mes !== curFiltroMes) return false;
    if (curFiltroVend !== "__TODOS__" && a.responsable !== curFiltroVend) return false;
    if (curFiltroTipo !== "__TODOS__" && a.tipo !== curFiltroTipo) return false;
    if (curBusqueda) {
      const q = curBusqueda.toLowerCase();
      const hay = a.cliente.toLowerCase().includes(q) || a.cod.toLowerCase().includes(q) ||
        a.responsable.toLowerCase().includes(q) || Object.values(a.campos).some(v => v.toLowerCase().includes(q));
      if (!hay) return false;
    }
    return true;
  });
}

// ============================================================
// helpers de gráficos
// ============================================================
function donutSVG(segs, size) {
  size = size || 170;
  const tot = segs.reduce((a, s) => a + s[1], 0) || 1;
  const r = size / 2 - 18, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  let off = 0, paths = "";
  segs.forEach(s => {
    const d = (s[1] / tot) * circ;
    paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s[2]}" stroke-width="24" stroke-dasharray="${d} ${circ - d}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dasharray .6s"/>`;
    off += d;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EEF0F2" stroke-width="24"/>${paths}<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="20" font-weight="900" fill="#0E1116">${tot}</text><text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="9.5" fill="#5A626B" font-weight="700">ACTAS</text></svg>`;
}

function barChart(items, colorFn) {
  if (!items.length) return '<div class="empty">Sin datos</div>';
  const mx = Math.max(...items.map(i => i[1]), 1);
  return '<div class="bars">' + items.map(([lb, v], i) => {
    const h = Math.max(Math.round((v / mx) * 170), 3);
    const col = colorFn ? colorFn(lb, i) : (i === 0 ? "#C8102E" : "#5A626B");
    return `<div class="bcol"><div class="val2">${v}</div><div class="bv" style="height:${h}px;background:${col}" title="${esc(lb)}: ${v}"></div><div class="lbl2">${esc(lb)}</div></div>`;
  }).join("") + "</div>";
}

function hbarChart(items, colorFn, fmt) {
  if (!items.length) return '<div class="empty">Sin datos</div>';
  const mx = Math.max(...items.map(i => i[1]), 1);
  fmt = fmt || (v => v);
  return items.map(([lb, v], i) => {
    const w = Math.max(Math.round((v / mx) * 100), 3);
    const col = colorFn ? colorFn(lb, i) : (i === 0 ? "#C8102E" : "#5A626B");
    return `<div class="hbar"><div class="hl">${esc(lb)}</div><div class="ht"><div class="hf" style="width:${w}%;background:${col}">${fmt(v)}</div></div></div>`;
  }).join("");
}

// ============================================================
// FILTROS UI
// ============================================================
function filtrosHTML(opts) {
  opts = opts || {};
  const meses = DATA.meses;
  const vends = DATA.vendedores;
  let html = '<div class="filters">';
  if (opts.mes !== false) {
    html += `<div class="fg"><label>Mes</label><select id="fMes" onchange="setFiltro('mes',this.value)">
      <option value="__TODOS__">Todos los meses</option>
      ${meses.map(m => `<option value="${m}" ${curFiltroMes === m ? "selected" : ""}>${m.charAt(0) + m.slice(1).toLowerCase()}</option>`).join("")}
    </select></div>`;
  }
  if (opts.vend !== false) {
    html += `<div class="fg"><label>Vendedor</label><select id="fVend" onchange="setFiltro('vend',this.value)">
      <option value="__TODOS__">Todos</option>
      ${vends.map(v => `<option value="${v}" ${curFiltroVend === v ? "selected" : ""}>${v}</option>`).join("")}
    </select></div>`;
  }
  if (opts.tipo !== false) {
    html += `<div class="fg"><label>Tipo de acta</label>
      <div class="chipbar">
        <button class="chip ${curFiltroTipo === '__TODOS__' ? 'active' : ''}" onclick="setFiltro('tipo','__TODOS__')">Todas</button>
        <button class="chip mant ${curFiltroTipo === 'mant' ? 'active' : ''}" onclick="setFiltro('tipo','mant')">🔧 Mantenimiento</button>
        <button class="chip nuevo ${curFiltroTipo === 'nuevo' ? 'active' : ''}" onclick="setFiltro('tipo','nuevo')">🆕 Cliente nuevo</button>
        <button class="chip varios ${curFiltroTipo === 'varios' ? 'active' : ''}" onclick="setFiltro('tipo','varios')">📌 Asuntos varios</button>
        <button class="chip ${curFiltroTipo === 'otro' ? 'active' : ''}" onclick="setFiltro('tipo','otro')" style="${curFiltroTipo==='otro'?'background:#F59E0B':''}">⚠️ Sin clasificar</button>
      </div></div>`;
  }
  if (opts.buscar !== false) {
    html += `<div class="fg grow searchbox"><label>Buscar</label><input id="fBusq" type="text" placeholder="Cliente, código, texto de acta…" value="${esc(curBusqueda)}" oninput="setFiltro('busq',this.value)"></div>`;
  }
  html += "</div>";
  return html;
}

function setFiltro(tipo, val) {
  if (tipo === "mes") curFiltroMes = val;
  else if (tipo === "vend") curFiltroVend = val;
  else if (tipo === "tipo") curFiltroTipo = val;
  else if (tipo === "busq") curBusqueda = val;
  renderPage();
  if (tipo === "busq") {
    const el = document.getElementById("fBusq");
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }
}

// ============================================================
// PÁGINA: RESUMEN
// ============================================================
function renderResumen() {
  const actas = actasFiltradas();
  const total = actas.length;
  const mant = actas.filter(a => a.tipo === "mant").length;
  const nuevo = actas.filter(a => a.tipo === "nuevo").length;
  const varios = actas.filter(a => a.tipo === "varios").length;
  const otro = actas.filter(a => a.tipo === "otro").length;
  const clientesUnicos = new Set(actas.map(a => a.cliente.toUpperCase())).size;
  const virtual = actas.filter(a => a.modalidad.toUpperCase().includes("VIRTUAL")).length;
  const presencial = total - virtual;

  const segsDonut = [
    ["Mantenimiento", mant, "#5A626B"],
    ["Cliente nuevo", nuevo, "#C8102E"],
    ["Asuntos varios", varios, "#2563EB"]
  ];
  if (otro > 0) segsDonut.push(["Sin clasificar", otro, "#F59E0B"]);
  const donut = donutSVG(segsDonut);

  const porVend = {};
  actas.forEach(a => { porVend[a.responsable] = (porVend[a.responsable] || 0) + 1; });
  const rankItems = Object.entries(porVend).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const porMes = {};
  DATA.meses.forEach(m => porMes[m] = 0);
  actas.forEach(a => { porMes[a.mes] = (porMes[a.mes] || 0) + 1; });
  const ordenMeses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  const mesesItems = ordenMeses.filter(m => porMes[m] !== undefined).map(m => [m.slice(0, 3), porMes[m]]);

  const comps = DATA.compromisos;
  const compAbiertos = comps.filter(c => !c.estado.includes("CONCLUIDO") && !c.estado.includes("CERRADO")).length;
  const compTotal = comps.length;

  const asigOblig = DATA.asignacion.filter(a => a.obligatoria);

  return `
    ${filtrosHTML()}
    <div class="kpis">
      ${kpiCard("Total de actas", total, `${clientesUnicos} clientes únicos`, "k", "📋")}
      ${kpiCard("Mantenimiento", mant, total ? pct(mant, total) + "% del total" : "—", "", "🔧")}
      ${kpiCard("Cliente nuevo", nuevo, total ? pct(nuevo, total) + "% del total" : "—", "v", "🆕")}
      ${kpiCard("Asuntos varios", varios, total ? pct(varios, total) + "% del total" : "—", "b", "📌")}
      ${kpiCard("Compromisos abiertos", compAbiertos, `de ${compTotal} registrados`, "a", "✅")}
    </div>
    <div class="grid2">
      <div class="card"><h3>Actividad por vendedor <span class="cnt">${rankItems.length} vendedores</span></h3>
        ${hbarChart(rankItems, (lb, i) => i === 0 ? "#C8102E" : "#5A626B")}
      </div>
      <div class="card"><h3>Distribución por tipo</h3>
        <div class="dn"><div>${donut}</div>
        <div class="leg">
          <div class="li"><span class="sw" style="background:#5A626B"></span>Mantenimiento <b>${mant}</b> <span class="pct">(${pct(mant, total)}%)</span></div>
          <div class="li"><span class="sw" style="background:#C8102E"></span>Cliente nuevo <b>${nuevo}</b> <span class="pct">(${pct(nuevo, total)}%)</span></div>
          <div class="li"><span class="sw" style="background:#2563EB"></span>Asuntos varios <b>${varios}</b> <span class="pct">(${pct(varios, total)}%)</span></div>
          ${otro > 0 ? `<div class="li"><span class="sw" style="background:#F59E0B"></span>Sin clasificar <b>${otro}</b> <span class="pct">(${pct(
