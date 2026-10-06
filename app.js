// ============================================================
// Dashboard Comercial Urbano — lectura en vivo desde Google Sheets
// Estructura: Actas · Visita obligatoria · Compromisos + selector de periodo
// ============================================================
// ---- utilidades de texto ----
function limpiaTxt(s) { return (s ?? "").toString().trim(); }
function normEjecutivo(s) { s = limpiaTxt(s).replace(/\s*-.*$/, "").trim(); return s.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase()); }
function limpiaShipper(s) { return limpiaTxt(s).replace(/^\d+\s*-\s*/, "").trim(); }
const MESES_ALL = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const MES_INICIO = "ENERO";              // primer mes que se muestra en el dashboard
let ANIO = new Date().getFullYear();
let D = { actas: [], comp: [], ob: [], obm: [], corte: "" };
const EXMAP = [["DOMINGUEZ", "Alan Dominguez"], ["ALAN", "Alan Dominguez"], ["DAZA", "Damian Daza"], ["DAMIAN", "Damian Daza"], ["CHAVEZ", "Rolando Chavez"], ["ROLANDO", "Rolando Chavez"], ["MADELEIN", "Rolando Chavez"], ["ALBORNOZ", "Christian Albornoz"], ["CHRISTIAN", "Christian Albornoz"], ["PEREZ", "Rossana Perez"], ["ROSSANA", "Rossana Perez"], ["CARRASCO", "Juan Carrasco"], ["JUAN", "Juan Carrasco"], ["CHARRY", "Oscar Charry"], ["OSCAR", "Oscar Charry"], ["VELASCO", "Norma Velasco"], ["NORMA", "Norma Velasco"]];
// Shippers que no están en "Asignación de clientes" y llegan sin ejecutivo en compromisos
const SHIPPER_EJECUTIVO = { "DILICSUR": "Juan Carrasco" };
const exN = s => { s = limpiaTxt(s).toUpperCase(); for (const [k, v] of EXMAP) if (s.includes(k)) return v; return null; };
const U = s => limpiaTxt(s).replace(/\s+/g, " ").toUpperCase();
const sinAcentos = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
function nz(s) {
  s = sinAcentos(limpiaTxt(s)).replace(/[^\x20-\x7E]/g, "").replace(/\.+$/, "").replace(/\s+/g, " ").trim().toLowerCase().replace("servico", "servicio");
  if (!s) return "—";
  s = s.split(" ").map(w => ["y", "de", "en", "al", "del", "la"].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fechaISO(s, mes) {
  s = limpiaTxt(s); if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000; const mn = mes ? MESES_ALL.indexOf(mes) + 1 : 0;
    if ((mn && b !== mn && a === mn) || (!mn && b > 12)) [a, b] = [b, a];
    return `${y}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`; }
  return "";
}
const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const aDate = iso => iso ? new Date(iso + "T00:00:00") : null;
function headerIdx(rows, name) { for (let i = 0; i < Math.min(rows.length, 12); i++) if (rows[i].some(c => U(c) === name)) return i; return -1; }

function procesar(rawA, rawC, rawO) {
  const okMes = m => MESES_ALL.indexOf(m) >= MESES_ALL.indexOf(MES_INICIO);
  // ---- Asignación / obligatorias ----
  const ob = [], shipExec = {}; let obm = [];
  if (rawO && rawO.length) {
    const hi = headerIdx(rawO, "COD"), h = rawO[hi].map(U), col = n => h.indexOf(n), colInc = n => h.findIndex(x => x.includes(n));
    const iC = col("COD"), iS = colInc("SHIPER"), iE = colInc("EJECUTIVO"), iG = col("GRUPO"), iT = col("TIPO"), iV = colInc("VISITA OBLIGATORIA"), iOb = colInc("OBSERVACIONES");
    const mcols = {}; h.forEach((x, i) => { if (MESES_ALL.includes(x) && okMes(x)) mcols[x] = i; });
    obm = MESES_ALL.filter(m => m in mcols);
    for (const r of rawO.slice(hi + 1)) {
      const sh = limpiaShipper(r[iS]); if (!sh) continue;
      const e = exN(r[iE]) || normEjecutivo(r[iE]); shipExec[U(sh)] = e;
      if (U(r[iV]) !== "SI" || U(sh).includes("ISOLATOT")) continue;
      const v = {}; obm.forEach(m => { const s = U(r[mcols[m]]); v[m] = s.includes("VISITADO") ? "VISITADO" : s.includes("PEND") ? "PENDIENTE" : (s || "PENDIENTE"); });
      ob.push({ cod: limpiaTxt(r[iC]).split(".")[0], sh, e, g: limpiaTxt(r[iG]), tipo: nz(r[iT]), v, obs: limpiaTxt(r[iOb]) });
    }
  }
  // ---- Actas ----
  const actas = [];
  if (rawA && rawA.length) {
    const hi = headerIdx(rawA, "CODIGO"), h = rawA[hi].map(U), col = n => h.indexOf(n);
    const TEM = [["INGRESO DE CLIENTE NUEVO", "Ingreso de cliente nuevo"], ["VENTAS Y CUMPLIMIENTO DEL PRESUPUESTO", "Ventas y cumplimiento del presupuesto"], ["NIVELES DE SERVICIO KPI´S", "Niveles de servicio KPI´s"], ["FACTURACIÓN GENERADA Y PENDIENTE - RETENCIONES", "Facturación generada y pendiente - retenciones"], ["COBRANZA - SALDOS DE CARTERA", "Cobranza - saldos de cartera"], ["COBERTURA", "Cobertura"], ["CAPACITACIÓN USUARIOS Y SISTEMA", "Capacitación usuarios y sistema"], ["OTROS", "Otros"], ["OTROS 2", "Otros 2"], ["OTROS 3", "Otros 3"], ["OTROS 4", "Otros 4"], ["OTROS 5", "Otros 5"]].map(([k, l]) => [col(k), l]).filter(x => x[0] >= 0);
    const iCod = col("CODIGO"), iSh = col("CLIENTE/SHIPPER"), iF = col("FECHA"), iH = col("HORA"), iM = col("MES"), iMod = col("MODALIDAD"), iP = col("PARTICIPANTES DE REUNION"), iR = col("RESPONSABLE"), iT = col("TIPO DE VISITA"), iEnt = col("FECHA DE ENTREGA");
    for (const r of rawA.slice(hi + 1)) {
      const m = U(r[iM]), sh = limpiaTxt(r[iSh]); if (!sh || !MESES_ALL.includes(m) || !okMes(m)) continue;
      const tp = U(r[iT]);
      actas.push({ m, cod: limpiaTxt(r[iCod]).split(".")[0], sh, f: fechaISO(r[iF], m), h: limpiaTxt(r[iH]).slice(0, 5), mod: nz(r[iMod]) === "—" ? "—" : nz(r[iMod]), part: limpiaTxt(r[iP]), e: exN(r[iR]) || normEjecutivo(r[iR]),
        tipo: tp.includes("MANT") ? "mant" : tp.includes("VARIOS") ? "varios" : tp.includes("NUEVO") ? "nuevo" : "otro", tem: TEM.map(([i, l]) => [l, limpiaTxt(r[i])]).filter(x => x[1]), ent: fechaISO(r[iEnt]) });
    }
  }
  // actas históricas (ene–may) solo para los meses que la hoja en vivo no trae
  if (typeof HIST_ACTAS !== "undefined") { const vivos = new Set(actas.map(a => a.m)); actas.unshift(...HIST_ACTAS.filter(a => !vivos.has(a.m) && okMes(a.m))); }
  // ---- Compromisos ----
  const comp = [];
  if (rawC && rawC.length) {
    const hi = headerIdx(rawC, "ESTADO"), h = rawC[hi].map(U), col = n => h.indexOf(n);
    const iT = col("TIPO DE COMPROMISO"), iG = col("GESTION REQUERIDA"), iO = col("OBSERVACIONES"), iO2 = col("OBSERVACIONES2"), iD = col("DEPTO RESPONSABLE"), iFe = col("FECHA DE EMISION"), iEs = col("ESTADO"), iFc = col("FECHA DE CIERRE"), iSo = col("SOLUCION"), iE = col("EJECUTIVO"), iS = col("SHIPPER"), iM = col("MES");
    const H = hoy0();
    for (const r of rawC.slice(hi + 1)) {
      const m = U(r[iM]), sh = limpiaTxt(r[iS]); if (!sh || !MESES_ALL.includes(m) || !okMes(m)) continue;
      const es = U(r[iEs]), ok = es.includes("CONCLUIDO") || es.includes("CERRADO");
      const fe = fechaISO(r[iFe]), fc = fechaISO(r[iFc]), dFe = aDate(fe), dFc = aDate(fc);
      const dias = dFe ? Math.round(((ok && dFc ? dFc : H) - dFe) / 864e5) : null;
      comp.push({ m, tipo: nz(r[iT]), gest: limpiaTxt(r[iG]), obs: limpiaTxt(r[iO]), obs2: iO2 >= 0 ? limpiaTxt(r[iO2]) : "", dep: nz(r[iD]), fe, fc, ok, sol: limpiaTxt(r[iSo]),
        e: exN(r[iE]) || SHIPPER_EJECUTIVO[U(sh)] || shipExec[U(sh)] || (Object.entries(shipExec).find(([k]) => k.startsWith(U(sh)) || U(sh).startsWith(k)) || [])[1] || normEjecutivo(r[iE]) || "Sin ejecutivo", sh, dias, venc: !ok && !!dFc && dFc < H });
    }
  }
  const meses = MESES_ALL.filter(m => okMes(m) && (actas.some(a => a.m === m) || comp.some(c => c.m === m)));
  const ys = actas.map(a => +a.f.slice(0, 4)).filter(Boolean); if (ys.length) ANIO = Math.max(...ys);
  return { actas, comp, ob, obm, meses, corte: new Date().toLocaleString("es-EC", { dateStyle: "long", timeStyle: "short" }) };
}

const EX = ["Alan Dominguez", "Damian Daza", "Oscar Charry", "Christian Albornoz", "Rolando Chavez", "Rossana Perez", "Juan Carrasco", "Norma Velasco"];
const TIPOS = [["mant", "Mantenimiento", "#E3102F"], ["nuevo", "Cliente nuevo", "#F2F3F5"], ["varios", "Asuntos varios", "#8A929C"]];
const P = (a, b, d = 1) => b ? (a / b * 100).toFixed(d).replace(".", ",") + "%" : "—";
const pct = (a, b) => b ? a / b : 0;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = e => e.split(" ")[0];
let TAB = "actas", fE = "all", fT = "all", qA = "", fOE = "all", fOS = "all", fOSh = "", fCE = "all", fCS = "all", qC = "";

function mbar(v, t, col) { const p = pct(v, t); return `<div class="mb"><div class="t"><div class="f" style="width:${p * 100}%;background:${col}"></div></div><span>${P(v, t)}</span></div>`; }
// ---- ventana emergente al tocar gráficos ----
const popAttr = (title, rows, foot) => `data-pop="${esc(`<div class='pt'>${title}</div>` + rows.map(([n, c, v, p, on]) => `<div class='pr${on ? " on" : ""}'><i style='background:${c}'></i><span>${n}</span><b>${v}</b><em>${p}</em></div>`).join("") + (foot ? `<div class='pf'>${foot}</div>` : ""))}"`;
function donut(parts, total, center, sub) {
  const R = 78, C = 2 * Math.PI * R; let off = 0, g = "";
  parts.forEach(([l, v, col], i) => { const len = total ? v / total * C : 0;
    g += `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${col}" stroke-width="22" stroke-dasharray="${Math.max(len - 3, 0)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)" style="filter:drop-shadow(0 0 6px ${col}66);cursor:pointer" ${popAttr(l, parts.map(([n, vv, cc]) => [n, cc, vv, P(vv, total), n === l]), `Total: <b>${total}</b>`)}><title>${l}: ${v} (${P(v, total)})</title></circle>`; off += len; });
  return `<svg viewBox="0 0 200 200" width="100%" style="max-width:240px;display:block;margin:auto">
  <circle cx="100" cy="100" r="${R}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="22"/>${g}
  <circle cx="100" cy="100" r="58" fill="none" pointer-events="none" stroke="rgba(255,45,75,.25)" stroke-width="1" stroke-dasharray="2 4"/>
  <text x="100" y="100" text-anchor="middle" font-size="34" font-weight="900" fill="#fff" pointer-events="none">${center}</text><text x="100" y="122" text-anchor="middle" font-size="10" fill="#8A929C" letter-spacing="2" pointer-events="none">${sub}</text></svg>`;
}
function ring(p, label) {
  const R = 70, C = 2 * Math.PI * R, len = C * p;
  return `<svg viewBox="0 0 180 180" width="100%" style="max-width:220px;display:block;margin:auto">
  <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#FF2D4B"/><stop offset="1" stop-color="#8E0B21"/></linearGradient></defs>
  <circle cx="90" cy="90" r="${R}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="14"/>
  <circle cx="90" cy="90" r="${R}" fill="none" stroke="url(#rg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${len} ${C}" transform="rotate(-90 90 90)" style="--len:${len};stroke-dashoffset:0;animation:dash 1.4s cubic-bezier(.22,1,.36,1) both;filter:drop-shadow(0 0 8px #E3102F)"/>
  ${[...Array(36).keys()].map(i => { const a = i / 36 * 2 * Math.PI - Math.PI / 2; return `<line x1="${90 + 82 * Math.cos(a)}" y1="${90 + 82 * Math.sin(a)}" x2="${90 + 86 * Math.cos(a)}" y2="${90 + 86 * Math.sin(a)}" stroke="${i / 36 <= p ? "#FF2D4B" : "rgba(255,255,255,.15)"}" stroke-width="2"/>`; }).join("")}
  <text x="90" y="92" text-anchor="middle" font-size="30" font-weight="900" fill="#fff">${(p * 100).toFixed(1).replace(".", ",")}%</text><text x="90" y="114" text-anchor="middle" font-size="9.5" fill="#8A929C" letter-spacing="2">${label}</text></svg>`;
}
function colChart(items, H = 230) { // [label, [{v,col,n}], total]
  const W = 760, pl = 30, pb = 40, pt = 20, mx = Math.max(...items.map(i => i[2]), 1) * 1.12, bw = (W - pl) / items.length, y = v => pt + (1 - v / mx) * (H - pt - pb);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = mx * k / 4; g += `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.06)"/><text x="${pl - 6}" y="${y(v) + 4}" font-size="10" fill="#5A626B" text-anchor="end">${Math.round(v)}</text>`; }
  const grand = items.reduce((s, it) => s + it[2], 0);
  items.forEach(([l, segs, tot], i) => { const x = pl + i * bw + bw * .22, w = bw * .56; let acc = 0;
    g += `<g style="transform-origin:${x}px ${y(0)}px;animation:rise .9s ${i * .05}s cubic-bezier(.22,1,.36,1) both">`;
    segs.forEach(s => { if (!s.v) return; const y1 = y(acc + s.v), y0 = y(acc); g += `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(y0 - y1 - 2, 1)}" rx="3" fill="${s.col}" style="cursor:pointer" ${popAttr(l, segs.map(z => [z.n, z.col, z.v, P(z.v, tot), z === s]), `Total: <b>${tot}</b> · ${P(tot, grand)} del total general (${grand})`)}></rect>`; acc += s.v; });
    g += `</g><text x="${x + w / 2}" y="${y(tot) - 7}" font-size="13" font-weight="900" text-anchor="middle" fill="#fff" style="cursor:pointer" ${popAttr(l, segs.map(z => [z.n, z.col, z.v, P(z.v, tot), false]), `Total: <b>${tot}</b> · ${P(tot, grand)} del total general (${grand})`)}>${tot}</text>
    <text x="${x + w / 2}" y="${H - pb + 17}" font-size="11" font-weight="800" text-anchor="middle" fill="#E9ECEF">${l.split(" ")[0]}</text><text x="${x + w / 2}" y="${H - pb + 30}" font-size="9.5" text-anchor="middle" fill="#5A626B">${l.split(" ").slice(1).join(" ")}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${g}</svg>`;
}
function areaChart(days, vals) {
  const W = 760, H = 190, pl = 28, pb = 26, pt = 14, mx = Math.max(...vals, 1) * 1.2, x = i => pl + i * (W - pl - 8) / (days.length - 1), y = v => pt + (1 - v / mx) * (H - pt - pb);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  let g = `<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E3102F" stop-opacity=".55"/><stop offset="1" stop-color="#E3102F" stop-opacity="0"/></linearGradient></defs>`;
  for (let k = 0; k <= 3; k++) { const v = mx * k / 3; g += `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.06)"/><text x="${pl - 6}" y="${y(v) + 4}" font-size="10" fill="#5A626B" text-anchor="end">${Math.round(v)}</text>`; }
  g += `<polygon points="${x(0)},${y(0)} ${pts} ${x(vals.length - 1)},${y(0)}" fill="url(#ag)"/><polyline points="${pts}" fill="none" stroke="#FF2D4B" stroke-width="2.5" style="filter:drop-shadow(0 0 6px #E3102F)"/>`;
  const sumV = vals.reduce((s, v) => s + v, 0);
  vals.forEach((v, i) => { g += `<circle cx="${x(i)}" cy="${y(v)}" r="${v ? 5 : 2.5}" fill="${v ? "#fff" : "#5A626B"}" style="cursor:pointer" ${popAttr(days[i].split("-").reverse().join("/"), [["Actas del día", "#FF2D4B", v, P(v, sumV), true]], `Total del mes: <b>${sumV}</b>`)}></circle>`; if (i % 3 === 0 || i === vals.length - 1) g += `<text x="${x(i)}" y="${H - 7}" font-size="10" fill="#8A929C" text-anchor="middle">${days[i].slice(8)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${g}</svg>`;
}
const chips = (lbl, cur, opts, fn) => `<div class="chips"><span class="lbl">${lbl}</span>${opts.map(([k, l]) => `<button class="chip ${cur === k ? "on" : ""}" onclick="${fn}('${k}')">${l}</button>`).join("")}</div>`;
const exOpts = [["all", "Todos"], ...EX.map(e => [e, short(e)])];

// ================= PERIODO =================
let MESES = [], MC = {};
let MES = "TRIM";
const inMes = m => MES === "TRIM" || m === MES;
const cap = m => m.charAt(0) + m.slice(1).toLowerCase();
const rango = () => MESES.length > 1 ? cap(MESES[0]) + " – " + cap(MESES[MESES.length - 1]) : cap(MESES[0] || "");
const perLbl = () => MES === "TRIM" ? rango().toLowerCase() : MES.toLowerCase();
const mesTitle = () => (MES === "TRIM" ? rango() : cap(MES)) + " " + ANIO;
function detActa(a) {
  const tem = a.tem.filter(x => !/^(NO|N\/A|NA|-|NO HAY NOVEDAD)$/i.test(x[1].trim()));
  return `<tr class="det" style="display:none"><td colspan="7"><div class="acta">
   <div class="ah"><div><b>${esc(a.sh)}</b><span>Cód. ${esc(a.cod) || "—"} · ${a.f.split("-").reverse().join("/")} ${a.h ? "· " + esc(a.h) : ""} · ${a.mod}</span></div><span class="pill ${a.tipo === "mant" ? "pe" : a.tipo === "nuevo" ? "ok" : "gr"}">${TN[a.tipo] ? TN[a.tipo][1] : a.tipo}</span></div>
   <div class="ag"><div><b>Responsable</b>${a.e}</div><div><b>Participantes</b>${esc(a.part) || "—"}</div>${a.ent ? `<div><b>Fecha de entrega</b>${a.ent}</div>` : ""}</div>
   ${tem.map(([k, v]) => `<div class="at"><b>${k}</b><p>${esc(v).replace(/\n/g, "<br>")}</p></div>`).join("") || `<div class="at"><p>Sin temas registrados.</p></div>`}
   ${a.tem.length > tem.length ? `<div style="font-size:11px;color:var(--g4);margin-top:6px">${a.tem.length - tem.length} temas sin novedad.</div>` : ""}</div></td></tr>`;
}
const TN = Object.fromEntries(TIPOS.map(t => [t[0], t]));
const tog = `onclick="const d=this.nextElementSibling;const o=d.style.display==='none';d.style.display=o?'table-row':'none';this.classList.toggle('open',o)"`;

// ================= ACTAS =================
function vActas() {
  const base = D.actas.filter(a => inMes(a.m)), A = base.filter(a => (fE === "all" || a.e === fE) && (fT === "all" || a.tipo === fT));
  const by = t => A.filter(a => a.tipo === t).length, tot = A.length, pres = A.filter(a => a.mod === "Presencial").length, shp = new Set(A.map(a => a.cod || a.sh)).size;
  const rows = EX.map(e => { const r = base.filter(a => a.e === e && (fT === "all" || a.tipo === fT)); const o = { e, t: r.length }; TIPOS.forEach(([k]) => o[k] = r.filter(a => a.tipo === k).length); return o; }).sort((a, b) => b.t - a.t);
  const list = A.filter(a => !qA || (a.sh + " " + a.cod + " " + a.e + " " + a.part).toLowerCase().includes(qA)).sort((a, b) => b.f.localeCompare(a.f));
  let timeChart;
  if (MES === "TRIM") {
    const AA = D.actas.filter(a => (fE === "all" || a.e === fE) && (fT === "all" || a.tipo === fT));
    timeChart = `<div class="card"><h3>Actas por mes <small>apilado por tipo</small></h3><div class="leg">${TIPOS.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}</div>${colChart(MESES.map(m => { const r = AA.filter(a => a.m === m); return [m.charAt(0) + m.slice(1).toLowerCase(), TIPOS.map(([k, l, c]) => ({ v: r.filter(a => a.tipo === k).length, col: c, n: l })), r.length]; }), 230)}</div>`;
  } else {
    const mn = MESES_ALL.indexOf(MES) + 1, mm = String(mn).padStart(2, "0"), nd = new Date(ANIO, mn, 0).getDate();
    const days = [...Array(nd).keys()].map(i => `${ANIO}-${mm}-${String(i + 1).padStart(2, "0")}`);
    timeChart = `<div class="card"><h3>Actas por día · ${MES.toLowerCase()} <small>${fE === "all" ? "todos los ejecutivos" : fE}</small></h3>${areaChart(days, days.map(d => A.filter(a => a.f === d).length))}</div>`;
  }
  return `<div class="fade"><h2>Actas · ${mesTitle()}</h2>
  ${chips("Ejecutivo", fE, exOpts, "setE")}${chips("Tipo", fT, [["all", "Todos"], ...TIPOS.map(t => [t[0], t[1]])], "setT")}
  <div class="kpis">
   <div class="kpi" style="--c:#fff"><div class="l">Total actas</div><div class="v">${tot}</div><div class="s">${shp} shippers visitados</div></div>
   ${TIPOS.map(([k, l, c]) => `<div class="kpi" style="--c:${c}"><div class="l">${l}</div><div class="v">${by(k)}<small>${P(by(k), tot)}</small></div><div class="s">del total de actas</div></div>`).join("")}
   <div class="kpi" style="--c:#8E0B21"><div class="l">Presenciales</div><div class="v">${pres}<small>${P(pres, tot)}</small></div><div class="s">virtuales: ${tot - pres} (${P(tot - pres, tot)})</div></div>
  </div>
  <div class="g3">
   <div class="card"><h3>Composición por tipo</h3>${donut(TIPOS.map(([k, l, c]) => [l, by(k), c]), tot, tot, "ACTAS")}
    <div style="margin-top:12px">${TIPOS.map(([k, l, c]) => `<div style="display:flex;align-items:center;gap:8px;margin:7px 0;font-size:12.5px"><i style="width:10px;height:10px;border-radius:3px;background:${c};box-shadow:0 0 8px ${c}"></i><span style="flex:1">${l}</span><b>${by(k)}</b><span style="color:var(--g3);width:52px;text-align:right">${P(by(k), tot)}</span></div>`).join("")}</div></div>
   <div class="card"><h3>Actas por ejecutivo comercial <small>apilado por tipo</small></h3><div class="leg">${TIPOS.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}</div>
    ${colChart(rows.map(r => [r.e, TIPOS.map(([k, l, c]) => ({ v: r[k], col: c, n: l })), r.t]), 250)}</div>
  </div>
  ${timeChart}
  <div class="card"><h3>Actas registradas <small>${list.length} actas · toca una fila para ver el acta completa</small></h3><input class="search" id="qa" placeholder="Buscar shipper, código, ejecutivo o participante…" value="${esc(qA)}" oninput="qA=this.value.toLowerCase();draw('qa')">
   <div class="scroll"><table><thead><tr><th>Fecha</th><th>Mes</th><th>Cód.</th><th>Shipper</th><th>Ejecutivo</th><th class="c">Tipo</th><th class="c">Modalidad</th></tr></thead><tbody>
   ${list.map(a => `<tr class="rc" ${tog}><td><span class="chev">▸</span>${a.f.slice(8)}/${a.f.slice(5, 7)}</td><td>${MC[a.m]}</td><td>${esc(a.cod)}</td><td><b>${esc(a.sh)}</b></td><td>${a.e}</td><td class="c"><span class="pill ${a.tipo === "mant" ? "pe" : a.tipo === "nuevo" ? "ok" : "gr"}">${TN[a.tipo] ? TN[a.tipo][1] : a.tipo}</span></td><td class="c">${a.mod}</td></tr>${detActa(a)}`).join("")}</tbody></table></div></div></div>`;
}
// ================= OBLIGATORIAS =================
function vOblig() {
  const all = D.ob, actasBy = {};
  D.actas.filter(a => inMes(a.m)).forEach(a => { actasBy[a.cod] = (actasBy[a.cod] || 0) + 1; });
  const OBM = D.obm, ms = MES === "TRIM" ? OBM : OBM.includes(MES) ? [MES] : [];
  if (!ms.length) return `<div class="fade"><h2>Visita obligatoria · ${mesTitle()}</h2><div class="card"><div class="ins">Aún no hay columna de visitas obligatorias para ${MES.toLowerCase()} en la hoja "Asignación de clientes".</div></div></div>`;
  const isPend = o => ms.some(m => o.v[m] !== "VISITADO");
  const O = all.filter(o => (fOE === "all" || o.e === fOE) && (!fOSh || o.cod === fOSh) && (fOS === "all" || (fOS === "PENDIENTE") === isPend(o)));
  const slots = O.length * ms.length, vis = O.reduce((s, o) => s + ms.filter(m => o.v[m] === "VISITADO").length, 0);
  const rows = EX.map(e => { const r = all.filter(o => o.e === e && (!fOSh || o.cod === fOSh)); const s = r.length * ms.length, v = r.reduce((x, o) => x + ms.filter(m => o.v[m] === "VISITADO").length, 0); return { e, t: s, v, n: r.length, pend: r.filter(isPend).map(o => o.sh) }; }).filter(r => r.n).sort((a, b) => pct(b.v, b.t) - pct(a.v, a.t) || b.t - a.t);
  const shOpts = [...all].sort((a, b) => a.sh.localeCompare(b.sh));
  const pm = OBM.map(m => { const r = all.filter(o => (fOE === "all" || o.e === fOE) && (!fOSh || o.cod === fOSh)); return [m, r.filter(o => o.v[m] === "VISITADO").length, r.length]; });
  return `<div class="fade"><h2>Visita obligatoria · ${mesTitle()}</h2>
  <div class="chips"><span class="lbl">Shipper</span><select onchange="fOSh=this.value;draw()"><option value="">Todos los shippers (${all.length})</option>${shOpts.map(o => `<option value="${esc(o.cod)}" ${fOSh === o.cod ? "selected" : ""}>${esc(o.sh)} · ${short(o.e)}</option>`).join("")}</select></div>
  ${chips("Ejecutivo", fOE, exOpts.filter(o => o[0] === "all" || all.some(x => x.e === o[0])), "setOE")}${chips("Estado", fOS, [["all", "Todos"], ["VISITADO", "✔ Visitado"], ["PENDIENTE", MES === "TRIM" ? "⏳ Con algún pendiente" : "⏳ Pendiente"]], "setOS")}
  <div class="kpis">
   <div class="kpi" style="--c:#fff"><div class="l">Cuentas obligatorias</div><div class="v">${O.length}</div><div class="s">${MES === "TRIM" ? slots + " visitas exigidas en el trimestre" : "en el filtro actual"}</div></div>
   <div class="kpi" style="--c:#E9ECEF"><div class="l">Visitas cumplidas</div><div class="v">${vis}<small>${P(vis, slots)}</small></div><div class="s">${perLbl()}</div></div>
   <div class="kpi" style="--c:#E3102F"><div class="l">Visitas pendientes</div><div class="v">${slots - vis}<small>${P(slots - vis, slots)}</small></div><div class="s">${perLbl()}</div></div>
   <div class="kpi" style="--c:#8A929C"><div class="l">Actas a obligatorias</div><div class="v">${O.reduce((s, o) => s + (actasBy[o.cod] || 0), 0)}</div><div class="s">actas en ${perLbl()}</div></div>
  </div>
  <div class="g3">
   <div class="card"><h3>Cumplimiento de visitas</h3>${ring(pct(vis, slots), "CUMPLIMIENTO")}
    <div style="display:flex;justify-content:space-around;margin-top:12px">${pm.map(([m, v, t]) => `<div style="text-align:center;opacity:${inMes(m) ? 1 : .45}"><div style="font-size:10.5px;color:var(--g3);letter-spacing:1px">${m.slice(0, 3)}</div><div style="font-size:18px;font-weight:900;color:#fff">${P(v, t, 0)}</div><div style="font-size:11px;color:var(--g3)">${v}/${t}</div></div>`).join("")}</div></div>
   <div class="card"><h3>Cumplimiento por ejecutivo <small>${perLbl()}</small></h3>
    ${rows.map(r => `<div style="display:grid;grid-template-columns:150px 1fr 120px;gap:10px;align-items:center;margin:9px 0;cursor:pointer" ${popAttr(r.e, [["Visitado", "#E9ECEF", r.v, P(r.v, r.t), true], ["Pendiente", "#E3102F", r.t - r.v, P(r.t - r.v, r.t), false]], `Visitas exigidas: <b>${r.t}</b>`)}><b style="font-size:12.5px">${r.e}</b>
     <div class="stk" style="height:20px">${r.v ? `<div style="flex:${r.v};background:linear-gradient(90deg,#fff,#B8BEC6);color:#0B0C0F">${r.v}</div>` : ""}${r.t - r.v ? `<div style="flex:${r.t - r.v};background:linear-gradient(90deg,#E3102F,#8E0B21);color:#fff">${r.t - r.v}</div>` : ""}</div>
     <span style="text-align:right;font-weight:900;color:${r.v === r.t ? "#fff" : "#FF6B80"}">${P(r.v, r.t)} <small style="color:var(--g3);font-weight:700">${r.v}/${r.t}</small></span></div>`).join("")}
    <div class="leg" style="margin-top:12px"><span><i style="background:#fff"></i>Visitado</span><span><i style="background:#E3102F"></i>Pendiente</span></div>
    ${rows.some(r => r.pend.length) ? `<div class="ins"><b>Cuentas con pendientes:</b> ${rows.filter(r => r.pend.length).map(r => `${short(r.e)} (${r.pend.length}): ${r.pend.join(", ")}`).join(" · ")}</div>` : ""}</div>
  </div>
  <div class="card"><h3>Listado de cuentas obligatorias <small>${O.length} cuentas</small></h3><div class="scroll"><table>
   <thead><tr><th>Cód.</th><th>Shipper</th><th>Grupo</th><th>Ejecutivo</th><th class="c">Tipo</th>${OBM.map(m => `<th class="c" style="${inMes(m) ? "color:#fff" : ""}">${m.charAt(0) + m.slice(1, 3).toLowerCase()}</th>`).join("")}<th class="c">Actas</th></tr></thead><tbody>
   ${O.sort((a, b) => isPend(b) - isPend(a) || a.sh.localeCompare(b.sh)).map(o => `<tr><td>${esc(o.cod)}</td><td><b>${esc(o.sh)}</b></td><td style="color:var(--g2)">${esc(o.g)}</td><td>${o.e}</td><td class="c">${esc(o.tipo)}</td>${OBM.map(m => `<td class="c" style="opacity:${inMes(m) ? 1 : .4}"><span class="pill ${o.v[m] === "VISITADO" ? "ok" : "pe"}">${o.v[m] === "VISITADO" ? "✔" : "⏳"}</span></td>`).join("")}<td class="c">${actasBy[o.cod] || "—"}</td></tr>`).join("")}</tbody></table></div></div></div>`;
}
// ================= COMPROMISOS =================
function vComp() {
  const base = D.comp.filter(c => inMes(c.m)), C = base.filter(c => (fCE === "all" || c.e === fCE) && (fCS === "all" || (fCS === "ok") === c.ok));
  const ok = C.filter(c => c.ok).length, pe = C.length - ok, cer = C.filter(c => c.ok && c.dias != null), prom = cer.length ? cer.reduce((s, c) => s + c.dias, 0) / cer.length : 0, venc = C.filter(c => c.venc).length;
  const rows = EX.map(e => { const r = base.filter(c => c.e === e); return { e, t: r.length, ok: r.filter(c => c.ok).length, okN: [...new Set(r.filter(c => c.ok).map(c => c.sh))], peN: [...new Set(r.filter(c => !c.ok).map(c => c.sh))] }; }).filter(r => r.t).sort((a, b) => b.t - a.t);
  const TT = {}, DD = {}; C.forEach(c => { (TT[c.tipo] = TT[c.tipo] || [0, 0])[c.ok ? 0 : 1]++; (DD[c.dep] = DD[c.dep] || [0, 0])[c.ok ? 0 : 1]++; });
  const hb = obj => { const it = Object.entries(obj).sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1])), mx = Math.max(...it.map(x => x[1][0] + x[1][1]), 1);
    return it.map(([l, [o, p]]) => `<div style="display:grid;grid-template-columns:170px 1fr 50px;gap:10px;align-items:center;margin:8px 0;font-size:12.3px;cursor:pointer" ${popAttr(esc(l), [["Concluidos", "#E9ECEF", o, P(o, o + p), true], ["Pendientes", "#E3102F", p, P(p, o + p), false]], `Total: <b>${o + p}</b> · ${P(o + p, C.length)} de los compromisos`)}><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l)}</span><div style="width:${(o + p) / mx * 100}%"><div class="stk" style="height:16px">${o ? `<div style="flex:${o};background:#E9ECEF;color:#0B0C0F">${o}</div>` : ""}${p ? `<div style="flex:${p};background:#E3102F;color:#fff">${p}</div>` : ""}</div></div><b style="text-align:right">${o + p}</b></div>`).join(""); };
  const list = C.filter(c => !qC || (c.sh + " " + c.tipo + " " + c.e + " " + c.obs).toLowerCase().includes(qC)).sort((a, b) => a.ok - b.ok || (b.dias || 0) - (a.dias || 0));
  const monthly = MES === "TRIM" ? `<div class="card"><h3>Compromisos por mes <small>concluidos vs pendientes</small></h3><div class="leg"><span><i style="background:#E9ECEF"></i>Concluidos</span><span><i style="background:#E3102F"></i>Pendientes</span></div>${colChart(MESES.map(m => { const r = D.comp.filter(c => c.m === m && (fCE === "all" || c.e === fCE)); const o = r.filter(c => c.ok).length; return [m.charAt(0) + m.slice(1).toLowerCase(), [{ v: o, col: "#E9ECEF", n: "Concluidos" }, { v: r.length - o, col: "#E3102F", n: "Pendientes" }], r.length]; }), 210)}</div>` : "";
  return `<div class="fade"><h2>Compromisos · ${mesTitle()} · al corte</h2>
  ${chips("Ejecutivo", fCE, exOpts.filter(o => o[0] === "all" || D.comp.some(x => x.e === o[0])), "setCE")}${chips("Estado", fCS, [["all", "Todos"], ["ok", "✔ Concluidos"], ["pe", "⏳ Pendientes"]], "setCS")}
  <div class="kpis">
   <div class="kpi" style="--c:#fff"><div class="l">Total compromisos</div><div class="v">${C.length}</div><div class="s">registrados en ${perLbl()}</div></div>
   <div class="kpi" style="--c:#E9ECEF"><div class="l">Concluidos</div><div class="v">${ok}<small>${P(ok, C.length)}</small></div><div class="s">cerrados al corte</div></div>
   <div class="kpi" style="--c:#E3102F"><div class="l">Pendientes</div><div class="v">${pe}<small>${P(pe, C.length)}</small></div><div class="s">${venc} con fecha meta vencida</div></div>
   <div class="kpi" style="--c:#8A929C"><div class="l">Promedio días de cierre</div><div class="v">${prom ? prom.toFixed(1).replace(".", ",") : "—"}</div><div class="s">emisión → cierre real</div></div>
  </div>
  <div class="g3">
   <div class="card"><h3>Tasa de cierre</h3>${ring(pct(ok, C.length), "CONCLUIDOS")}<div style="display:flex;justify-content:space-around;margin-top:10px;font-size:12px;color:var(--g2)"><span><b style="color:#fff;font-size:18px">${ok}</b> concluidos</span><span><b style="color:#FF6B80;font-size:18px">${pe}</b> pendientes</span></div></div>
   <div class="card"><h3>Compromisos por ejecutivo <small>concluidos vs pendientes</small></h3><div class="leg"><span><i style="background:#E9ECEF"></i>Concluidos</span><span><i style="background:#E3102F"></i>Pendientes</span></div>
    ${colChart(rows.map(r => [r.e, [{ v: r.ok, col: "#E9ECEF", n: "Concluidos" }, { v: r.t - r.ok, col: "#E3102F", n: "Pendientes" }], r.t]), 240)}</div>
  </div>${monthly}
  <div class="card"><h3>Compromisos por ejecutivo al corte <small>con nombres de shippers</small></h3><div class="scroll"><table>
   <thead><tr><th>Ejecutivo</th><th class="n">Total</th><th class="n">Concluidos</th><th class="n">% Concl.</th><th class="n">Pendientes</th><th class="n">% Pend.</th><th>Shippers con pendientes</th><th>Shippers concluidos</th></tr></thead><tbody>
   ${rows.map(r => `<tr><td><b>${r.e}</b></td><td class="n"><b style="font-size:14px">${r.t}</b></td><td class="n">${r.ok}</td><td class="n">${mbar(r.ok, r.t, "#E9ECEF")}</td><td class="n" style="color:${r.t - r.ok ? "#FF6B80" : "inherit"};font-weight:800">${r.t - r.ok}</td><td class="n">${r.t ? (100 - Math.round(r.ok / r.t * 1000) / 10).toFixed(1).replace(".", ",") + "%" : "—"}</td>
    <td><div class="names">${r.peN.map(n => `<span class="p">${esc(n)}</span>`).join("") || `<span style="background:none;color:var(--g4)">—</span>`}</div></td><td><div class="names">${r.okN.map(n => `<span>${esc(n)}</span>`).join("")}</div></td></tr>`).join("")}
   <tr class="tot"><td>TOTAL</td><td class="n">${base.length}</td><td class="n">${base.filter(c => c.ok).length}</td><td class="n">${P(base.filter(c => c.ok).length, base.length)}</td><td class="n">${base.filter(c => !c.ok).length}</td><td class="n">${P(base.filter(c => !c.ok).length, base.length)}</td><td></td><td></td></tr></tbody></table></div></div>
  <div class="g2"><div class="card"><h3>Por tipo de compromiso</h3>${hb(TT)}</div><div class="card"><h3>Por departamento responsable</h3>${hb(DD)}</div></div>
  <div class="card"><h3>Compromisos registrados <small>${list.length} · toca una fila para ver el compromiso completo</small></h3><input class="search" id="qc" placeholder="Buscar shipper, tipo, ejecutivo…" value="${esc(qC)}" oninput="qC=this.value.toLowerCase();draw('qc')">
   <div class="scroll"><table><thead><tr><th>Shipper</th><th>Mes</th><th>Tipo</th><th>Ejecutivo</th><th>Depto.</th><th class="c">Emisión</th><th class="c">Cierre / meta</th><th class="c">Días</th><th class="c">Estado</th></tr></thead><tbody>
   ${list.map(c => `<tr class="rc" ${tog}><td><span class="chev">▸</span><b>${esc(c.sh)}</b></td><td>${MC[c.m]}</td><td>${esc(c.tipo)}</td><td>${short(c.e)}</td><td>${esc(c.dep)}</td><td class="c">${c.fe ? c.fe.slice(8) + "/" + c.fe.slice(5, 7) : "—"}</td><td class="c">${c.fc ? c.fc.slice(8) + "/" + c.fc.slice(5, 7) : "—"}</td><td class="c" style="${c.venc ? "color:#FF6B80;font-weight:900" : ""}">${c.dias ?? "—"}${c.venc ? " ⚠" : ""}</td><td class="c"><span class="pill ${c.ok ? "ok" : "pe"}">${c.ok ? "✔ CONCLUIDO" : "⏳ PENDIENTE"}</span></td></tr>
   <tr class="det" style="display:none"><td colspan="9"><div class="acta"><div class="ah"><div><b>${esc(c.sh)}</b><span>${esc(c.tipo)} · ${c.e} · ${esc(c.dep)}</span></div><span class="pill ${c.ok ? "ok" : "pe"}">${c.ok ? "✔ CONCLUIDO" : "⏳ PENDIENTE"}</span></div>
    <div class="ag"><div><b>Emisión</b>${c.fe ? c.fe.split("-").reverse().join("/") : "—"}</div><div><b>${c.ok ? "Cierre" : "Fecha meta"}</b>${c.fc ? c.fc.split("-").reverse().join("/") : "—"}</div><div><b>Días</b>${c.dias ?? "—"}</div></div>
    <div class="at"><b>Gestión requerida</b><p>${esc(c.gest) || "—"}</p></div><div class="at"><b>Observaciones</b><p>${esc([c.obs, c.obs2].filter(Boolean).join(" · ")) || "—"}</p></div><div class="at" style="border-color:${c.ok ? "#fff" : "#E3102F"}"><b>Solución</b><p>${esc(c.sol) || "Sin registro"}</p></div></div></td></tr>`).join("")}</tbody></table></div></div></div>`;
}
window.setE = v => { fE = v; draw(); }; window.setT = v => { fT = v; draw(); }; window.setOE = v => { fOE = v; draw(); }; window.setOS = v => { fOS = v; draw(); }; window.setCE = v => { fCE = v; draw(); }; window.setCS = v => { fCS = v; draw(); };
window.setMes = v => { MES = v; document.querySelectorAll(".mchip").forEach(b => b.classList.toggle("on", b.dataset.m === v)); document.getElementById("perB").textContent = mesTitle().toUpperCase(); draw(); };


// ================= CONTROL GENERAL =================
function buildPeriodo() {
  MESES = D.meses; MC = Object.fromEntries(MESES_ALL.map(m => [m, m.charAt(0) + m.slice(1, 3).toLowerCase()]));
  if (MES !== "TRIM" && !MESES.includes(MES)) MES = "TRIM";
  document.getElementById("mper").innerHTML = `<span>Periodo</span>` + MESES.map(m => `<button class="mchip ${MES === m ? "on" : ""}" data-m="${m}" onclick="setMes('${m}')">${cap(m)}</button>`).join("") + (MESES.length > 1 ? `<button class="mchip ${MES === "TRIM" ? "on" : ""}" data-m="TRIM" onclick="setMes('TRIM')">${MC[MESES[0]]} – ${MC[MESES[MESES.length - 1]]}</button>` : "");
  document.getElementById("perB").textContent = mesTitle().toUpperCase();
  document.getElementById("corte").textContent = "Datos al " + D.corte;
}
function draw(focus) {
  if (!D.meses || !D.meses.length) return;
  document.getElementById("app").innerHTML = TAB === "actas" ? vActas() : TAB === "oblig" ? vOblig() : vComp();
  if (focus) { const i = document.getElementById(focus); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  else document.querySelectorAll(".fade").forEach(el => el.classList.remove("fade"));
}
document.querySelectorAll(".tab").forEach(b => b.onclick = () => { TAB = b.dataset.t; document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x === b)); draw(); document.getElementById("app").firstElementChild?.classList.add("fade"); window.scrollTo({ top: 0, behavior: "smooth" }); });

async function cargar() {
  const st = document.getElementById("estado"), app = document.getElementById("app");
  st.innerHTML = `<span class="dot load"></span>Cargando datos desde Google Sheets…`;
  if (!D.meses) app.innerHTML = `<div class="card" style="text-align:center;padding:60px"><div class="spin"></div><p style="margin-top:14px;color:var(--g2)">Cargando actas, compromisos y asignación de clientes…</p></div>`;
  const res = await Promise.allSettled([fetchCSV(FUENTES.actividades.url), fetchCSV(FUENTES.compromisos.url), fetchCSV(FUENTES.asignacion.url)]);
  const errs = res.map((r, i) => r.status === "rejected" ? ["Actividades", "Compromisos", "Asignación"][i] + ": " + r.reason.message : null).filter(Boolean);
  try {
    D = procesar(...res.map(r => r.status === "fulfilled" ? r.value : null));
    buildPeriodo(); draw(); app.firstElementChild?.classList.add("fade");
    st.innerHTML = errs.length ? `<span class="dot err"></span>Carga parcial · ${errs.join(" · ")}` : `<span class="dot ok"></span>En vivo · ${D.actas.length} actas · ${D.comp.length} compromisos · ${D.ob.length} cuentas obligatorias`;
  } catch (e) {
    st.innerHTML = `<span class="dot err"></span>No se pudieron procesar los datos: ${e.message}`;
    app.innerHTML = `<div class="card"><div class="ins">No se pudieron cargar los datos (${errs.join(" · ") || e.message}). Verifica que las hojas sigan publicadas como CSV y pulsa “Actualizar”.</div></div>`;
  }
}

// ================= DESCARGA HTML AL CORTE =================
async function codigoApp() {
  const inl = document.getElementById("app-src"); if (inl) return inl.textContent;
  const r = await fetch("app.js", { cache: "no-store" }); if (!r.ok) throw new Error("no se pudo leer app.js"); return r.text();
}
async function descargarHTML() {
  const btn = document.getElementById("btnDl"), txt = btn.innerHTML; btn.innerHTML = "⏳ Generando…";
  try {
    const src = await codigoApp();
    const css = [...document.querySelectorAll("style")].map(s => s.outerHTML).join("\n");
    const shell = document.getElementById("shell").cloneNode(true);
    shell.querySelector("#app").innerHTML = ""; shell.querySelector("#btnUp")?.remove();
    const fecha = new Date().toISOString().slice(0, 10);
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Reporte Comercial Urbano · corte ${fecha}</title>${css}</head><body>${shell.outerHTML}
<script>window.SNAPSHOT=${JSON.stringify(D).replace(/</g, "\\u003c")};<\/script>
<script id="app-src">${src.replace(/<\/script/gi, "<\\/script")}<\/script></body></html>`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `Reporte_Comercial_Urbano_${fecha}.html`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } catch (e) { alert("No se pudo generar el HTML: " + e.message); }
  btn.innerHTML = txt;
}
function imprimir() { window.print(); }

// ================= VENTANA EMERGENTE =================
(function () {
  const pop = document.createElement("div"); pop.id = "pop"; document.body.appendChild(pop);
  document.addEventListener("click", ev => {
    const el = ev.target.closest("[data-pop]");
    if (!el) { if (!ev.target.closest("#pop")) pop.classList.remove("show"); return; }
    pop.innerHTML = el.getAttribute("data-pop") + `<span class="px">✕</span>`; pop.classList.add("show");
    const w = pop.offsetWidth, h = pop.offsetHeight; let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
    pop.style.left = Math.max(8, x) + "px"; pop.style.top = Math.max(8, y) + "px";
  });
  addEventListener("scroll", () => pop.classList.remove("show"), { passive: true });
})();
// ================= INICIO =================
if (window.SNAPSHOT) {
  D = window.SNAPSHOT; ANIO = +(D.actas.find(a => a.f)?.f.slice(0, 4)) || ANIO;
  buildPeriodo(); draw(); document.getElementById("app").firstElementChild?.classList.add("fade");
  document.getElementById("estado").innerHTML = `<span class="dot snap"></span>Reporte descargado · corte al ${D.corte}`;
} else cargar();
