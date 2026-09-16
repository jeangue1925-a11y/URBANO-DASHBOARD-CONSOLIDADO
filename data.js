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
async function fetchCSV(url, timeoutMs = 15000) {
  if (!url || url.startsWith("⚠️")) {
    throw new Error("URL no configurada todavía");
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // cache-buster para forzar datos frescos de Google (algunos proxies cachean el CSV)
    const bust = (url.includes("?") ? "&" : "?") + "cachebust=" + Date.now();
    const resp = await fetch(url + bust, {
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
    // Reintento sin cache-buster por si el parámetro extra rompe el endpoint publicado
    try {
      const resp2 = await fetch(url, { mode: "cors", credentials: "omit", redirect: "follow" });
      if (!resp2.ok) throw new Error("HTTP " + resp2.status);
      const text2 = await resp2.text();
      return parseCSV(text2);
    } catch (e2) {
      throw e; // reportamos el error original, más informativo
    }
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
