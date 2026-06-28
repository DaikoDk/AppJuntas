import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initSchema } from './db/schema.js';
import { query } from './db/database.js';
import { setupAuth, ensureAuth } from './routes/auth.js';
import { router as participantesRouter } from './routes/participantes.js';
import { router as juntasRouter } from './routes/juntas.js';
import { router as pagosRouter } from './routes/pagos.js';
import apiRouter from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

app.use(express.static(join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

const authRouter = setupAuth(app);
app.use(authRouter);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

app.use('/participantes', ensureAuth, participantesRouter);
app.use('/juntas', ensureAuth, juntasRouter);
app.use('/pagos', ensureAuth, pagosRouter);
app.use('/api', ensureAuth, apiRouter);

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('login', { user: null });
});

app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('login', { user: null });
});

app.get('/dashboard', ensureAuth, (req, res) => {
  const juntas = query(`
    SELECT j.*,
      (SELECT COUNT(*) FROM turnos WHERE junta_id = j.id AND activo = 1) as total_turnos,
      (SELECT COUNT(*) FROM (
        SELECT t.id
        FROM turnos t
        LEFT JOIN pagos p ON p.turno_id = t.id
          AND p.ciclo_id = (SELECT id FROM ciclos WHERE junta_id = j.id AND completado = 0 ORDER BY numero ASC LIMIT 1)
        WHERE t.junta_id = j.id AND t.activo = 1
        GROUP BY t.id
        HAVING COALESCE(SUM(p.monto), 0) >= j.monto_aporte
      )) as pagos_actuales
    FROM juntas j
    WHERE j.finalizada = 0 AND j.usuario_id = ?
    ORDER BY j.creado_en DESC
  `, [req.user.id]);

  const alertas = query(`
    SELECT p.nombre as participante_nombre, j.nombre as junta_nombre, j.id as junta_id,
      j.monto_aporte, c.numero as ciclo_numero, c.fecha_cierre,
      round(julianday('now') - julianday(c.fecha_cierre)) as dias_atraso
    FROM turnos t
    JOIN participantes p ON t.participante_id = p.id
    JOIN juntas j ON t.junta_id = j.id
    JOIN ciclos c ON c.junta_id = j.id AND c.completado = 0
    LEFT JOIN pagos pg ON pg.turno_id = t.id AND pg.ciclo_id = c.id
    WHERE t.activo = 1 AND j.usuario_id = ?
      AND pg.id IS NULL
      AND datetime(c.fecha_cierre, '+2 days') < datetime('now', 'localtime')
    ORDER BY c.fecha_cierre DESC
  `, [req.user.id]);

  res.render('dashboard', { user: req.user, juntas, alertas });
});

app.get('/alertas', ensureAuth, (req, res) => {
  const alertas = query(`
    SELECT p.nombre as participante_nombre, j.nombre as junta_nombre, j.id as junta_id,
      j.monto_aporte, c.numero as ciclo_numero, c.fecha_cierre,
      round(julianday('now') - julianday(c.fecha_cierre)) as dias_atraso
    FROM turnos t
    JOIN participantes p ON t.participante_id = p.id
    JOIN juntas j ON t.junta_id = j.id
    JOIN ciclos c ON c.junta_id = j.id AND c.completado = 0
    LEFT JOIN pagos pg ON pg.turno_id = t.id AND pg.ciclo_id = c.id
    WHERE t.activo = 1 AND j.usuario_id = ?
      AND pg.id IS NULL
      AND datetime(c.fecha_cierre, '+2 days') < datetime('now', 'localtime')
    ORDER BY c.fecha_cierre DESC
  `, [req.user.id]);
  res.render('alertas', { user: req.user, alertas });
});

try {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`🚀 Servidor: http://localhost:${PORT}`);
  });
} catch (err) {
  console.error('Error:', err);
}
