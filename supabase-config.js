/**
 * supabase-config.js — Cayena
 * Cliente Supabase para todos los módulos del sistema.
 * Incluir con: <script src="supabase-config.js"></script>
 */
 
// ─── CREDENCIALES ─────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://wudjqmxerkluykveocru.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1ZGpxbXhlcmtsdXlrdmVvY3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODYzODUsImV4cCI6MjA4OTk2MjM4NX0.iaV4kcS1A3ZMeBKCyEKxcNXxSJAZfOfswVflgzEhrUA';
// ─────────────────────────────────────────────────────────────────────────────
 
const _H = () => ({
  'Content-Type':  'application/json',
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
  'Prefer':        'return=representation'
});
 
const _url  = (t, q='') => `${SUPABASE_URL}/rest/v1/${t}${q ? '?'+q : '?select=*'}`;
const _err  = async r    => { const t=await r.text().catch(()=>''); throw new Error(`${r.status}: ${t}`); };
 
// ─── CLIENTE BASE ─────────────────────────────────────────────────────────────
const SB = {
  async get(table, qs='select=*') {
    const r = await fetch(_url(table, qs), { headers:_H() });
    if(!r.ok) await _err(r); return r.json();
  },
  async post(table, body, prefer='return=representation') {
    const r = await fetch(_url(table,''), {
      method:'POST', headers:{..._H(), Prefer:prefer}, body:JSON.stringify(body)
    });
    if(!r.ok) await _err(r); return r.json().catch(()=>null);
  },
  async upsert(table, body, conflict='id') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
      method:'POST',
      headers:{..._H(), Prefer:'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify(body)
    });
    if(!r.ok) await _err(r); return r.json().catch(()=>null);
  },
  async patch(table, qs, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
      method:'PATCH', headers:_H(), body:JSON.stringify(body)
    });
    if(!r.ok) await _err(r); return r.json().catch(()=>null);
  },
  async del(table, qs) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
      method:'DELETE', headers:_H()
    });
    if(!r.ok) await _err(r); return true;
  }
};
 
// ─── CACHE ────────────────────────────────────────────────────────────────────
const Cache = {
  _s:{}, _ttl: 5 * 60 * 1000, // 5 minutos en memoria
  _lsPrefix: 'cayena_cache_',
  set(k,d){
    this._s[k]={d,t:Date.now()};
    // Persistir en localStorage para sobrevivir recargas
    try{ localStorage.setItem(this._lsPrefix+k, JSON.stringify({d,t:Date.now()})); }catch(e){}
  },
  get(k){
    // 1. Buscar en memoria
    const e=this._s[k];
    if(e && Date.now()-e.t < this._ttl) return e.d;
    // 2. Buscar en localStorage (cache persistente entre recargas)
    try{
      const ls = localStorage.getItem(this._lsPrefix+k);
      if(ls){
        const p = JSON.parse(ls);
        if(p && Date.now()-p.t < this._ttl){
          this._s[k]=p; // restaurar en memoria
          return p.d;
        }
      }
    }catch(e){}
    return null;
  },
  del(k){
    delete this._s[k];
    try{ localStorage.removeItem(this._lsPrefix+k); }catch(e){}
  },
  clear(){
    this._s={};
    // Limpiar solo las keys del cache de Supabase
    try{
      Object.keys(localStorage)
        .filter(k=>k.startsWith(this._lsPrefix))
        .forEach(k=>localStorage.removeItem(k));
    }catch(e){}
  }
};
 
