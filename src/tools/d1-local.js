/*
 * Base de datos compatible con Cloudflare D1 sobre SQLite de Node (node:sqlite, Node ≥ 22.13).
 * Solo implementa lo que usa src/servidor/api.js: prepare().bind().first()/all()/run() y batch().
 * Se usa en el servidor local de desarrollo y en las pruebas.
 */
'use strict';

let DatabaseSync;
try {
  // Silencia el aviso «experimental» de node:sqlite.
  const emitir = process.emitWarning;
  process.emitWarning = function (w, ...resto) { if (String(w).includes('SQLite')) return; return emitir.call(process, w, ...resto); };
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  DatabaseSync = null;
}

function normalizar(v) { return v === undefined ? null : v; }
function plano(fila) { return fila ? Object.assign({}, fila) : null; }

class Sentencia {
  constructor(db, sql, args) { this.db = db; this.sql = sql; this.args = args || []; }
  bind(...args) { return new Sentencia(this.db, this.sql, args.map(normalizar)); }
  ejecutar() {
    const st = this.db.prepare(this.sql);
    if (/^\s*(SELECT|PRAGMA)/i.test(this.sql)) return { results: st.all(...this.args).map(plano), meta: { changes: 0 } };
    const r = st.run(...this.args);
    return { results: [], meta: { changes: Number(r.changes) } };
  }
  async first() { return plano(this.db.prepare(this.sql).get(...this.args)); }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map(plano) }; }
  async run() { return this.ejecutar(); }
}

function crearD1(ruta) {
  if (!DatabaseSync) {
    throw new Error('Este Node no incluye SQLite (node:sqlite). Instalen Node 22.13 o superior para usar el servidor local.');
  }
  const db = new DatabaseSync(ruta || ':memory:');
  return {
    prepare(sql) { return new Sentencia(db, sql); },
    async batch(sentencias) {
      db.exec('BEGIN');
      try {
        const res = sentencias.map((s) => s.ejecutar());
        db.exec('COMMIT');
        return res;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    cerrar() { db.close(); }
  };
}

module.exports = { crearD1, disponible: !!DatabaseSync };
