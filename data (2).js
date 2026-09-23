// ============================================================
// CONFIGURACIÓN DE FUENTES — Urbano Envíos Dashboard
// ============================================================
// Cada URL debe ser la publicación CSV de UNA pestaña de tu Google Sheets:
// Archivo → Compartir → Publicar en la web → elegir la hoja → formato CSV
//
// Reemplaza los valores marcados con ⚠️ PENDIENTE por tu URL real.
// ============================================================

const FUENTES = {
  actividades: {
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSUTbL4kl33MFSl7j3dJCk_o0dWgUIUZCja8Z4Ug899-FO-ASkdjilx_3fX9TeJsjZj37oidvqE9XAI/pub?output=csv",
    nombre: "Consolidado actividades"
  },
  compromisos: {
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSUTbL4kl33MFSl7j3dJCk_o0dWgUIUZCja8Z4Ug899-FO-ASkdjilx_3fX9TeJsjZj37oidvqE9XAI/pub?gid=933380904&single=true&output=csv",
    nombre: "Consolidado compromisos"
  },
  asignacion: {
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSUTbL4kl33MFSl7j3dJCk_o0dWgUIUZCja8Z4Ug899-FO-ASkdjilx_3fX9TeJsjZj37oidvqE9XAI/pub?gid=2003009632&single=true&output=csv",
    nombre: "Asignación de clientes"
  }
};

// ============================================================
// PARSER CSV ROBUSTO
// Maneja: comillas dobles, comas dentro de campos citados,
// saltos de línea dentro de campos citados, comillas escapadas ("")
// ============================================================
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ""; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++; continue;
    }
  }
  // último campo/fila
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ============================================================
// FETCH con timeout y manejo de error legible
// ============================================================
async function fetchCSV(url, timeoutMs = 12000) {
  if (!url || url.startsWith("⚠️")) {
    throw new Error("URL no configurada todavía");
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      mode: "cors",
      credentials: "omit",
      redirect: "follow"
    });
    clearTimeout(t);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const text = await resp.text();
    if (!text || text.length < 5) throw new Error("Respuesta vacía");
    return parseCSV(text);
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

// ============================================================
// Utilidades de normalización compartidas
// ============================================================
function limpiaTxt(s) {
  return (s || "").toString().trim();
}
function esVacio(v) {
  const t = limpiaTxt(v).toUpperCase();
  return t === "" || t === "NO" || t === "0" || t === "#N/A" || t === "#REF!" || t === "·";
}
function normEjecutivo(s) {
  s = limpiaTxt(s).replace(/\s*-.*$/, "").trim();
  // Title case
  return s.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substr(1).toLowerCase());
}
// Compromisos a veces registra solo el primer nombre del ejecutivo (p.ej. "Alan"
// en vez de "Alan Dominguez" como en Actividades), y Asignación de clientes usa
// apellidos ("Dominguez Zambrano"). Homologamos todo al nombre completo usado
// en Actividades para que los filtros de vendedor funcionen en toda la app.
const MAPA_NOMBRE_CORTO = {
  "Alan": "Alan Dominguez", "Christian": "Christian Albornoz", "Damian": "Damian Daza",
  "Juan": "Juan Carrasco", "Norma": "Norma Velasco", "Oscar": "Oscar Charry",
  "Rolando": "Rolando Chavez", "Rossana": "Rossana Perez", "Madelein": "Rolando Chavez",
  "Dominguez Zambrano": "Alan Dominguez", "Albornoz Barriga": "Christian Albornoz",
  "Daza Alvarez": "Damian Daza", "Carrasco Barrera": "Juan Carrasco",
  "Velasco Alarcon": "Norma Velasco", "Charry Escobar": "Oscar Charry",
  "Chavez Cevallos": "Rolando Chavez", "Chavez Moreno": "Rolando Chavez"
};
function normEjecutivoCompleto(s) {
  const n = normEjecutivo(s);
  return MAPA_NOMBRE_CORTO[n] || n;
}
function limpiaShipper(s) {
  return limpiaTxt(s).replace(/^\d+\s*-\s*/, "").trim();
}
function tipoNorm(t) {
  t = limpiaTxt(t).toUpperCase();
  if (t.includes("MANTENIMIENTO")) return "mant";
  if (t.includes("VARIOS")) return "varios";
  if (t.includes("NUEVO")) return "nuevo";
  return "otro";
}
