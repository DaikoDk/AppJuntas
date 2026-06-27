import { Router } from 'express';
import { query, queryOne, insert, execute } from '../db/database.js';
import { verificarMetaSemanal } from '../services/notificaciones.js';

export const router = Router();

function registrarEnHistorial(juntaId, tipo, turnoId, cicloId, monto, metodoPagoId, fechaPago, fechaRegistro) {
  const turno = queryOne('SELECT participante_id FROM turnos WHERE id = ?', [turnoId]);
  const junta = queryOne('SELECT id FROM juntas WHERE id = ?', [juntaId]);
  if (!turno || !junta) return;

  let descripcion = '';
  const metodo = metodoPagoId ? queryOne('SELECT nombre, icono FROM metodos_pago WHERE id = ?', [metodoPagoId]) : null;

  if (tipo === 'pago') {
    const ciclo = queryOne('SELECT numero FROM ciclos WHERE id = ?', [cicloId]);
    descripcion = `Pagó S/${monto.toFixed(0)} a Semana ${ciclo ? ciclo.numero : '?'} ${metodo ? 'vía ' + metodo.icono + metodo.nombre : ''}`;
  } else if (tipo === 'pago_eliminado') {
    const ciclo = queryOne('SELECT numero FROM ciclos WHERE id = ?', [cicloId]);
    descripcion = `Deshizo pago de S/${monto.toFixed(0)} a Semana ${ciclo ? ciclo.numero : '?'} ${metodo ? '(era ' + metodo.icono + metodo.nombre + ')' : ''}`;
  }

  insert('historial', {
    junta_id: juntaId,
    tipo,
    turno_id: turnoId,
    ciclo_id: cicloId,
    participante_id: turno.participante_id,
    monto,
    metodo_pago_id: metodoPagoId || null,
    fecha_pago: fechaPago || null,
    fecha_registro: fechaRegistro || null,
    descripcion: descripcion.trim(),
  });
}

function verificarCompletadoCiclo(cicloId, juntaId) {
  const ciclo = queryOne('SELECT * FROM ciclos WHERE id = ?', [cicloId]);
  if (!ciclo || ciclo.completado) return;

  const junta = queryOne('SELECT * FROM juntas WHERE id = ?', [juntaId]);
  if (!junta) return;

  const turnosActivos = query(
    'SELECT id FROM turnos WHERE junta_id = ? AND activo = 1',
    [juntaId]
  );

  let todosCompletos = true;
  for (const t of turnosActivos) {
    const total = queryOne(
      'SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE turno_id = ? AND ciclo_id = ?',
      [t.id, cicloId]
    );
    if (total.total < junta.monto_aporte) {
      todosCompletos = false;
      break;
    }
  }

  if (todosCompletos) {
    execute('UPDATE ciclos SET completado = 1 WHERE id = ?', [cicloId]);
    verificarMetaSemanal(juntaId, cicloId);
  }
}

router.post('/registrar', (req, res) => {
  const { turno_id, ciclo_id, junta_id, monto, metodo_pago_id, fecha_pago } = req.body;

  const fp = fecha_pago || new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (new Date(fp) > new Date()) {
    return res.redirect(`/juntas/${junta_id}?error=fecha_futura`);
  }

  const pagoId = insert('pagos', {
    turno_id: parseInt(turno_id),
    ciclo_id: parseInt(ciclo_id),
    monto: parseFloat(monto),
    metodo_pago_id: parseInt(metodo_pago_id || 1),
    fecha_pago: fp,
  });

  const pago = queryOne('SELECT * FROM pagos WHERE id = ?', [pagoId]);
  registrarEnHistorial(
    parseInt(junta_id),
    'pago',
    parseInt(turno_id),
    parseInt(ciclo_id),
    parseFloat(monto),
    parseInt(metodo_pago_id || 1),
    pago.fecha_pago,
    pago.fecha_registro
  );

  verificarCompletadoCiclo(ciclo_id, junta_id);
  res.redirect(`/juntas/${junta_id}`);
});

router.post('/registrar-inteligente', (req, res) => {
  let { turno_id, junta_id, monto, metodo_pago_id, fecha_pago } = req.body;
  monto = parseFloat(monto);
  metodo_pago_id = parseInt(metodo_pago_id || 1);

  const turno = queryOne('SELECT * FROM turnos WHERE id = ?', [turno_id]);
  if (!turno) return res.redirect(`/juntas/${junta_id}`);

  const junta = queryOne('SELECT * FROM juntas WHERE id = ?', [turno.junta_id]);
  if (!junta) return res.redirect(`/juntas/${turno.junta_id}`);

  junta_id = turno.junta_id;
  fecha_pago = fecha_pago || new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (new Date(fecha_pago) > new Date()) {
    return res.redirect(`/juntas/${junta_id}?error=fecha_futura`);
  }

  const ciclosConDeuda = query(`
    SELECT c.id, c.numero, COALESCE(SUM(p.monto), 0) as total_pagado
    FROM ciclos c
    LEFT JOIN pagos p ON p.ciclo_id = c.id AND p.turno_id = ?
    WHERE c.junta_id = ?
    GROUP BY c.id
    HAVING total_pagado < ?
    ORDER BY c.numero ASC
  `, [turno.id, junta.id, junta.monto_aporte]);

  let restante = monto;

  for (const ciclo of ciclosConDeuda) {
    if (restante <= 0) break;
    const deuda = junta.monto_aporte - ciclo.total_pagado;
    const aPagar = Math.min(restante, deuda);

    const pagoId = insert('pagos', {
      turno_id: turno.id,
      ciclo_id: ciclo.id,
      monto: aPagar,
      metodo_pago_id,
      fecha_pago,
    });

    const pago = queryOne('SELECT * FROM pagos WHERE id = ?', [pagoId]);
    registrarEnHistorial(
      junta_id,
      'pago',
      turno.id,
      ciclo.id,
      aPagar,
      metodo_pago_id,
      pago.fecha_pago,
      pago.fecha_registro
    );

    restante -= aPagar;
    verificarCompletadoCiclo(ciclo.id, junta.id);
  }

  res.redirect(`/juntas/${junta_id}`);
});

router.post('/deshacer', (req, res) => {
  const { turno_id, ciclo_id, junta_id } = req.body;

  const ultimoPago = queryOne(`
    SELECT * FROM pagos
    WHERE turno_id = ? AND ciclo_id = ?
    ORDER BY id DESC LIMIT 1
  `, [turno_id, ciclo_id]);

  if (ultimoPago) {
    registrarEnHistorial(
      parseInt(junta_id),
      'pago_eliminado',
      parseInt(turno_id),
      parseInt(ciclo_id),
      ultimoPago.monto,
      ultimoPago.metodo_pago_id,
      ultimoPago.fecha_pago,
      ultimoPago.fecha_registro
    );
    execute('DELETE FROM pagos WHERE id = ?', [ultimoPago.id]);
  }

  execute('UPDATE ciclos SET completado = 0 WHERE id = ?', [ciclo_id]);
  res.redirect(`/juntas/${junta_id}`);
});
