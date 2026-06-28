import { getDb, saveDb, query, execute } from './database.js';

export async function initSchema() {
  const db = await getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE,
      email TEXT,
      nombre TEXT,
      foto TEXT,
      creado_en TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS participantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      telefono TEXT,
      activo INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS juntas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      monto_aporte REAL NOT NULL,
      frecuencia_dias INTEGER NOT NULL DEFAULT 7,
      fecha_inicio TEXT NOT NULL,
      dia_resumen TEXT DEFAULT 'Monday',
      finalizada INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS turnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      junta_id INTEGER NOT NULL,
      participante_id INTEGER NOT NULL,
      orden INTEGER NOT NULL,
      activo INTEGER DEFAULT 1,
      turno_origen_id INTEGER,
      creado_en TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (junta_id) REFERENCES juntas(id),
      FOREIGN KEY (participante_id) REFERENCES participantes(id),
      FOREIGN KEY (turno_origen_id) REFERENCES turnos(id)
    );

    CREATE TABLE IF NOT EXISTS ciclos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      junta_id INTEGER NOT NULL,
      numero INTEGER NOT NULL,
      fecha_cierre TEXT,
      completado INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (junta_id) REFERENCES juntas(id)
    );

    CREATE TABLE IF NOT EXISTS metodos_pago (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      icono TEXT NOT NULL,
      activo INTEGER DEFAULT 1
    );

    INSERT OR IGNORE INTO metodos_pago (id, nombre, icono) VALUES (1, 'Efectivo', '💵');
    INSERT OR IGNORE INTO metodos_pago (id, nombre, icono) VALUES (2, 'Yape', '🟣');
    INSERT OR IGNORE INTO metodos_pago (id, nombre, icono) VALUES (3, 'Plin', '🟢');

    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turno_id INTEGER NOT NULL,
      ciclo_id INTEGER NOT NULL,
      monto REAL NOT NULL,
      metodo_pago_id INTEGER NOT NULL DEFAULT 1,
      fecha_pago TEXT NOT NULL,
      fecha_registro TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (turno_id) REFERENCES turnos(id),
      FOREIGN KEY (ciclo_id) REFERENCES ciclos(id),
      FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id)
    );

    CREATE TABLE IF NOT EXISTS historial (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      junta_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      turno_id INTEGER,
      ciclo_id INTEGER,
      participante_id INTEGER,
      monto REAL,
      metodo_pago_id INTEGER,
      fecha_pago TEXT,
      fecha_registro TEXT,
      descripcion TEXT,
      creado_en TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (junta_id) REFERENCES juntas(id)
    );

    CREATE TABLE IF NOT EXISTS historial_cesiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turno_id INTEGER NOT NULL,
      participante_anterior_id INTEGER NOT NULL,
      participante_nuevo_id INTEGER NOT NULL,
      fecha TEXT DEFAULT (datetime('now', 'localtime')),
      creado_en TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (turno_id) REFERENCES turnos(id),
      FOREIGN KEY (participante_anterior_id) REFERENCES participantes(id),
      FOREIGN KEY (participante_nuevo_id) REFERENCES participantes(id)
    );

    CREATE TABLE IF NOT EXISTS envios_email (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      junta_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      ciclo_id INTEGER,
      enviado_en TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (junta_id) REFERENCES juntas(id),
      FOREIGN KEY (ciclo_id) REFERENCES ciclos(id)
    );

    CREATE TABLE IF NOT EXISTS suscripciones_push (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      suscripcion_json TEXT NOT NULL,
      creado_en TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
  `);

  try {
    execute('ALTER TABLE participantes ADD COLUMN google_id TEXT DEFAULT NULL');
  } catch (e) {
    // ya existe
  }

  try {
    execute('ALTER TABLE usuarios ADD COLUMN ultimo_acceso TEXT DEFAULT NULL');
  } catch (e) {
    // ya existe
  }

  try {
    execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_participantes_telefono ON participantes(telefono)');
  } catch (e) {
    // el índice ya existe o hay duplicados
  }

  const histCheck = query('SELECT COUNT(*) as c FROM historial');
  if (histCheck[0].c === 0) {
    const cesiones = query(`
      SELECT hc.*, t.junta_id,
        pa.nombre as anterior_nombre, pn.nombre as nuevo_nombre
      FROM historial_cesiones hc
      JOIN turnos t ON hc.turno_id = t.id
      JOIN participantes pa ON hc.participante_anterior_id = pa.id
      JOIN participantes pn ON hc.participante_nuevo_id = pn.id
    `);
    for (const hc of cesiones) {
      query(`
        INSERT INTO historial (junta_id, tipo, turno_id, participante_id, descripcion, creado_en)
        VALUES (?, 'cesion', ?, ?, ?, ?)
      `, [hc.junta_id, hc.turno_id, hc.participante_nuevo_id,
        `${hc.anterior_nombre} → ${hc.nuevo_nombre}`, hc.creado_en || hc.fecha
      ]);
    }
  }

  saveDb();
  console.log('✅ Base de datos inicializada');
}
