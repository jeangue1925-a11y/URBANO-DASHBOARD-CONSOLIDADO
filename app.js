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

async function cargarTodo(forzado) {
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
    .then(r => { RAW.compromisos = r; setStatus("Comp", "ok", (r.length - 1) + " filas"); procesarCompromisos(); if (!document.getElementById("content").classList.contains("hidden")) renderPage(); })
    .catch(e => { setStatus("Comp", "err", e.message); });

  const pAsignacion = fetchCSV(FUENTES.asignacion.url)
    .then(r => { RAW.asignacion = r; setStatus("Asig", "ok", (r.length - 1) + " filas"); procesarAsignacion(); if (!document.getElementById("content").classList.contains("hidden")) renderPage(); })
    .catch(e => { setStatus("Asig", "err", e.message); });

  const huboActividades = await pActividades;

  if (!huboActividades) {
    document.getElementById("loadingBox").classList.add("hidden");
    document.getElementById("errorBox").classList.remove("hidden");
    document.getElementById("errorBox").innerHTML =
      "<b>No se pudieron cargar las Actividades.</b><br>Verifica que la URL en data.js sea la de publicación CSV (Archivo → Compartir → Publicar en la web → CSV) y que la hoja siga publicada.";
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
  dot.className = "dot " + level;
  txt.textContent = msg;
}

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
          ${otro > 0 ? `<div class="li"><span class="sw" style="background:#F59E0B"></span>Sin clasificar <b>${otro}</b> <span class="pct">(${pct(otro, total)}%)</span></div>` : ""}
        </div></div>
        ${otro > 0 ? `<div class="insight a"><b>${otro} actas sin clasificar.</b> Su columna "Tipo de visita" en Google Sheets tiene un valor distinto a "Mantenimiento", "Cliente nuevo" o "Asuntos varios" (puede estar vacía o mal escrita). Revísala en la pestaña Actas usando el filtro de búsqueda.</div>` : ""}
      </div>
    </div>
    <div class="grid2">
      <div class="card"><h3>Evolución mensual de actas</h3>${barChart(mesesItems, () => "#C8102E")}</div>
      <div class="card"><h3>Modalidad de reunión</h3>
        <div class="dn"><div>${donutSVG([["Presencial", presencial, "#12B76A"], ["Virtual", virtual, "#F59E0B"]], 150)}</div>
        <div class="leg">
          <div class="li"><span class="sw" style="background:#12B76A"></span>Presencial <b>${presencial}</b></div>
          <div class="li"><span class="sw" style="background:#F59E0B"></span>Virtual <b>${virtual}</b></div>
        </div></div>
      </div>
    </div>
    <div class="card"><h3>Cuentas obligatorias <span class="cnt">${asigOblig.length} cuentas</span></h3>
      ${renderTablaObligatorias(asigOblig)}
    </div>
  `;
}

function kpiCard(lbl, val, sub, cls, ic) {
  return `<div class="kpi ${cls || ''}"><span class="ic">${ic || ''}</span><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
}

