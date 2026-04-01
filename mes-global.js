/**
 * mes-global.js — Cayena
 * Core del sistema de navegación de meses.
 * Incluir con: <script src="mes-global.js"></script>
 * Debe cargarse ANTES de cualquier otro script de negocio.
 */

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const MES_KEY     = 'mesActual';
const FINANZAS_KEY = 'finanzas';
const MES_NOMBRES  = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

// ─── HELPERS DE FORMATO ───────────────────────────────────────────────────────

/** "2026-03" → { y: 2026, m: 2 }  (m es 0-indexed, igual que Date) */
function mesParseado(val) {
  const [y, m] = (val || '').split('-').map(Number);
  return { y, m: m - 1 };
}

/** { y, m } → "2026-03" */
function mesComoString(y, m) {
  return y + '-' + String(m + 1).padStart(2, '0');
}

/** "2026-03" → "Marzo 2026" */
function mesEtiqueta(val) {
  const { y, m } = mesParseado(val);
  return MES_NOMBRES[m] + ' ' + y;
}

// ─── LEER / ESCRIBIR MES GLOBAL ───────────────────────────────────────────────

/**
 * Retorna el mes activo (string "YYYY-MM").
 * Si no existe en localStorage, inicializa con el mes actual.
 */
function getMesGlobal() {
  let stored = localStorage.getItem(MES_KEY);
  if (!stored) {
    const now = new Date();
    stored = mesComoString(now.getFullYear(), now.getMonth());
    localStorage.setItem(MES_KEY, stored);
  }
  return stored;
}

/** Guarda el mes activo y recarga la página para sincronizar todos los módulos */
function setMesGlobal(val, reload = true) {
  localStorage.setItem(MES_KEY, val);
  if (reload) location.reload();
}

/** Año del mes activo (number) */
function getMesYear()  { return mesParseado(getMesGlobal()).y; }

/** Mes del mes activo (0-indexed, igual que Date, number) */
function getMesMonth() { return mesParseado(getMesGlobal()).m; }

/** "Marzo 2026" */
function getMesLabel() { return mesEtiqueta(getMesGlobal()); }

// ─── NAVEGACIÓN ENTRE MESES ───────────────────────────────────────────────────

/** Avanza al mes siguiente y recarga */
function mesAnterior() {
  let { y, m } = mesParseado(getMesGlobal());
  m--;
  if (m < 0) { m = 11; y--; }
  setMesGlobal(mesComoString(y, m));
}

/** Retrocede al mes anterior y recarga */
function mesSiguiente() {
  let { y, m } = mesParseado(getMesGlobal());
  m++;
  if (m > 11) { m = 0; y++; }
  setMesGlobal(mesComoString(y, m));
}

/** Vuelve al mes actual (hoy) y recarga */
function mesHoy() {
  const now = new Date();
  setMesGlobal(mesComoString(now.getFullYear(), now.getMonth()));
}

// ─── BASE DE DATOS LOCAL (estructura por mes) ─────────────────────────────────

/**
 * Retorna el objeto completo de finanzas:
 * { "2026-01": { ingresos:[], gastos:[], inventario:[] }, ... }
 */
function getFinanzas() {
  try {
    return JSON.parse(localStorage.getItem(FINANZAS_KEY)) || {};
  } catch {
    return {};
  }
}

/**
 * Retorna los datos del mes indicado (o el mes activo si no se pasa).
 * Siempre retorna estructura completa aunque esté vacío.
 */
function getDataMes(mes) {
  mes = mes || getMesGlobal();
  const db = getFinanzas();
  return db[mes] || {
    ingresos:   [],
    gastos:     [],
    inventario: [],
    compras:    [],
    resumen:    {}
  };
}

/**
 * Guarda los datos de un mes específico dentro del objeto finanzas.
 * No sobreescribe otros meses.
 */
function setDataMes(mes, data) {
  const db = getFinanzas();
  db[mes] = { ...getDataMes(mes), ...data };
  localStorage.setItem(FINANZAS_KEY, JSON.stringify(db));
}

/**
 * Guarda un array de un tipo específico para el mes activo.
 * Ejemplo: setArrayMes('ingresos', [...])
 */
function setArrayMes(tipo, arr, mes) {
  mes = mes || getMesGlobal();
  const data = getDataMes(mes);
  data[tipo] = arr;
  setDataMes(mes, data);
}

