/**
 * api.js — Cayena
 * Capa intermedia entre los módulos HTML y Supabase.
 * Centraliza todas las operaciones de datos. Filtrado por mes global.
 *
 * Depende de:  supabase-config.js  (SB, DB_*)
 *              mes-global.js       (getMesGlobal, getDataMes, setArrayMes)
 *
 * Incluir con: <script src="api.js"></script>
 * Después de supabase-config.js y mes-global.js.
 */

// ─── GUARD ────────────────────────────────────────────────────────────────────
if (typeof SB === 'undefined') {
  console.warn('[api.js] supabase-config.js no cargado. Operando en modo local.');
}

// ─── INGRESOS ─────────────────────────────────────────────────────────────────
const API_Ingresos = {

  /**
   * Obtiene ingresos del mes indicado.
   * Primero intenta Supabase; si falla, usa localStorage.
   * @param {string} mes - "YYYY-MM" (default: mes global activo)
   */
  async get(mes) {
    mes = mes || getMesGlobal();
    try {
      const rows = await DB_Ingresos.getByPeriodo(mes);
      if (rows && rows.length) {
        setArrayMes('ingresos', rows, mes);
        return rows;
      }
    } catch(e) {
      console.warn('[API_Ingresos.get] Supabase error, usando local:', e.message);
    }
    return getDataMes(mes).ingresos || [];
  },

  /**
   * Guarda un ingreso en Supabase y en localStorage.
   * @param {object} rec - registro de ingreso
   * @param {string} mes - "YYYY-MM"
   */
  async upsert(rec, mes) {
    mes = mes || getMesGlobal();
    // Guardar local primero (offline-first)
    const local = getDataMes(mes);
    const idx = (local.ingresos || []).findIndex(r => r.id === rec.id);
    if (idx >= 0) local.ingresos[idx] = rec;
    else local.ingresos = [...(local.ingresos || []), rec];
    setDataMes(mes, local);
    // Sincronizar con Supabase
    try {
      if (typeof DB_Ingresos !== 'undefined') await DB_Ingresos.upsert(rec);
    } catch(e) {
      console.warn('[API_Ingresos.upsert] Supabase error, guardado local:', e.message);
    }
    return rec;
  },

  /**
   * Elimina un ingreso del mes indicado.
   */
  async del(id, mes) {
    mes = mes || getMesGlobal();
    const local = getDataMes(mes);
    local.ingresos = (local.ingresos || []).filter(r => r.id !== id);
    setDataMes(mes, local);
    try {
      if (typeof DB_Ingresos !== 'undefined') await DB_Ingresos.del(id, mes);
    } catch(e) {
      console.warn('[API_Ingresos.del] Supabase error:', e.message);
    }
  },

  /** Retorna todos los ingresos de todos los meses (para análisis histórico) */
  async getHistorico() {
    try {
      return await DB_Ingresos.getAll();
    } catch(e) {
      // Reconstruir desde localStorage
      const db = getFinanzas();
      return Object.values(db).flatMap(d => d.ingresos || []);
    }
  }
};

// ─── GASTOS ───────────────────────────────────────────────────────────────────
const API_Gastos = {

  /** Obtiene gastos fijos del mes */
  async getFijos(mes) {
    mes = mes || getMesGlobal();
    try {
      const fijos = await DB_Gastos.getFijos();
      const montos = await DB_Gastos.getMes(mes);
      return { fijos, montos };
    } catch(e) {
      console.warn('[API_Gastos.getFijos] Supabase error, usando local:', e.message);
      const local = getDataMes(mes);
      return { fijos: local.gastosFijos || [], montos: local.gastosMontos || {} };
    }
  },

  /** Guarda el monto de un gasto fijo para el mes */
  async upsertMes(gastoId, monto, mes) {
    mes = mes || getMesGlobal();
    const local = getDataMes(mes);
    local.gastosMontos = local.gastosMontos || {};
    local.gastosMontos[gastoId] = monto;
    setDataMes(mes, local);
    try {
      if (typeof DB_Gastos !== 'undefined') await DB_Gastos.upsertMes(gastoId, mes, monto);
    } catch(e) {
      console.warn('[API_Gastos.upsertMes] Supabase error:', e.message);
    }
  },

  /** Obtiene gastos variables del mes */
  async getVars(mes) {
    mes = mes || getMesGlobal();
    try {
      const rows = await DB_Gastos.getVars(mes);
      if (rows && rows.length) {
        const local = getDataMes(mes);
        local.gastosVars = rows;
        setDataMes(mes, local);
        return rows;
      }
    } catch(e) {
      console.warn('[API_Gastos.getVars] Supabase error, usando local:', e.message);
    }
    return getDataMes(mes).gastosVars || [];
  },

  /** Inserta un gasto variable */
  async insertVar(rec, mes) {
    mes = mes || getMesGlobal();
    const local = getDataMes(mes);
    local.gastosVars = [...(local.gastosVars || []), rec];
    setDataMes(mes, local);
    try {
      if (typeof DB_Gastos !== 'undefined') await DB_Gastos.insertVar(rec);
    } catch(e) {
      console.warn('[API_Gastos.insertVar] Supabase error:', e.message);
    }
    return rec;
  },

  /** Elimina un gasto variable */
  async delVar(id, mes) {
    mes = mes || getMesGlobal();
    const local = getDataMes(mes);
    local.gastosVars = (local.gastosVars || []).filter(r => r.id !== id);
    setDataMes(mes, local);
    try {
      if (typeof DB_Gastos !== 'undefined') await DB_Gastos.delVar(id, mes);
    } catch(e) {
      console.warn('[API_Gastos.delVar] Supabase error:', e.message);
    }
  }
};