function renderTablaObligatorias(list) {
  if (!list.length) return '<div class="empty">Sin datos de asignación cargados (verifica la URL de "Asignación de clientes")</div>';
  const mesActual = DATA.meses[DATA.meses.length - 1];
  const rows = list.slice(0, 30).map(a => {
    const vis = a.visitas[mesActual] || "—";
    const pillClass = vis === "VISITADO" ? "verde" : (vis === "PENDIENTE" ? "ambar" : "g");
    return `<tr><td class="cod">${esc(a.cod)}</td><td class="nm">${esc(a.shipper)}</td><td>${esc(a.ejecutivo)}</td><td class="ce">${esc(a.tipo)}</td><td class="ce"><span class="pill ${pillClass}">${esc(vis)}</span></td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Cód.</th><th>Shipper</th><th>Ejecutivo</th><th>Tipo</th><th>Visita ${mesActual ? "(" + mesActual.slice(0,3) + ")" : ""}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderActasPage() {
  const actas = actasFiltradas().sort((a, b) => 0).reverse();

  const cards = actas.slice(0, 200).map((a, i) => {
    const idx = DATA.actas.indexOf(a);
    const camposConContenido = Object.entries(a.campos).filter(([k, v]) => !esVacio(v));
    const tipoCls = a.tipo === "mant" ? "g" : (a.tipo === "nuevo" ? "rojo" : (a.tipo === "varios" ? "azul" : "g"));
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

  const nota = actasFiltradas().length > 200 ? `<div class="insight b"><b>Mostrando 200 de ${actasFiltradas().length} actas.</b> Usa los filtros o el buscador para acotar el resultado.</div>` : "";

  return `
    ${filtrosHTML()}
    <div class="card"><h3>Actas registradas <span class="cnt">${actasFiltradas().length} resultados</span></h3>
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

function renderVendedoresPage() {
  const actas = actasFiltradas();
  const porVend = {};
  DATA.vendedores.forEach(v => porVend[v] = { total: 0, mant: 0, nuevo: 0, varios: 0, clientes: new Set() });
  actas.forEach(a => {
    if (!porVend[a.responsable]) porVend[a.responsable] = { total: 0, mant: 0, nuevo: 0, varios: 0, clientes: new Set() };
    const p = porVend[a.responsable];
    p.total++; p[a.tipo] = (p[a.tipo] || 0) + 1; p.clientes.add(a.cliente.toUpperCase());
  });

  const filas = Object.entries(porVend).filter(([v, d]) => d.total > 0 || curFiltroVend === v)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([v, d]) => `<tr class="rowclick" onclick="setFiltro('vend','${esc(v)}');nav('actas',document.querySelectorAll('.tab')[1])">
      <td class="nm">${esc(v)}</td><td class="ce">${d.total}</td><td class="ce">${d.mant || 0}</td>
      <td class="ce">${d.nuevo || 0}</td><td class="ce">${d.varios || 0}</td><td class="ce">${d.clientes.size}</td>
    </tr>`).join("");

  const rankItems = Object.entries(porVend).map(([v, d]) => [v, d.total]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);

  return `
    ${filtrosHTML({ vend: false })}
    <div class="card"><h3>Volumen de actas por vendedor</h3>${barChart(rankItems, () => "#C8102E")}</div>
    <div class="card"><h3>Detalle por vendedor <span class="cnt">${Object.values(porVend).filter(d=>d.total>0).length} activos</span></h3>
      <table><thead><tr><th>Vendedor</th><th class="ce">Total actas</th><th class="ce">Mantenim.</th><th class="ce">Cliente nuevo</th><th class="ce">Asuntos varios</th><th class="ce">Clientes únicos</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="6" class="empty">Sin datos</td></tr>'}</tbody></table>
      <div class="insight">Toca una fila para ver todas las actas de ese vendedor.</div>
    </div>
  `;
}

function renderCompromisosPage() {
  const comps = DATA.compromisos.filter(c => {
    if (curFiltroMes !== "__TODOS__" && c.mes !== curFiltroMes.toLowerCase() && c.mes !== curFiltroMes) return false;
    if (curFiltroVend !== "__TODOS__" && c.ejecutivo !== curFiltroVend) return false;
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
  const abiertos = comps.length - concluidos;
  const porTipo = {};
  comps.forEach(c => porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1);
  const tipoItems = Object.entries(porTipo).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const rows = comps.slice(0, 150).map(c => {
    const cls = c.estado.includes("CONCLUIDO") || c.estado.includes("CERRADO") ? "verde" : (c.estado.includes("PROCESO") ? "ambar" : "rojo");
    return `<tr><td class="nm">${esc(c.shipper)}</td><td>${esc(c.tipo)}</td><td>${esc(c.ejecutivo)}</td><td class="ce">${esc(c.emision)}</td><td class="ce"><span class="pill ${cls}">${esc(c.estado)}</span></td><td style="max-width:260px;font-size:11.5px;color:#5A626B">${esc(c.observaciones.slice(0,120))}${c.observaciones.length>120?'…':''}</td></tr>`;
  }).join("");

  return `
    ${filtrosHTML({ tipo: false })}
    <div class="kpis">
      ${kpiCard("Total compromisos", comps.length, "en el filtro actual", "k", "✅")}
      ${kpiCard("Concluidos", concluidos, pct(concluidos, comps.length) + "% del total", "v", "✔️")}
      ${kpiCard("Abiertos / en gestión", abiertos, pct(abiertos, comps.length) + "% del total", "a", "⏳")}
    </div>
    <div class="card"><h3>Compromisos por tipo</h3>${hbarChart(tipoItems, () => "#2563EB")}</div>
    <div class="card"><h3>Detalle de compromisos <span class="cnt">${comps.length} resultados</span></h3>
      <table><thead><tr><th>Shipper</th><th>Tipo</th><th>Ejecutivo</th><th class="ce">Emisión</th><th class="ce">Estado</th><th>Observaciones</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">Sin resultados</td></tr>'}</tbody></table>
      ${comps.length > 150 ? `<div class="insight b">Mostrando 150 de ${comps.length}. Usa el buscador para acotar.</div>` : ""}
    </div>
  `;
}

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

  const rows = list.slice(0, 150).map((c, i) => {
    const asig = asigMap[c.nombre.toUpperCase()];
    const key = c.nombre.replace(/'/g, "\\'");
    return `<tr class="rowclick" onclick="setFiltro('busq','${esc(key)}');nav('actas',document.querySelectorAll('.tab')[1])">
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

function wireEvents() {
}

window.addEventListener("DOMContentLoaded", () => { cargarTodo(); });