// ─── MÓDULO: SOLICITUDES (Cuenta Corriente ↔ Planilla) ───────────────────────
const DB_Sol = {
  async getAll(filtros={}){
    const ck='sol_all'+JSON.stringify(filtros);
    if(Cache.get(ck)) return Cache.get(ck);
    let qs='select=*&order=created_at.desc';
    if(filtros.userId) qs+=`&user_id=eq.${filtros.userId}`;
    if(filtros.estado) qs+=`&estado=eq.${filtros.estado}`;
    const rows = await SB.get('solicitudes', qs);
    const data = rows.map(s=>({
      id:s.id, tipo:s.tipo, monto:parseFloat(s.monto),
      fecha:s.fecha, cuotas:s.cuotas, desc:s.descripcion,
      estado:s.estado, notaAdmin:s.nota_admin,
      createdAt:new Date(s.created_at).getTime(),
      procesadoEn:s.updated_at?new Date(s.updated_at).getTime():null,
      userId:s.user_id, userName:s.user_name
    }));
    Cache.set(ck, data); return data;
  },
  async crear(rec){
    Cache.clear();
    return SB.post('solicitudes',{
      id:rec.id, user_id:Number(rec.userId), user_name:rec.userName,
      tipo:rec.tipo, monto:rec.monto, fecha:rec.fecha,
      cuotas:rec.cuotas||null, descripcion:rec.desc||null, estado:'pending'
    });
  },
  async actualizar(id, estado, nota=null){
    Cache.clear();
    const body={estado};
    if(nota) body.nota_admin=nota;
    return SB.patch('solicitudes',`id=eq.${id}`,body);
  }
};
 
// ─── MÓDULO: PLANILLA ─────────────────────────────────────────────────────────
const DB_Planilla = {
  async getCfg(){
    const ck='emp_cfg';
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('empleados_cfg','select=*');
    const map={};
    rows.forEach(r=>{ map[r.user_id]={
      sueldo:parseFloat(r.sueldo)||0, bono:parseFloat(r.bono)||0,
      horaPago:parseFloat(r.hora_pago)||0,
      horasAcordadas:parseFloat(r.horas_acordadas)||0,
      notas:r.notas||''
    }; });
    Cache.set(ck,map); return map;
  },
  async upsertCfg(userId, cfg){
    Cache.del('emp_cfg');
    return SB.upsert('empleados_cfg',{
      user_id:Number(userId), user_name:cfg.userName||'',
      sueldo:cfg.sueldo||0, bono:cfg.bono||0,
      hora_pago:cfg.horaPago||0, horas_acordadas:cfg.horasAcordadas||0,
      notas:cfg.notas||''
    },'user_id');
  },
  async getHoras(userId, periodo){
    const ck=`horas_${userId}_${periodo}`;
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('horas_periodo',`user_id=eq.${userId}&periodo=eq.${encodeURIComponent(periodo)}&select=*`);
    const v = rows[0]?parseFloat(rows[0].horas)||0:0;
    Cache.set(ck,v); return v;
  },
  async upsertHoras(userId, periodo, horas){
    Cache.del(`horas_${userId}_${periodo}`);
    return SB.upsert('horas_periodo',{
      user_id:Number(userId), periodo, horas:parseFloat(horas)||0
    },'user_id,periodo');
  }
};
 
// ─── MÓDULO: NOMBRES DE USUARIOS ─────────────────────────────────────────────
const DB_Names = {
  async get(){
    const ck='user_names';
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('user_names','select=*');
    const map={};
    rows.forEach(r=>{ map[r.user_id]=r.nombre; });
    Cache.set(ck,map); return map;
  },
  async upsert(userId, nombre){
    Cache.del('user_names');
    return SB.upsert('user_names',{user_id:Number(userId),nombre},'user_id');
  },
  async upsertBulk(namesObj){
    Cache.del('user_names');
    const rows=Object.entries(namesObj).map(([id,n])=>({user_id:Number(id),nombre:n}));
    return SB.upsert('user_names',rows,'user_id');
  }
};
 
