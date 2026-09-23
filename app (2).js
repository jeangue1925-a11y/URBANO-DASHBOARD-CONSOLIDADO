// ============================================================
// APP.JS — Urbano Envíos Dashboard (v2)
// ============================================================

let RAW = { actividades: [], compromisos: [], asignacion: [] };
let DATA = { actas: [], compromisos: [], asignacion: [], meses: [], vendedores: [] };
let curPage = "resumen";
let curFiltroMes = "__TODOS__";
let curFiltroVend = "__TODOS__";
let curFiltroTipo = "__TODOS__";
let curFiltroEstado = "__TODOS__";
let curFiltroVisita = "__TODOS__";
let curBusqueda = "";
let sortState = { col: null, dir: 1 };

const ORDEN_MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const COL = { mant: "#5A626B", nuevo: "#C8102E", varios: "#2563EB", otro: "#F59E0B" };

function mo(x) { return "$" + Math.round(x || 0).toLocaleString("en-US"); }
function pct(v, t) { return t ? Math.round((v / t) * 100) : 0; }
function esc(s) { return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function mesesOrdenados(lista) { return ORDEN_MESES.filter(m => lista.includes(m)); }

// Convierte texto de fecha (varios formatos posibles del CSV de Sheets) a objeto Date, o null.
function parseFechaFlexible(s) {
  s = limpiaTxt(s);
  if (!s) return null;
  // formato ISO: 2026-08-12 o 2026-08-12 00:00:00
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // formato dd/mm/yyyy o d/m/yyyy
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function diasEntre(desde, hasta) {
  if (!desde || !hasta) return null;
  const ms = hasta.setHours(0,0,0,0) - desde.setHours(0,0,0,0);
  return Math.round(ms / 86400000);
}
function hoySinHora() { const h = new Date(); h.setHours(0,0,0,0); return h; }

// ============================================================
// CARGA PRINCIPAL
// ============================================================
async function cargarTodo() {
  document.getElementById("loadingBox").classList.remove("hidden");
  document.getElementById("errorBox").classList.add("hidden");
  document.getElementById("content").classList.add("hidden");
  setStatus("Act", "load", "cargando…");
  setStatus("Comp", "load", "cargando…");
  setStatus("Asig", "load", "cargando…");

  const pActividades = fetchCSV(FUENTES.actividades.url)
    .then(r => { RAW.actividades = r; setStatus("Act", "ok", (r.length - 1) + " filas"); return true; })
    .catch(e => { setStatus("Act", "err", e.message); return false; });

  const pCompromisos = fetchCSV(FUENTES.compromisos.url)
    .then(r => {
      RAW.compromisos = r; setStatus("Comp", "ok", (r.length - 1) + " filas");
      procesarCompromisos();
      if (!document.getElementById("content").classList.contains("hidden")) renderPage();
    })
    .catch(e => { setStatus("Comp", "err", e.message); });

  const pAsignacion = fetchCSV(FUENTES.asignacion.url)
    .then(r => {
      RAW.asignacion = r; setStatus("Asig", "ok", (r.length - 1) + " filas");
      procesarAsignacion();
      if (!document.getElementById("content").classList.contains("hidden")) renderPage();
    })
    .catch(e => { setStatus("Asig", "err", e.message); });

  const huboActividades = await pActividades;

  if (!huboActividades) {
    document.getElementById("loadingBox").classList.add("hidden");
    document.getElementById("errorBox").classList.remove("hidden");
    document.getElementById("errorBox").innerHTML =
      "<b>No se pudieron cargar las Actividades.</b><br>Verifica que la URL en data.js sea la de publicación CSV y que la hoja siga publicada.";
    return;
  }

  procesarActividades();

  const ahora = new Date();
  const hora = ahora.toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" });
  document.getElementById("lastUpdate").textContent = hora;
  document.getElementById("footTime").textContent = hora;

  document.getElementById("loadingBox").classList.add("hidden");
  document.getElementById("content").classList.remove("hidden");
  renderPage();

  Promise.allSettled([pCompromisos, pAsignacion]);
}

function setStatus(key, level, msg) {
  const dot = document.getElementById("dot" + key);
  const txt = document.getElementById("stat" + key);
  if (dot) dot.className = "dot " + level;
  if (txt) txt.textContent = msg;
}

// ============================================================
// PROCESAMIENTO: ACTIVIDADES
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
      fechaSort: (limpiaTxt(r[iFecha]).match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || "",
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

    const estado = limpiaTxt(r[iEstado]).toUpperCase() || "PENDIENTE";
    const cerrado = estado.includes("CONCLUIDO") || estado.includes("CERRADO");
    const fEmision = parseFechaFlexible(r[iEmision]);
    const fCierre = parseFechaFlexible(r[iCierre]);

    // Días activo: si está cerrado, emisión -> cierre real. Si sigue abierto, emisión -> hoy (contador en vivo).
    let diasActivo = null, vencido = false;
    if (fEmision) {
      if (cerrado && fCierre) {
        diasActivo = diasEntre(new Date(fEmision), new Date(fCierre));
      } else if (!cerrado) {
        diasActivo = diasEntre(new Date(fEmision), hoySinHora());
        // si la fecha de cierre es una meta/límite y ya pasó sin cerrarse, se marca vencido
        if (fCierre && hoySinHora() > fCierre) vencido = true;
      }
    }

    compromisos.push({
      tipo: limpiaTxt(r[iTipo]) || "Sin tipo",
      gestion: limpiaTxt(r[iGestion]),
      observaciones: limpiaTxt(r[iObs]),
      depto: limpiaTxt(r[iDepto]) || "—",
      emision: limpiaTxt(r[iEmision]),
      estado: estado,
      cierre: limpiaTxt(r[iCierre]),
      cerrado: cerrado,
      diasActivo: diasActivo,
      vencido: vencido,
      solucion: limpiaTxt(r[iSolucion]),
      ejecutivo: normEjecutivoCompleto(r[iEjec]) || "Sin asignar",
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

  const colsMes = {};
  header.forEach((h, i) => { if (ORDEN_MESES.includes(h)) colsMes[h] = i; });

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
      ejecutivo: normEjecutivoCompleto(r[iEjec]),
      grupo: limpiaTxt(r[iGrupo]),
      estado: limpiaTxt(r[iEstado]),
      tipo: limpiaTxt(r[iTipo]),
      obligatoria: limpiaTxt(r[iOblig]).toUpperCase() === "SI" && !ship.toUpperCase().includes("ISOLATOT"),
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
  else if (curPage === "obligatorias") c.innerHTML = renderObligatoriasPage();
  else if (curPage === "vendedores") c.innerHTML = renderVendedoresPage();
  else if (curPage === "compromisos") c.innerHTML = renderCompromisosPage();
  else if (curPage === "clientes") c.innerHTML = renderClientesPage();
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
// GRÁFICOS
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

function gaugeSVG(pctVal, size, color) {
  size = size || 130;
  const r = size / 2 - 14, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const d = Math.min(Math.max(pctVal, 0), 100) / 100 * circ;
  const col = color || (pctVal >= 90 ? "#12B76A" : pctVal >= 60 ? "#F59E0B" : "#C8102E");
  return `<div class="gauge"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EEF0F2" stroke-width="14"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${d} ${circ - d}" transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dasharray .8s"/>
  </svg><div class="gval"><b>${pctVal}%</b><span>CUMPLIMIENTO</span></div></div>`;
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

// Línea de tendencia SVG (para evolución mensual, con puntos)
function lineChart(items, color, height) {
  if (!items.length) return '<div class="empty">Sin datos</div>';
  height = height || 160;
  const w = Math.max(items.length * 90, 300);
  const mx = Math.max(...items.map(i => i[1]), 1);
  const padTop = 24, padBot = 26, padX = 40;
  const usableH = height - padTop - padBot;
  const stepX = items.length > 1 ? (w - padX * 2) / (items.length - 1) : 0;
  const pts = items.map(([lb, v], i) => {
    const x = padX + i * stepX;
    const y = padTop + usableH - (v / mx) * usableH;
    return { x, y, lb, v };
  });
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x + " " + p.y).join(" ");
  const area = path + ` L${pts[pts.length - 1].x} ${padTop + usableH} L${pts[0].x} ${padTop + usableH} Z`;
  const dots = pts.map(p => `
    <circle class="lc-dot" cx="${p.x}" cy="${p.y}" r="4.5" fill="${color}" stroke="#fff" stroke-width="2"/>
    <text x="${p.x}" y="${p.y - 10}" text-anchor="middle" class="lc-tooltip">${p.v}</text>
    <text x="${p.x}" y="${height - 6}" text-anchor="middle" font-size="10" fill="#5A626B" font-weight="700">${esc(p.lb)}</text>
  `).join("");
  return `<div class="linechart"><svg width="${w}" height="${height}" viewBox="0 0 ${w} ${height}">
    <path d="${area}" fill="${color}" opacity="0.08"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>
    ${dots}
  </svg></div>`;
}

// Barras apiladas (mant/nuevo/varios) por mes
function stackedBarChart(mesesData) {
  if (!mesesData.length) return '<div class="empty">Sin datos</div>';
  const mx = Math.max(...mesesData.map(m => m.mant + m.nuevo + m.varios + m.otro), 1);
  const cols = mesesData.map(m => {
    const tot = m.mant + m.nuevo + m.varios + m.otro;
    const hMant = Math.round((m.mant / mx) * 170);
    const hNuevo = Math.round((m.nuevo / mx) * 170);
    const hVarios = Math.round((m.varios / mx) * 170);
    const hOtro = Math.round((m.otro / mx) * 170);
    return `<div class="stcol" title="${esc(m.lb)}: ${tot} actas">
      ${m.mant ? `<div class="seg" style="height:${hMant}px;background:${COL.mant}"></div>` : ""}
      ${m.nuevo ? `<div class="seg" style="height:${hNuevo}px;background:${COL.nuevo}"></div>` : ""}
      ${m.varios ? `<div class="seg" style="height:${hVarios}px;background:${COL.varios}"></div>` : ""}
      ${m.otro ? `<div class="seg" style="height:${hOtro}px;background:${COL.otro}"></div>` : ""}
    </div>`;
  }).join("");
  const labels = mesesData.map(m => `<div class="stl">${esc(m.lb)}</div>`).join("");
  return `<div class="stackbar">${cols}</div><div class="stlabels">${labels}</div>`;
}

// ============================================================
// GADGET: heatmap de actividad (últimos 35 días con datos)
// ============================================================
function heatmapActividad(actas) {
  const porFecha = {};
  actas.forEach(a => {
    if (!a.fechaSort) return;
    porFecha[a.fechaSort] = (porFecha[a.fechaSort] || 0) + 1;
  });
  const fechas = Object.keys(porFecha).sort();
  if (!fechas.length) return '<div class="empty">Sin fechas registradas</div>';
  const ultimas = fechas.slice(-35);
  const mx = Math.max(...ultimas.map(f => porFecha[f]), 1);
  function nivel(v) {
    if (!v) return "hm0";
    const r = v / mx;
    if (r > 0.75) return "hm4";
    if (r > 0.5) return "hm3";
    if (r > 0.25) return "hm2";
    return "hm1";
  }
  const celdas = ultimas.map(f => {
    const v = porFecha[f];
    const [y, m, d] = f.split("-");
    return `<div class="hmcell ${nivel(v)}" title="${d}/${m}: ${v} acta${v === 1 ? '' : 's'}"></div>`;
  }).join("");
  return `<div class="heatmap">${celdas}</div>
    <div class="hmleg"><span>Menos</span>
      <div class="hmcell hm0"></div><div class="hmcell hm1"></div><div class="hmcell hm2"></div><div class="hmcell hm3"></div><div class="hmcell hm4"></div>
    <span>Más</span></div>`;
}

// ============================================================
// GADGET: ranking con medallas (top 3 destacado)
// ============================================================
function podioRanking(items, sufijo) {
  sufijo = sufijo || "";
  if (!items.length) return '<div class="empty">Sin datos</div>';
  const medallas = ["🥇", "🥈", "🥉"];
  const top3 = items.slice(0, 3);
  const resto = items.slice(3, 8);
  const podio = top3.map(([lb, v], i) => `
    <div class="podio-item podio-${i+1}">
      <div class="podio-medal">${medallas[i]}</div>
      <div class="podio-val">${v}${sufijo}</div>
      <div class="podio-lbl">${esc(lb)}</div>
    </div>`).join("");
  const restoHtml = resto.length ? `<div class="podio-resto">${resto.map(([lb, v], i) =>
    `<div class="pr-row"><span class="pr-pos">${i+4}</span><span class="pr-lbl">${esc(lb)}</span><span class="pr-val">${v}${sufijo}</span></div>`
  ).join("")}</div>` : "";
  return `<div class="podio">${podio}</div>${restoHtml}`;
}

// ============================================================
// GADGET: comparador de tendencia (dos periodos, con flecha)
// ============================================================
function tendenciaCard(lbl, actual, anterior, sub) {
  const delta = actual - anterior;
  const deltaPct = anterior ? Math.round((delta / anterior) * 100) : (actual > 0 ? 100 : 0);
  const subiendo = delta > 0, bajando = delta < 0;
  const flecha = subiendo ? "▲" : (bajando ? "▼" : "▬");
  const color = subiendo ? "#12B76A" : (bajando ? "#C8102E" : "#B8BEC5");
  return `<div class="trend-card">
    <div class="trend-lbl">${esc(lbl)}</div>
    <div class="trend-row">
      <div class="trend-val">${actual}</div>
      <div class="trend-delta" style="color:${color}">${flecha} ${Math.abs(deltaPct)}%</div>
    </div>
    <div class="trend-sub">${esc(sub)}</div>
  </div>`;
}

// ============================================================
// FILTROS UI
// ============================================================
function filtrosHTML(opts) {
  opts = opts || {};
  const meses = mesesOrdenados(DATA.meses);
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
  if (opts.estado) {
    html += `<div class="fg"><label>Estado compromiso</label><select id="fEstado" onchange="setFiltro('estado',this.value)">
      <option value="__TODOS__">Todos</option>
      <option value="ABIERTO" ${curFiltroEstado==='ABIERTO'?'selected':''}>Abiertos</option>
      <option value="PROCESO" ${curFiltroEstado==='PROCESO'?'selected':''}>En proceso</option>
      <option value="CONCLUIDO" ${curFiltroEstado==='CONCLUIDO'?'selected':''}>Concluidos</option>
    </select></div>`;
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
  else if (tipo === "estado") curFiltroEstado = val;
  else if (tipo === "visita") curFiltroVisita = val;
  else if (tipo === "busq") curBusqueda = val;
  renderPage();
  if (tipo === "busq") {
    const el = document.getElementById("fBusq");
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }
}

function kpiCard(lbl, val, sub, cls, ic) {
  return `<div class="kpi ${cls || ''}"><span class="ic">${ic || ''}</span><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
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

  const segsDonut = [["Mantenimiento", mant, COL.mant], ["Cliente nuevo", nuevo, COL.nuevo], ["Asuntos varios", varios, COL.varios]];
  if (otro > 0) segsDonut.push(["Sin clasificar", otro, COL.otro]);
  const donut = donutSVG(segsDonut);

  const porVend = {};
  actas.forEach(a => { porVend[a.responsable] = (porVend[a.responsable] || 0) + 1; });
  const rankItems = Object.entries(porVend).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // stacked por mes
  const mesesOrd = mesesOrdenados(DATA.meses);
  const stackData = mesesOrd.map(m => {
    const deMes = actas.filter(a => a.mes === m);
    return {
      lb: m.slice(0, 3),
      mant: deMes.filter(a => a.tipo === "mant").length,
      nuevo: deMes.filter(a => a.tipo === "nuevo").length,
      varios: deMes.filter(a => a.tipo === "varios").length,
      otro: deMes.filter(a => a.tipo === "otro").length
    };
  });
  const lineItems = mesesOrd.map(m => [m.slice(0, 3), actas.filter(a => a.mes === m).length]);

  // KPIs de asignación / obligatorias
  const asigOblig = DATA.asignacion.filter(a => a.obligatoria);
  const mesActual = mesesOrd[mesesOrd.length - 1];
  const visitadas = asigOblig.filter(a => a.visitas[mesActual] === "VISITADO").length;
  const pctVisitas = pct(visitadas, asigOblig.length);

  // compromisos
  const comps = DATA.compromisos;
  const compConcluidos = comps.filter(c => c.estado.includes("CONCLUIDO") || c.estado.includes("CERRADO")).length;
  const compAbiertos = comps.length - compConcluidos;

  // promedio actas por día hábil aproximado (asumimos ~22 días hábiles/mes)
  const promDia = mesesOrd.length ? Math.round((total / (mesesOrd.length * 22)) * 10) / 10 : 0;

  // top 5 clientes con más actas (posible indicador de atención/riesgo)
  const porCliente = {};
  actas.forEach(a => { const k = a.cliente.toUpperCase(); porCliente[k] = (porCliente[k] || 0) + 1; });
  const topClientes = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // tendencia semanal (últimos 7 días con datos vs los 7 anteriores)
  const fechasOrdenadas = Array.from(new Set(actas.map(a => a.fechaSort).filter(Boolean))).sort();
  const hoyStr = fechasOrdenadas[fechasOrdenadas.length - 1];
  function actasEnRango(desdeIdx, hastaIdx) {
    const ventana = fechasOrdenadas.slice(desdeIdx, hastaIdx);
    return actas.filter(a => ventana.includes(a.fechaSort)).length;
  }
  const semActual = actasEnRango(Math.max(0, fechasOrdenadas.length - 7), fechasOrdenadas.length);
  const semAnterior = actasEnRango(Math.max(0, fechasOrdenadas.length - 14), Math.max(0, fechasOrdenadas.length - 7));
  const compSemActual = DATA.compromisos.filter(c => c.estado.includes("CONCLUIDO") || c.estado.includes("CERRADO")).length;

  return `
    ${filtrosHTML()}
    <div class="kpis">
      ${kpiCard("Total de actas", total, `${clientesUnicos} clientes únicos`, "k", "📋")}
      ${kpiCard("Mantenimiento", mant, total ? pct(mant, total) + "% del total" : "—", "", "🔧")}
      ${kpiCard("Cliente nuevo", nuevo, total ? pct(nuevo, total) + "% del total" : "—", "v", "🆕")}
      ${kpiCard("Asuntos varios", varios, total ? pct(varios, total) + "% del total" : "—", "b", "📌")}
      ${kpiCard("Promedio diario", promDia, "actas por día hábil", "m", "📆")}
    </div>
    <div class="kpis">
      ${kpiCard("Cuentas obligatorias", asigOblig.length, `${visitadas} visitadas este mes`, "", "⭐")}
      ${kpiCard("Compromisos abiertos", compAbiertos, `de ${comps.length} registrados`, "a", "⏳")}
      ${kpiCard("Compromisos concluidos", compConcluidos, comps.length ? pct(compConcluidos, comps.length) + "% del total" : "—", "v", "✅")}
      ${kpiCard("Modalidad presencial", presencial, total ? pct(presencial, total) + "% de las visitas" : "—", "b", "🚗")}
    </div>

    <div class="card"><h3>Tendencia semanal <span class="cnt">últimos 7 días vs anteriores</span></h3>
      <div class="trend-row-wrap">
        ${tendenciaCard("Actas esta semana", semActual, semAnterior, `semana previa: ${semAnterior}`)}
        ${tendenciaCard("Cumplimiento obligatorias", pctVisitas, 0, `${visitadas} de ${asigOblig.length} visitadas`)}
        ${tendenciaCard("Compromisos resueltos", compConcluidos, comps.length - compConcluidos, `${compAbiertos} siguen abiertos`)}
      </div>
    </div>

    <div class="grid2">
      <div class="card"><h3>Cumplimiento de visitas obligatorias <span class="cnt">${mesActual ? mesActual.charAt(0)+mesActual.slice(1).toLowerCase() : ""}</span></h3>
        <div class="gauge-wrap">
          ${gaugeSVG(pctVisitas, 150)}
          <div style="flex:1;min-width:160px">
            <div class="miniStat"><span class="msDot" style="background:#12B76A"></span><span class="msLbl">Visitadas</span><span class="msVal">${visitadas}</span></div>
            <div class="miniStat"><span class="msDot" style="background:#F59E0B"></span><span class="msLbl">Pendientes</span><span class="msVal">${asigOblig.length - visitadas}</span></div>
            <div class="miniStat"><span class="msDot" style="background:#B8BEC5"></span><span class="msLbl">Total obligatorias</span><span class="msVal">${asigOblig.length}</span></div>
          </div>
        </div>
      </div>
      <div class="card"><h3>Distribución por tipo</h3>
        <div class="dn"><div>${donut}</div>
        <div class="leg">
          <div class="li"><span class="sw" style="background:${COL.mant}"></span>Mantenimiento <b>${mant}</b> <span class="pct">(${pct(mant, total)}%)</span></div>
          <div class="li"><span class="sw" style="background:${COL.nuevo}"></span>Cliente nuevo <b>${nuevo}</b> <span class="pct">(${pct(nuevo, total)}%)</span></div>
          <div class="li"><span class="sw" style="background:${COL.varios}"></span>Asuntos varios <b>${varios}</b> <span class="pct">(${pct(varios, total)}%)</span></div>
          ${otro > 0 ? `<div class="li"><span class="sw" style="background:${COL.otro}"></span>Sin clasificar <b>${otro}</b> <span class="pct">(${pct(otro, total)}%)</span></div>` : ""}
        </div></div>
        ${otro > 0 ? `<div class="insight a"><b>${otro} actas sin clasificar.</b> Revisa la columna "Tipo de visita" en tu Sheets.</div>` : ""}
      </div>
    </div>

    <div class="card"><h3>Actividad diaria <span class="cnt">últimos días registrados</span></h3>
      ${heatmapActividad(actas)}
    </div>

    <div class="card"><h3>Evolución mensual de actas</h3>${lineChart(lineItems, "#C8102E")}</div>
    <div class="card"><h3>Podio de vendedores <span class="cnt">${rankItems.length} activos</span></h3>
      ${podioRanking(rankItems, "")}
    </div>
    <div class="card"><h3>Composición mensual por tipo</h3>
      ${stackedBarChart(stackData)}
      <div class="leg" style="flex-direction:row;flex-wrap:wrap;gap:14px;margin-top:14px;justify-content:center">
        <div class="li"><span class="sw" style="background:${COL.mant}"></span>Mantenimiento</div>
        <div class="li"><span class="sw" style="background:${COL.nuevo}"></span>Cliente nuevo</div>
        <div class="li"><span class="sw" style="background:${COL.varios}"></span>Asuntos varios</div>
      </div>
    </div>
    <div class="card"><h3>Clientes con más atención <span class="cnt">Top 5</span></h3>
      ${hbarChart(topClientes, () => "#2563EB")}
      <div class="insight b">Alta frecuencia de actas puede indicar un cliente estratégico o en riesgo. Revísalo en la pestaña Clientes.</div>
    </div>
    <div class="card"><h3>Cuentas obligatorias <span class="cnt">${asigOblig.length} cuentas</span></h3>
      ${renderTablaObligatorias(asigOblig, mesActual)}
    </div>
  `;
}

function renderTablaObligatorias(list, mesActual) {
  if (!list.length) return '<div class="empty">Sin datos de asignación cargados (verifica la URL de "Asignación de clientes")</div>';
  const rows = list.slice(0, 30).map(a => {
    const vis = a.visitas[mesActual] || "—";
    const pillClass = vis === "VISITADO" ? "verde" : (vis === "PENDIENTE" ? "ambar" : "g");
    return `<tr><td class="cod">${esc(a.cod)}</td><td class="nm">${esc(a.shipper)}</td><td>${esc(a.ejecutivo)}</td><td class="ce">${esc(a.tipo)}</td><td class="ce"><span class="pill ${pillClass}">${esc(vis)}</span></td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Cód.</th><th>Shipper</th><th>Ejecutivo</th><th>Tipo</th><th>Visita ${mesActual ? "(" + mesActual.slice(0,3) + ")" : ""}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ============================================================
// PÁGINA DEDICADA: OBLIGATORIAS (con filtros propios)
// ============================================================
function obligatoriasFiltradas() {
  const mesActual = mesesOrdenados(DATA.meses).slice(-1)[0];
  return DATA.asignacion.filter(a => {
    if (!a.obligatoria) return false;
    if (curFiltroVend !== "__TODOS__" && a.ejecutivo !== curFiltroVend) return false;
    const vis = a.visitas[mesActual] || "—";
    if (curFiltroVisita !== "__TODOS__" && vis !== curFiltroVisita) return false;
    if (curBusqueda) {
      const q = curBusqueda.toLowerCase();
      if (!(a.shipper.toLowerCase().includes(q) || a.cod.toLowerCase().includes(q) || a.ejecutivo.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

function filtrosObligatoriasHTML() {
  const vends = DATA.vendedores;
  return `<div class="filters">
    <div class="fg"><label>Ejecutivo</label><select onchange="setFiltro('vend',this.value)">
      <option value="__TODOS__">Todos</option>
      ${vends.map(v => `<option value="${v}" ${curFiltroVend === v ? "selected" : ""}>${v}</option>`).join("")}
    </select></div>
    <div class="fg"><label>Estado de visita</label>
      <div class="chipbar">
        <button class="chip ${curFiltroVisita === '__TODOS__' ? 'active' : ''}" onclick="setFiltro('visita','__TODOS__')">Todas</button>
        <button class="chip ${curFiltroVisita === 'VISITADO' ? 'active' : ''}" onclick="setFiltro('visita','VISITADO')" style="${curFiltroVisita==='VISITADO'?'background:#12B76A':''}">✅ Visitado</button>
        <button class="chip ${curFiltroVisita === 'PENDIENTE' ? 'active' : ''}" onclick="setFiltro('visita','PENDIENTE')" style="${curFiltroVisita==='PENDIENTE'?'background:#F59E0B':''}">⏳ Pendiente</button>
      </div></div>
    <div class="fg grow searchbox"><label>Buscar cliente</label><input id="fBusq" type="text" placeholder="Cliente, código, ejecutivo…" value="${esc(curBusqueda)}" oninput="setFiltro('busq',this.value)"></div>
  </div>`;
}

function renderObligatoriasPage() {
  const mesActual = mesesOrdenados(DATA.meses).slice(-1)[0];
  const todasOblig = DATA.asignacion.filter(a => a.obligatoria);
  const visitadas = todasOblig.filter(a => a.visitas[mesActual] === "VISITADO").length;
  const pendientes = todasOblig.length - visitadas;
  const pctVis = pct(visitadas, todasOblig.length);

  const porEjec = {};
  todasOblig.forEach(a => {
    if (!porEjec[a.ejecutivo]) porEjec[a.ejecutivo] = { total: 0, visitadas: 0 };
    porEjec[a.ejecutivo].total++;
    if (a.visitas[mesActual] === "VISITADO") porEjec[a.ejecutivo].visitadas++;
  });
  const rankEjec = Object.entries(porEjec).map(([e, d]) => [e, pct(d.visitadas, d.total)]).sort((a, b) => b[1] - a[1]);

  const lista = obligatoriasFiltradas();
  const rows = lista.map((a, i) => {
    const vis = a.visitas[mesActual] || "—";
    const cls = vis === "VISITADO" ? "verde" : (vis === "PENDIENTE" ? "ambar" : "g");
    return `<tr><td class="rk">${i + 1}</td><td class="cod">${esc(a.cod)}</td><td class="nm">${esc(a.shipper)}</td><td>${esc(a.ejecutivo)}</td><td>${esc(a.grupo)}</td><td class="ce">${esc(a.tipo)}</td><td class="ce"><span class="pill ${cls}">${esc(vis)}</span></td></tr>`;
  }).join("");

  return `
    <div class="kpis">
      ${kpiCard("Cuentas obligatorias", todasOblig.length, "cartera prioritaria total", "k", "⭐")}
      ${kpiCard("Visitadas", visitadas, `este mes (${mesActual ? mesActual.slice(0,3) : ''})`, "v", "✅")}
      ${kpiCard("Pendientes", pendientes, "por visitar este mes", "a", "⏳")}
      ${kpiCard("Cumplimiento", pctVis + "%", "del total de obligatorias", "m", "📊")}
    </div>
    <div class="grid2">
      <div class="card"><h3>Cumplimiento global</h3>
        <div class="gauge-wrap">${gaugeSVG(pctVis,160)}
          <div style="flex:1;min-width:160px">
            <div class="miniStat"><span class="msDot" style="background:#12B76A"></span><span class="msLbl">Visitadas</span><span class="msVal">${visitadas}</span></div>
            <div class="miniStat"><span class="msDot" style="background:#F59E0B"></span><span class="msLbl">Pendientes</span><span class="msVal">${pendientes}</span></div>
          </div>
        </div>
      </div>
      <div class="card"><h3>Cumplimiento por ejecutivo</h3>${hbarChart(rankEjec,(lb,i)=>rankEjec[i][1]>=90?"#12B76A":rankEjec[i][1]>=60?"#F59E0B":"#C8102E",v=>v+"%")}</div>
    </div>
    ${filtrosObligatoriasHTML()}
    <div class="card"><h3>Listado de cuentas con visita obligatoria <span class="cnt">${lista.length} de ${todasOblig.length}</span></h3>
      <table><thead><tr><th></th><th>Cód.</th><th>Shipper</th><th>Ejecutivo</th><th>Grupo</th><th class="ce">Tipo</th><th class="ce">Visita (${mesActual?mesActual.slice(0,3):''})</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="empty">Sin resultados con estos filtros</td></tr>'}</tbody></table>
    </div>
  `;
}

// ============================================================
// PÁGINA: ACTAS
// ============================================================
function renderActasPage() {
  const actas = actasFiltradas().slice().reverse();

  const cards = actas.slice(0, 200).map((a) => {
    const idx = DATA.actas.indexOf(a);
    const camposConContenido = Object.entries(a.campos).filter(([k, v]) => !esVacio(v));
    const tipoCls = a.tipo === "mant" ? "g" : (a.tipo === "nuevo" ? "rojo" : (a.tipo === "varios" ? "azul" : "ambar"));
    return `
      <div class="acta-card">
        <div class="acta-head" onclick="toggleActa(${idx})">
          <div class="ah-l">
            <span class="chev" id="chev${idx}">▶</span>
            <span class="ah-cli">${esc(a.cliente)}</span>
            <span class="pill ${tipoCls}">${esc(a.tipoRaw)}</span>
            <span class="pill g">${esc(a.responsable)}</span>
          </div>
          <div class="ah-meta">${esc(a.fecha)} ${a.hora ? "· " + esc(a.hora) : ""} · ${esc(a.modalidad)} · ${esc(a.mes)}</div>
        </div>
        <div class="acta-body" id="body${idx}">
          ${a.participantes ? `<div class="af-item"><span class="af-lbl">👥 Participantes</span><div class="af-txt">${esc(a.participantes)}</div></div>` : ""}
          ${camposConContenido.map(([k, v]) => `<div class="af-item"><span class="af-lbl">${esc(k)}</span><div class="af-txt">${esc(v)}</div></div>`).join("")}
          ${!camposConContenido.length && !a.participantes ? '<div class="af-item"><span class="af-txt" style="color:#B8BEC5">Sin contenido adicional registrado en esta acta.</span></div>' : ""}
        </div>
      </div>`;
  }).join("");

  const totalF = actasFiltradas().length;
  const nota = totalF > 200 ? `<div class="insight b"><b>Mostrando 200 de ${totalF} actas.</b> Usa los filtros o el buscador para acotar el resultado.</div>` : "";

  return `
    ${filtrosHTML()}
    <div class="card"><h3>Actas registradas <span class="cnt">${totalF} resultados</span></h3>
      <p style="font-size:12.5px;color:#5A626B;margin-bottom:14px">Toca cualquier acta para expandir y ver todo su contenido: participantes, ventas, KPIs, facturación, cobranza, cobertura, capacitación y observaciones.</p>
      ${nota}
      ${cards || '<div class="empty">No hay actas que coincidan con los filtros.</div>'}
    </div>
  `;
}

function toggleActa(idx) {
  const body = document.getElementById("body" + idx);
  const chev = document.getElementById("chev" + idx);
  const open = body.classList.contains("open");
  if (open) { body.classList.remove("open"); chev.classList.remove("open"); }
  else { body.classList.add("open"); chev.classList.add("open"); }
}

// ============================================================
// PÁGINA: VENDEDORES
// ============================================================
function renderVendedoresPage() {
  const actas = actasFiltradas();
  const porVend = {};
  DATA.vendedores.forEach(v => porVend[v] = { total: 0, mant: 0, nuevo: 0, varios: 0, otro: 0, clientes: new Set() });
  actas.forEach(a => {
    if (!porVend[a.responsable]) porVend[a.responsable] = { total: 0, mant: 0, nuevo: 0, varios: 0, otro: 0, clientes: new Set() };
    const p = porVend[a.responsable];
    p.total++; p[a.tipo] = (p[a.tipo] || 0) + 1; p.clientes.add(a.cliente.toUpperCase());
  });

  const activos = Object.entries(porVend).filter(([v, d]) => d.total > 0);
  const filas = activos.sort((a, b) => b[1].total - a[1].total)
    .map(([v, d]) => `<tr class="rowclick" onclick="setFiltro('vend','${esc(v)}');nav('actas',Array.from(document.querySelectorAll('.tab')).find(t=>t.textContent.includes('Actas')))">
      <td class="nm">${esc(v)}</td><td class="ce">${d.total}</td><td class="ce">${d.mant || 0}</td>
      <td class="ce">${d.nuevo || 0}</td><td class="ce">${d.varios || 0}</td><td class="ce">${d.clientes.size}</td>
      <td class="ce">${d.total ? Math.round((d.mant/d.total)*100) : 0}%</td>
    </tr>`).join("");

  const rankItems = activos.map(([v, d]) => [v, d.total]).sort((a, b) => b[1] - a[1]);
  const promedioGeneral = activos.length ? Math.round(activos.reduce((s, [, d]) => s + d.total, 0) / activos.length) : 0;
  const maxVend = rankItems[0] || ["—", 0];
  const minVend = rankItems[rankItems.length - 1] || ["—", 0];

  return `
    ${filtrosHTML({ vend: false })}
    <div class="kpis">
      ${kpiCard("Vendedores activos", activos.length, "con actas en el filtro", "k", "👥")}
      ${kpiCard("Promedio por vendedor", promedioGeneral, "actas en el periodo", "", "📊")}
      ${kpiCard("Mayor actividad", maxVend[1], esc(maxVend[0]), "v", "🏆")}
      ${kpiCard("Menor actividad", minVend[1], esc(minVend[0]), "a", "🔻")}
    </div>
    <div class="card"><h3>Volumen de actas por vendedor</h3>${barChart(rankItems, () => "#C8102E")}</div>
    <div class="card"><h3>Detalle por vendedor <span class="cnt">${activos.length} activos</span></h3>
      <table><thead><tr><th>Vendedor</th><th class="ce">Total actas</th><th class="ce">Mantenim.</th><th class="ce">Cliente nuevo</th><th class="ce">Asuntos varios</th><th class="ce">Clientes únicos</th><th class="ce">% Mantenim.</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="7" class="empty">Sin datos</td></tr>'}</tbody></table>
      <div class="insight">Toca una fila para ver todas las actas de ese vendedor.</div>
    </div>
  `;
}

// ============================================================
// PÁGINA: COMPROMISOS
// ============================================================
function renderCompromisosPage() {
  const comps = DATA.compromisos.filter(c => {
    if (curFiltroMes !== "__TODOS__" && c.mes !== curFiltroMes) return false;
    if (curFiltroVend !== "__TODOS__" && c.ejecutivo !== curFiltroVend) return false;
    if (curFiltroEstado !== "__TODOS__") {
      const esConcluido = c.estado.includes("CONCLUIDO") || c.estado.includes("CERRADO");
      const esProceso = c.estado.includes("PROCESO");
      if (curFiltroEstado === "CONCLUIDO" && !esConcluido) return false;
      if (curFiltroEstado === "PROCESO" && !esProceso) return false;
      if (curFiltroEstado === "ABIERTO" && (esConcluido || esProceso)) return false;
    }
    if (curBusqueda) {
      const q = curBusqueda.toLowerCase();
      if (!(c.shipper.toLowerCase().includes(q) || c.tipo.toLowerCase().includes(q) || c.observaciones.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  if (!DATA.compromisos.length) {
    return `<div class="card"><div class="empty">No se han cargado compromisos todavía.<br>Verifica que la URL de "Consolidado compromisos" esté configurada en <code>data.js</code>.</div></div>`;
  }

  const concluidos = comps.filter(c => c.estado.includes("CONCLUIDO") || c.estado.includes("CERRADO")).length;
  const enProceso = comps.filter(c => c.estado.includes("PROCESO")).length;
  const abiertos = comps.length - concluidos - enProceso;
  const vencidos = comps.filter(c => c.vencido).length;
  const gaugeComp = gaugeSVG(pct(concluidos, comps.length), 130, "#12B76A");

  const cerradosConDias = comps.filter(c => c.cerrado && c.diasActivo !== null);
  const promedioDiasCierre = cerradosConDias.length
    ? Math.round(cerradosConDias.reduce((s, c) => s + c.diasActivo, 0) / cerradosConDias.length)
    : null;

  const porTipo = {};
  comps.forEach(c => porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1);
  const tipoItems = Object.entries(porTipo).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const porDepto = {};
  comps.forEach(c => porDepto[c.depto] = (porDepto[c.depto] || 0) + 1);
  const deptoItems = Object.entries(porDepto).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const rows = comps.slice(0, 150)
    .sort((a, b) => (b.vencido - a.vencido) || ((b.diasActivo||0) - (a.diasActivo||0)))
    .map(c => {
    const cls = c.estado.includes("CONCLUIDO") || c.estado.includes("CERRADO") ? "verde" : (c.estado.includes("PROCESO") ? "ambar" : "rojo");
    let diasHtml = "—";
    if (c.diasActivo !== null) {
      if (c.cerrado) {
        diasHtml = `<span class="pill verde">${c.diasActivo} d.</span>`;
      } else if (c.vencido) {
        diasHtml = `<span class="pill rojo">⚠️ ${c.diasActivo} d.</span>`;
      } else {
        diasHtml = `<span class="pill ambar">${c.diasActivo} d.</span>`;
      }
    }
    return `<tr><td class="nm">${esc(c.shipper)}</td><td>${esc(c.tipo)}</td><td>${esc(c.ejecutivo)}</td><td class="ce">${esc(c.emision)||"—"}</td><td class="ce">${c.cerrado ? esc(c.cierre)||"—" : (c.cierre ? esc(c.cierre)+" (meta)" : "—")}</td><td class="ce">${diasHtml}</td><td class="ce"><span class="pill ${cls}">${esc(c.estado)}</span></td><td style="max-width:220px;font-size:11.5px;color:#5A626B">${esc(c.observaciones.slice(0,100))}${c.observaciones.length>100?'…':''}</td></tr>`;
  }).join("");

  return `
    ${filtrosHTML({ tipo: false, estado: true })}
    <div class="kpis">
      ${kpiCard("Total compromisos", comps.length, "en el filtro actual", "k", "✅")}
      ${kpiCard("Concluidos", concluidos, pct(concluidos, comps.length) + "% del total", "v", "✔️")}
      ${kpiCard("En proceso", enProceso, pct(enProceso, comps.length) + "% del total", "a", "🔄")}
      ${kpiCard("Abiertos", abiertos, pct(abiertos, comps.length) + "% del total", "", "⏳")}
    </div>
    <div class="kpis">
      ${kpiCard("Vencidos", vencidos, "abiertos y pasados de la fecha meta", "", "🚨")}
      ${kpiCard("Promedio días de cierre", promedioDiasCierre !== null ? promedioDiasCierre : "—", "de emisión a cierre real", "v", "⏱️")}
    </div>
    <div class="grid2">
      <div class="card"><h3>Tasa de resolución</h3>
        <div class="gauge-wrap">${gaugeComp}
          <div style="flex:1;min-width:160px">
            <div class="miniStat"><span class="msDot" style="background:#12B76A"></span><span class="msLbl">Concluidos</span><span class="msVal">${concluidos}</span></div>
            <div class="miniStat"><span class="msDot" style="background:#F59E0B"></span><span class="msLbl">En proceso</span><span class="msVal">${enProceso}</span></div>
            <div class="miniStat"><span class="msDot" style="background:#C8102E"></span><span class="msLbl">Abiertos</span><span class="msVal">${abiertos}</span></div>
            <div class="miniStat"><span class="msDot" style="background:#9B0C22"></span><span class="msLbl">Vencidos</span><span class="msVal">${vencidos}</span></div>
          </div>
        </div>
      </div>
      <div class="card"><h3>Por departamento responsable</h3>${hbarChart(deptoItems, () => "#7C3AED")}</div>
    </div>
    <div class="card"><h3>Compromisos por tipo</h3>${hbarChart(tipoItems, () => "#2563EB")}</div>
    <div class="card"><h3>Detalle de compromisos <span class="cnt">${comps.length} resultados</span></h3>
      <p style="font-size:12px;color:#5A626B;margin-bottom:10px">El contador de días muestra: para compromisos <b>cerrados</b>, los días entre emisión y cierre real. Para compromisos <b>abiertos</b>, los días transcurridos desde la emisión hasta hoy — se marcan en rojo ⚠️ si ya pasaron la fecha meta.</p>
      <table><thead><tr><th>Shipper</th><th>Tipo</th><th>Ejecutivo</th><th class="ce">Emisión</th><th class="ce">Cierre</th><th class="ce">Días</th><th class="ce">Estado</th><th>Observaciones</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="empty">Sin resultados</td></tr>'}</tbody></table>
      ${comps.length > 150 ? `<div class="insight b">Mostrando 150 de ${comps.length}. Usa el buscador para acotar.</div>` : ""}
    </div>
  `;
}

// ============================================================
// PÁGINA: CLIENTES
// ============================================================
function renderClientesPage() {
  const actas = actasFiltradas();
  const porCliente = {};
  actas.forEach(a => {
    const key = a.cliente.toUpperCase();
    if (!porCliente[key]) porCliente[key] = { nombre: a.cliente, total: 0, mant: 0, nuevo: 0, varios: 0, vendedores: new Set(), actas: [] };
    const p = porCliente[key];
    p.total++; p[a.tipo] = (p[a.tipo] || 0) + 1; p.vendedores.add(a.responsable);
    p.actas.push(a);
  });

  const asigMap = {};
  DATA.asignacion.forEach(a => { asigMap[a.shipper.toUpperCase()] = a; });

  let list = Object.values(porCliente).sort((a, b) => b.total - a.total);
  if (curBusqueda) {
    const q = curBusqueda.toLowerCase();
    list = list.filter(c => c.nombre.toLowerCase().includes(q));
  }
  if (sortState.col) {
    list.sort((a, b) => {
      let x, y;
      if (sortState.col === "nombre") { x = a.nombre; y = b.nombre; }
      else { x = a[sortState.col] || 0; y = b[sortState.col] || 0; }
      return (x > y ? 1 : x < y ? -1 : 0) * sortState.dir;
    });
  }

  const obligatorios = list.filter(c => { const a = asigMap[c.nombre.toUpperCase()]; return a && a.obligatoria; }).length;

  const rows = list.slice(0, 150).map((c, i) => {
    const asig = asigMap[c.nombre.toUpperCase()];
    const key = c.nombre.replace(/'/g, "\\'");
    return `<tr class="rowclick" onclick="setFiltro('busq','${esc(key)}');nav('actas',Array.from(document.querySelectorAll('.tab')).find(t=>t.textContent.includes('Actas')))">
      <td class="rk">${i + 1}</td>
      <td class="nm">${esc(c.nombre)}</td>
      <td class="ce">${c.total}</td>
      <td class="ce">${c.mant || 0}</td>
      <td class="ce">${c.nuevo || 0}</td>
      <td class="ce">${c.varios || 0}</td>
      <td>${Array.from(c.vendedores).join(", ")}</td>
      <td class="ce">${asig ? (asig.obligatoria ? '<span class="pill rojo">Obligatoria</span>' : '<span class="pill g">Normal</span>') : '<span class="pill g">—</span>'}</td>
    </tr>`;
  }).join("");

  return `
    ${filtrosHTML({ vend: false, tipo: false })}
    <div class="kpis">
      ${kpiCard("Clientes únicos", list.length, "con al menos un acta", "k", "🏢")}
      ${kpiCard("Cuentas obligatorias", obligatorios, "dentro de este listado", "", "⭐")}
      ${kpiCard("Promedio de actas", list.length ? Math.round(list.reduce((s,c)=>s+c.total,0)/list.length*10)/10 : 0, "por cliente", "v", "📊")}
    </div>
    <div class="card"><h3>Clientes con más actas <span class="cnt">${list.length} clientes únicos</span></h3>
      <p style="font-size:12.5px;color:#5A626B;margin-bottom:12px">Toca un cliente para ver el detalle completo de sus actas.</p>
      <table><thead><tr>
        <th></th>
        <th onclick="sortClientes('nombre')">Cliente <span class="arrow">↕</span></th>
        <th class="ce" onclick="sortClientes('total')">Actas <span class="arrow">↕</span></th>
        <th class="ce">Mant.</th><th class="ce">Nuevo</th><th class="ce">Varios</th>
        <th>Vendedor(es)</th><th class="ce">Cuenta</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="8" class="empty">Sin resultados</td></tr>'}</tbody></table>
    </div>
  `;
}
function sortClientes(col) {
  if (sortState.col === col) sortState.dir *= -1; else { sortState.col = col; sortState.dir = -1; }
  renderPage();
}

// ============================================================
// INIT
// ============================================================
window.addEventListener("DOMContentLoaded", () => { cargarTodo(); });
