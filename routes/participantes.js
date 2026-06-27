import { Router } from 'express';
import { query, insert, execute } from '../db/database.js';

export const router = Router();

router.get('/', (req, res) => {
  const participantes = query(
    'SELECT * FROM participantes WHERE usuario_id = ? AND activo = 1 ORDER BY nombre',
    [req.user.id]
  );
  res.render('participantes', { user: req.user, participantes, sin_participantes: req.query.sin_participantes === '1' });
});

router.post('/nuevo', (req, res) => {
  const { nombre, telefono } = req.body;
  insert('participantes', { usuario_id: req.user.id, nombre, telefono: telefono || '' });
  res.redirect('/participantes');
});

router.post('/editar/:id', (req, res) => {
  const { nombre, telefono } = req.body;
  execute(
    'UPDATE participantes SET nombre = ?, telefono = ? WHERE id = ? AND usuario_id = ?',
    [nombre, telefono || '', req.params.id, req.user.id]
  );
  res.redirect('/participantes');
});

router.post('/eliminar/:id', (req, res) => {
  execute(
    'UPDATE participantes SET activo = 0 WHERE id = ? AND usuario_id = ?',
    [req.params.id, req.user.id]
  );
  res.redirect('/participantes');
});