// ─── MÓDULO: ASISTENCIA ───────────────────────────────────────────────────────
const DB_Asist = {
  async getByUser(userId){
    const ck=`asist_${userId}`;
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('asistencia',`user_id=eq.${userId}&select=*&order=fecha.desc`);
    const data=rows.map(r=>({
      id:r.id, fecha:r.fecha, entrada:r.entrada, entradaTs:r.entrada_ts,
      salida:r.salida, salidaTs:r.salida_ts,
      horasTrabajadas:r.horas_trabajadas?parseFloat(r.horas_trabajadas):null,
      userId:r.user_id, userName:r.user_name, wifiOk:r.wifi_ok
    }));
    Cache.set(ck,data); return data;
  },
  async getAll(){
    const ck='asist_all';
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('asistencia','select=*&order=fecha.desc');
    Cache.set(ck,rows); return rows;
  },
  async upsert(rec){
    Cache.del(`asist_${rec.userId}`);
    Cache.del('asist_all');
    return SB.upsert('asistencia',{
      id:rec.id, user_id:Number(rec.userId), user_name:rec.userName,
      fecha:rec.fecha, entrada:rec.entrada||null, entrada_ts:rec.entradaTs||null,
      salida:rec.salida||null, salida_ts:rec.salidaTs||null,
      horas_trabajadas:rec.horasTrabajadas||null, wifi_ok:rec.wifiOk||false
    },'user_id,fecha');
  }
};
 
// ─── MÓDULO: INGRESOS ─────────────────────────────────────────────────────────
const DB_Ingresos = {
  async getByPeriodo(periodo){
    const ck=`ing_${periodo}`;
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('ingresos',`periodo=eq.${encodeURIComponent(periodo)}&select=*&order=fecha.asc`);
    Cache.set(ck,rows); return rows;
  },
  async getAll(){
    const rows = await SB.get('ingresos','select=*&order=fecha.desc');
    return rows;
  },
  async upsert(rec){
    Cache.del(`ing_${rec.periodo}`);
    return SB.upsert('ingresos',{
      id:rec.id, fecha:rec.fecha, efectivo:rec.efectivo||0,
      transferencia:rec.transferencia||0, pos:rec.pos||0,
      pos_ib_neto:rec.posIbNeto||0, otros:rec.otros||0,
      total:rec.total||0, notas:rec.notas||null, periodo:rec.periodo
    },'id');
  },
  async del(id, periodo){
    Cache.del(`ing_${periodo}`);
    return SB.del('ingresos',`id=eq.${id}`);
  }
};
 
// ─── MÓDULO: COMPRAS ──────────────────────────────────────────────────────────
const DB_Compras = {
  async getAll(){
    const ck='compras_all';
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('compras','select=*&order=fecha.desc');
    Cache.set(ck,rows); return rows;
  },
  async insert(rec){
    Cache.del('compras_all');
    return SB.post('compras',{
      id:rec.id, fecha:rec.fecha, proveedor:rec.proveedor||null,
      descripcion:rec.descripcion||null, monto:rec.monto||0,
      isv:rec.isv||'exento', pago:rec.pago||'Transferencia',
      categoria:rec.categoria||null, notas:rec.notas||null
    });
  },
  async del(id){
    Cache.del('compras_all');
    return SB.del('compras',`id=eq.${id}`);
  }
};
 