// ─── COMPRAS ──────────────────────────────────────────────────────────────────
const API_Compras = {

  /** Obtiene compras del mes indicado */
  async get(mes) {
    mes = mes || getMesGlobal();
    const [y, mStr] = mes.split('-');
    const m = parseInt(mStr);
    try {
      const all = await DB_Compras.getAll();
      const filtradas = all.filter(r => {
        if (!r.fecha) return false;
        const [ry, rm] = r.fecha.split('-').map(Number);
        return ry === parseInt(y) && rm === m;
      });
      setArrayMes('compras', filtradas, mes);
      return filtradas;
    } catch(e) {
      console.warn('[API_Compras.get] Supabase error, usando local:', e.message);
      return getDataMes(mes).compras || [];
    }
  },

  /** Inserta una compra */
  async insert(rec, mes) {
    mes = mes || getMesGlobal();
    const local = getDataMes(mes);
    local.compras = [...(local.compras || []), rec];
    setDataMes(mes, local);
    try {
      if (typeof DB_Compras !== 'undefined') await DB_Compras.insert(rec);
    } catch(e) {
      console.warn('[API_Compras.insert] Supabase error:', e.message);
    }
    return rec;
  },

  /** Elimina una compra */
  async del(id, mes) {
    mes = mes || getMesGlobal();
    const local = getDataMes(mes);
    local.compras = (local.compras || []).filter(r => r.id !== id);
    setDataMes(mes, local);
    try {
      if (typeof DB_Compras !== 'undefined') await DB_Compras.del(id);
    } catch(e) {
      console.warn('[API_Compras.del] Supabase error:', e.message);
    }
  },

  /** Retorna todas las compras históricas */
  async getHistorico() {
    try {
      return await DB_Compras.getAll();
    } catch(e) {
      const db = getFinanzas();
      return Object.values(db).flatMap(d => d.compras || []);
    }
  }
};

// ─── ISV ──────────────────────────────────────────────────────────────────────
const API_ISV = {

  /** Obtiene registros ISV del mes indicado */
  async get(mes) {
    mes = mes || getMesGlobal();
    const [y, mStr] = mes.split('-');
    const m = parseInt(mStr);
    try {
      const all = await DB_ISV.getAll();
      return all.filter(r => {
        if (!r.fecha) return false;
        const [ry, rm] = r.fecha.split('-').map(Number);
        return ry === parseInt(y) && rm === m;
      });
    } catch(e) {
      console.warn('[API_ISV.get] Supabase error:', e.message);
      return [];
    }
  },

  /** Inserta un registro ISV */
  async insert(rec) {
    try {
      if (typeof DB_ISV !== 'undefined') return await DB_ISV.insert(rec);
    } catch(e) {
      console.warn('[API_ISV.insert] Supabase error:', e.message);
    }
  }
};

