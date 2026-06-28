import { Router } from 'express';
import { query, queryOne, insert, execute } from '../db/database.js';

export const router = Router();

router.get('/', (req, res) => {
  const participantes = query(
    'SELECT * FROM participantes WHERE usuario_id = ? AND activo = 1 ORDER BY nombre',
    [req.user.id]
  );
  const esAdmin = req.user.email === process.env.ADMIN_EMAIL;
  const usuarios = esAdmin ? query('SELECT id, email, nombre, foto, ultimo_acceso, creado_en FROM usuarios ORDER BY creado_en DESC') : null;
  res.render('participantes', { user: req.user, participantes, sin_participantes: req.query.sin_participantes === '1', error: req.query.error, usuarios });
});

router.post('/nuevo', (req, res) => {
  const { nombre, telefono } = req.body;
  if (!nombre || nombre.trim().length === 0) {
    return res.redirect('/participantes?error=nombre_vacio');
  }
  const tel = telefono ? telefono.trim() : '';
  if (!tel) {
    return res.redirect('/participantes?error=telefono_vacio');
  }
  const dup = queryOne('SELECT id FROM participantes WHERE telefono = ? AND activo = 1', [tel]);
  if (dup) {
    return res.redirect('/participantes?error=telefono_duplicado');
  }
  insert('participantes', { usuario_id: req.user.id, nombre: nombre.trim(), telefono: tel });
  res.redirect('/participantes');
});

router.post('/editar/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) return res.redirect('/participantes?error=id_invalido');
  const { nombre, telefono } = req.body;
  if (!nombre || nombre.trim().length === 0) {
    return res.redirect('/participantes?error=nombre_vacio');
  }
  const tel = telefono ? telefono.trim() : '';
  if (!tel) {
    return res.redirect('/participantes?error=telefono_vacio');
  }
  const existente = queryOne('SELECT id FROM participantes WHERE id = ? AND usuario_id = ?', [id, req.user.id]);
  if (!existente) return res.redirect('/participantes?error=no_encontrado');
  const dup = queryOne('SELECT id FROM participantes WHERE telefono = ? AND id != ? AND activo = 1', [tel, id]);
  if (dup) {
    return res.redirect('/participantes?error=telefono_duplicado');
  }
  execute(
    'UPDATE participantes SET nombre = ?, telefono = ? WHERE id = ? AND usuario_id = ?',
    [nombre.trim(), tel, id, req.user.id]
  );
  res.redirect('/participantes');
});

router.post('/eliminar/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 1) return res.redirect('/participantes?error=id_invalido');
  const existente = queryOne('SELECT id FROM participantes WHERE id = ? AND usuario_id = ?', [id, req.user.id]);
  if (!existente) return res.redirect('/participantes?error=no_encontrado');
  execute(
    'UPDATE participantes SET activo = 0 WHERE id = ? AND usuario_id = ?',
    [id, req.user.id]
  );
  res.redirect('/participantes');
});