// ─── MÓDULO: GASTOS ───────────────────────────────────────────────────────────
const DB_Gastos = {
  async getFijos(){
    const ck='gastos_fijos';
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('gastos_fijos','select=*&order=orden.asc');
    Cache.set(ck,rows); return rows;
  },
  async upsertFijo(g){
    Cache.del('gastos_fijos');
    return SB.upsert('gastos_fijos',{
      id:g.id, nombre:g.nombre||'', descripcion:g.desc||null,
      monto_base:g.montoBase??null, fijo:g.fijo||false,
      cuenta:g.cuenta||'Otros Gastos Administrativos',
      isv:g.isv||'exento', pago:g.pago||'Transferencia', orden:g.orden||0
    },'id');
  },
  async upsertFijoBulk(gastos){
    Cache.del('gastos_fijos');
    return SB.upsert('gastos_fijos', gastos.map((g,i)=>({
      id:g.id, nombre:g.nombre||'', descripcion:g.desc||null,
      monto_base:g.montoBase??null, fijo:g.fijo||false,
      cuenta:g.cuenta||'Otros Gastos Administrativos',
      isv:g.isv||'exento', pago:g.pago||'Transferencia', orden:i
    })),'id');
  },
  async delFijo(id){
    Cache.del('gastos_fijos');
    Cache.del('gastos_mes_all');
    return SB.del('gastos_fijos',`id=eq.${id}`);
  },
  async getMes(periodo){
    const ck=`gastos_mes_${periodo}`;
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('gastos_mes',`periodo=eq.${encodeURIComponent(periodo)}&select=*`);
    const map={};
    rows.forEach(r=>{ map[r.gasto_id]=r.monto===null?null:parseFloat(r.monto); });
    Cache.set(ck,map); return map;
  },
  async upsertMes(gastoId, periodo, monto){
    Cache.del(`gastos_mes_${periodo}`);
    return SB.upsert('gastos_mes',{
      gasto_id:gastoId, periodo,
      monto:monto===''||monto===null?null:parseFloat(monto)
    },'gasto_id,periodo');
  },
  async getVars(periodo){
    const ck=`gastos_vars_${periodo}`;
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('gastos_variables',`periodo=eq.${encodeURIComponent(periodo)}&select=*&order=created_at.asc`);
    const data=rows.map(r=>({
      id:r.id, nombre:r.nombre, desc:r.descripcion, monto:parseFloat(r.monto)||0,
      fecha:r.fecha, isv:r.isv, cuenta:r.cuenta, pago:r.pago, periodo:r.periodo
    }));
    Cache.set(ck,data); return data;
  },
  async insertVar(rec){
    Cache.del(`gastos_vars_${rec.periodo}`);
    return SB.post('gastos_variables',{
      id:rec.id, periodo:rec.periodo, nombre:rec.nombre||'',
      descripcion:rec.desc||null, monto:rec.monto||0,
      fecha:rec.fecha||null, isv:rec.isv||'exento',
      cuenta:rec.cuenta||'Otros Gastos Administrativos',
      pago:rec.pago||'Transferencia'
    });
  },
  async delVar(id, periodo){
    Cache.del(`gastos_vars_${periodo}`);
    return SB.del('gastos_variables',`id=eq.${id}`);
  }
};
 
// ─── MÓDULO: INVENTARIO ───────────────────────────────────────────────────────
const DB_Inv = {
  async getPrecios(){
    const ck='precios';
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('precios','select=*');
    const map={};
    rows.forEach(r=>{ map[r.producto]=parseFloat(r.precio)||0; });
    Cache.set(ck,map); return map;
  },
  async upsertPrecio(producto, precio){
    Cache.del('precios');
    return SB.upsert('precios',{producto,precio:parseFloat(precio)||0},'producto');
  },
  async getInventario(periodo, tipo){
    const ck=`inv_${periodo}_${tipo}`;
    if(Cache.get(ck)) return Cache.get(ck);
    const rows = await SB.get('inventario',
      `periodo=eq.${encodeURIComponent(periodo)}&tipo=eq.${tipo}&select=*`);
    const map={};
    rows.forEach(r=>{ map[r.producto]=parseFloat(r.cantidad)||0; });
    Cache.set(ck,map); return map;
  },
  async upsertInventario(periodo, tipo, producto, cantidad){
    Cache.del(`inv_${periodo}_${tipo}`);
    return SB.upsert('inventario',{
      periodo, tipo, producto, cantidad:parseFloat(cantidad)||0
    },'periodo,tipo,producto');
  }
};
 
// ─── MÓDULO: ISV ──────────────────────────────────────────────────────────────
const DB_ISV = {
  async getAll(){
    return SB.get('isv_records','select=*&order=fecha.desc');
  },
  async insert(rec){
    return SB.post('isv_records',{
      id:rec.id, fecha:rec.fecha, descripcion:rec.descripcion||null,
      monto:rec.monto||0, isv_tipo:rec.isvTipo||'15',
      isv_monto:rec.isvMonto||0, tipo:rec.tipo||'compra'
    });
  }
};
 
// ─── VERIFICACIÓN ─────────────────────────────────────────────────────────────
// Supabase configurado ✓