// ─── INVENTARIO ───────────────────────────────────────────────────────────────
const API_Inv = {

  /** Obtiene inventario de un tipo y mes */
  async get(tipo, mes) {
    mes = mes || getMesGlobal();
    const [y, mStr] = mes.split('-');
    const m = parseInt(mStr) - 1; // 0-indexed
    try {
      return await DB_Inv.getInventario(mes, tipo);
    } catch(e) {
      console.warn('[API_Inv.get] Supabase error, usando local:', e.message);
      const local = getDataMes(mes);
      return (local.inventario || {})[tipo] || {};
    }
  },

  /** Guarda cantidad de un producto en inventario */
  async upsert(tipo, producto, cantidad, mes) {
    mes = mes || getMesGlobal();
    const local = getDataMes(mes);
    local.inventario = local.inventario || {};
    local.inventario[tipo] = local.inventario[tipo] || {};
    local.inventario[tipo][producto] = cantidad;
    setDataMes(mes, local);
    try {
      if (typeof DB_Inv !== 'undefined') await DB_Inv.upsertInventario(mes, tipo, producto, cantidad);
    } catch(e) {
      console.warn('[API_Inv.upsert] Supabase error:', e.message);
    }
  },

  /** Precios de productos */
  async getPrecios() {
    try {
      return await DB_Inv.getPrecios();
    } catch(e) {
      return JSON.parse(localStorage.getItem('cayena_precios') || '{}');
    }
  },

  async upsertPrecio(producto, precio) {
    try {
      if (typeof DB_Inv !== 'undefined') await DB_Inv.upsertPrecio(producto, precio);
    } catch(e) {
      console.warn('[API_Inv.upsertPrecio] Supabase error:', e.message);
    }
    const precios = JSON.parse(localStorage.getItem('cayena_precios') || '{}');
    precios[producto] = precio;
    localStorage.setItem('cayena_precios', JSON.stringify(precios));
  }
};

// ─── PLANILLA ─────────────────────────────────────────────────────────────────
const API_Planilla = {

  async getCfg() {
    try {
      return await DB_Planilla.getCfg();
    } catch(e) {
      console.warn('[API_Planilla.getCfg] Supabase error:', e.message);
      return JSON.parse(localStorage.getItem('cayena_planilla_cfg') || '{}');
    }
  },

  async upsertCfg(userId, cfg) {
    try {
      if (typeof DB_Planilla !== 'undefined') await DB_Planilla.upsertCfg(userId, cfg);
    } catch(e) {
      console.warn('[API_Planilla.upsertCfg] Supabase error:', e.message);
    }
    const local = JSON.parse(localStorage.getItem('cayena_planilla_cfg') || '{}');
    local[userId] = cfg;
    localStorage.setItem('cayena_planilla_cfg', JSON.stringify(local));
  }
};

// ─── ASISTENCIA ───────────────────────────────────────────────────────────────
const API_Asist = {

  async getByUser(userId) {
    try {
      return await DB_Asist.getByUser(userId);
    } catch(e) {
      console.warn('[API_Asist.getByUser] Supabase error:', e.message);
      return JSON.parse(localStorage.getItem('cayena_asist_' + userId) || '[]');
    }
  },

  async getAll() {
    try {
      return await DB_Asist.getAll();
    } catch(e) {
      console.warn('[API_Asist.getAll] Supabase error:', e.message);
      return [];
    }
  },

  async upsert(rec) {
    try {
      if (typeof DB_Asist !== 'undefined') await DB_Asist.upsert(rec);
    } catch(e) {
      console.warn('[API_Asist.upsert] Supabase error:', e.message);
    }
    // Local backup por usuario
    const key = 'cayena_asist_' + rec.userId;
    const local = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = local.findIndex(r => r.fecha === rec.fecha);
    if (idx >= 0) local[idx] = rec; else local.push(rec);
    localStorage.setItem(key, JSON.stringify(local));
  }
};

// ─── SOLICITUDES ──────────────────────────────────────────────────────────────
const API_Sol = {

  async getAll(filtros) {
    try {
      return await DB_Sol.getAll(filtros);
    } catch(e) {
      console.warn('[API_Sol.getAll] Supabase error:', e.message);
      return JSON.parse(localStorage.getItem('cayena_solicitudes_global') || '[]');
    }
  },

  async crear(rec) {
    try {
      return await DB_Sol.crear(rec);
    } catch(e) {
      console.warn('[API_Sol.crear] Supabase error:', e.message);
    }
  },

  async actualizar(id, estado, nota) {
    try {
      return await DB_Sol.actualizar(id, estado, nota);
    } catch(e) {
      console.warn('[API_Sol.actualizar] Supabase error:', e.message);
    }
  }
};