// ─── LISTA DE MESES CON DATOS ─────────────────────────────────────────────────

/**
 * Retorna array de strings "YYYY-MM" de todos los meses
 * que tienen algún dato guardado, ordenados de más reciente a más antiguo.
 */
function getMesesConDatos() {
  const db = getFinanzas();
  return Object.keys(db).sort().reverse();
}

/**
 * Genera lista de meses desde el origen hasta hoy + 1 mes adelante.
 * Útil para poblar el selector.
 * @param {string} desde - "YYYY-MM" punto de inicio (default "2026-01")
 */
function getMesesRango(desde) {
  desde = desde || '2026-01';
  const resultado = [];
  let { y, m } = mesParseado(desde);
  const now = new Date();
  const limY = now.getFullYear();
  const limM = now.getMonth() + 1; // +1 para incluir mes siguiente

  while (y < limY || (y === limY && m <= limM)) {
    resultado.push(mesComoString(y, m));
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return resultado.reverse(); // más reciente primero
}

// ─── SELECTOR DE MES (inyectable en cualquier HTML) ──────────────────────────

/**
 * Construye e inyecta el selector de mes en el elemento con id dado.
 * El selector muestra todos los meses desde el origen hasta hoy.
 * Al cambiar, guarda en localStorage y recarga la página.
 *
 * @param {string} containerId - id del elemento donde se inyecta
 * @param {string} desde       - mes de inicio del rango (default "2026-01")
 */
function initSelectorMes(containerId, desde) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const actual = getMesGlobal();
  const meses  = getMesesRango(desde || '2026-01');

  // ── Botón anterior
  const btnPrev = document.createElement('button');
  btnPrev.className = 'mes-nav-btn';
  btnPrev.innerHTML = '‹';
  btnPrev.title = 'Mes anterior';
  btnPrev.onclick = mesAnterior;

  // ── Select
  const sel = document.createElement('select');
  sel.id = 'selectorMes';
  sel.className = 'mes-select';
  meses.forEach(mes => {
    const opt = document.createElement('option');
    opt.value = mes;
    opt.textContent = mesEtiqueta(mes);
    if (mes === actual) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', e => setMesGlobal(e.target.value));

  // ── Botón siguiente (solo si no es el mes actual o futuro)
  const btnNext = document.createElement('button');
  btnNext.className = 'mes-nav-btn';
  btnNext.innerHTML = '›';
  btnNext.title = 'Mes siguiente';
  btnNext.onclick = mesSiguiente;

  // ── Ensamblar
  container.innerHTML = '';
  container.appendChild(btnPrev);
  container.appendChild(sel);
  container.appendChild(btnNext);
  container.className = (container.className || '') + ' mes-selector-wrap';
}

// ─── CSS INLINE DEL SELECTOR ──────────────────────────────────────────────────
(function injectSelectorCSS() {
  if (document.getElementById('mes-global-css')) return;
  const style = document.createElement('style');
  style.id = 'mes-global-css';
  style.textContent = `
    .mes-selector-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .mes-select {
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--text, #0F172A);
      background: var(--bg, #F8FAFC);
      border: 1px solid var(--border, #E2E8F0);
      border-radius: 8px;
      padding: 5px 10px;
      cursor: pointer;
      outline: none;
      transition: border-color .15s;
      max-width: 160px;
    }
    .mes-select:hover, .mes-select:focus {
      border-color: var(--blue, #2563EB);
    }
    .mes-nav-btn {
      background: none;
      border: 1px solid var(--border, #E2E8F0);
      border-radius: 8px;
      width: 30px;
      height: 30px;
      font-size: 16px;
      color: var(--muted, #64748B);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all .15s;
      padding: 0;
      line-height: 1;
    }
    .mes-nav-btn:hover {
      border-color: var(--blue, #2563EB);
      color: var(--blue, #2563EB);
      background: #EFF6FF;
    }
  `;
  document.head.appendChild(style);
})();

// ─── EXPORTACIÓN GLOBAL ───────────────────────────────────────────────────────
// Todas las funciones son globales para compatibilidad con scripts inline
// No se usa ES modules para evitar problemas con file:// protocol

// ─── VERIFICACIÓN ─────────────────────────────────────────────────────────────
console.log('[mes-global] ✓ Mes activo:', getMesGlobal(), '—', getMesLabel());