// ─── NOMBRES ──────────────────────────────────────────────────────────────────
const API_Names = {

  async get() {
    try {
      return await DB_Names.get();
    } catch(e) {
      return JSON.parse(localStorage.getItem('cayena_user_names') || '{}');
    }
  },

  async upsertBulk(obj) {
    try {
      if (typeof DB_Names !== 'undefined') await DB_Names.upsertBulk(obj);
    } catch(e) {
      console.warn('[API_Names.upsertBulk] Supabase error:', e.message);
    }
    const local = JSON.parse(localStorage.getItem('cayena_user_names') || '{}');
    Object.assign(local, obj);
    localStorage.setItem('cayena_user_names', JSON.stringify(local));
  }
};

// ─── ANÁLISIS HISTÓRICO (base del Spotify Wrap) ───────────────────────────────
const API_Analisis = {

  /**
   * Resumen financiero de un mes.
   * Retorna { mes, ingresos, gastos, compras, utilidad }
   */
  async getResumenMes(mes) {
    mes = mes || getMesGlobal();
    const ingresos = await API_Ingresos.get(mes);
    const vars     = await API_Gastos.getVars(mes);
    const compras  = await API_Compras.get(mes);

    const totalIngresos = ingresos.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
    const totalGastos   = vars.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
    const totalCompras  = compras.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);

    const resumen = {
      mes,
      label:     mesEtiqueta(mes),
      ingresos:  parseFloat(totalIngresos.toFixed(2)),
      gastos:    parseFloat(totalGastos.toFixed(2)),
      compras:   parseFloat(totalCompras.toFixed(2)),
      utilidad:  parseFloat((totalIngresos - totalGastos - totalCompras).toFixed(2))
    };

    // Guardar resumen en estructura local
    const local = getDataMes(mes);
    local.resumen = resumen;
    setDataMes(mes, local);

    return resumen;
  },

  /**
   * Días de la semana con más ventas (base del Spotify Wrap).
   * Analiza todos los ingresos históricos disponibles.
   */
  async getDiasMasAltos() {
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const totales = [0, 0, 0, 0, 0, 0, 0];
    const conteos = [0, 0, 0, 0, 0, 0, 0];
    try {
      const all = await API_Ingresos.getHistorico();
      all.forEach(r => {
        if (!r.fecha) return;
        const d = new Date(r.fecha + 'T12:00:00').getDay();
        totales[d] += parseFloat(r.total) || 0;
        conteos[d]++;
      });
    } catch(e) {}
    return dias.map((nombre, i) => ({
      dia: nombre,
      total:   parseFloat(totales[i].toFixed(2)),
      promedio: conteos[i] ? parseFloat((totales[i] / conteos[i]).toFixed(2)) : 0,
      registros: conteos[i]
    })).sort((a, b) => b.total - a.total);
  },

  /**
   * Tendencia mensual: array de resúmenes de los últimos N meses.
   * Base para gráficas de tendencia.
   */
  async getTendencia(meses) {
    meses = meses || 6;
    const rango = getMesesRango('2026-01').slice(0, meses);
    const resultados = [];
    for (const mes of rango) {
      try {
        const r = await API_Analisis.getResumenMes(mes);
        resultados.push(r);
      } catch(e) {}
    }
    return resultados.reverse(); // cronológico
  }
};

// ─── BACKUP / EXPORT ──────────────────────────────────────────────────────────
const API_Backup = {

  /** Exporta todo el objeto finanzas como JSON descargable */
  exportJSON() {
    const db  = getFinanzas();
    const str = JSON.stringify(db, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'cayena-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Exporta ingresos del mes activo como CSV */
  exportCSV(mes) {
    mes = mes || getMesGlobal();
    const data = getDataMes(mes);
    const rows = data.ingresos || [];
    if (!rows.length) { alert('No hay ingresos en ' + mesEtiqueta(mes)); return; }

    const headers = Object.keys(rows[0]).join(',');
    const lines   = rows.map(r => Object.values(r).map(v =>
      typeof v === 'string' && v.includes(',') ? `"${v}"` : v
    ).join(','));
    const csv  = [headers, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'cayena-ingresos-' + mes + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Importa un backup JSON y lo fusiona con localStorage */
  importJSON(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        const current  = getFinanzas();
        const merged   = { ...current, ...imported };
        localStorage.setItem(FINANZAS_KEY, JSON.stringify(merged));
        alert('Backup importado correctamente (' + Object.keys(imported).length + ' meses)');
        location.reload();
      } catch {
        alert('Error: archivo JSON inválido');
      }
    };
    reader.readAsText(file);
  }
};

// ─── VERIFICACIÓN ─────────────────────────────────────────────────────────────
console.log('[api.js] ✓ Cargado. Módulos: Ingresos, Gastos, Compras, ISV, Inv, Planilla, Asist, Sol, Names, Analisis, Backup');
