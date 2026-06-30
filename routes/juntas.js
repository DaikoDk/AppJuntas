import { Router } from 'express';
import { query, queryOne, insert, execute, transaction } from '../db/database.js';

export const router = Router();

function safeId(val) {
  const n = parseInt(val);
  return isNaN(n) || n < 1 ? null : n;
}

router.get('/', (req, res) => {
  const juntas = query(`
    SELECT j.*,
      (SELECT COUNT(*) FROM turnos WHERE junta_id = j.id AND activo = 1) as total_turnos,
      (SELECT COUNT(*) FROM turnos WHERE junta_id = j.id AND activo = 1 
        AND participante_id IN (SELECT id FROM participantes WHERE usuario_id = ?)) as mis_turnos
    FROM juntas j WHERE j.usuario_id = ? ORDER BY j.creado_en DESC
  `, [req.user.id, req.user.id]);
  res.render('juntas', { user: req.user, juntas });
});

router.get('/nueva', (req, res) => {
  const participantes = query(
    'SELECT * FROM participantes WHERE usuario_id = ? AND activo = 1 ORDER BY nombre',
    [req.user.id]
  );
  if (participantes.length === 0) {
    return res.redirect('/participantes?sin_participantes=1');
  }
  res.render('junta-nueva', { user: req.user, participantes, error: req.query.error });
});

router.post('/nueva', (req, res) => {
  const { nombre, monto_aporte, frecuencia_dias, fecha_inicio, participantes } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.redirect('/juntas/nueva?error=sin_nombre');
  }

  const monto = parseFloat(monto_aporte);
  if (!monto || monto <= 0) {
    return res.redirect('/juntas/nueva?error=monto_invalido');
  }

  const frecuencia = parseInt(frecuencia_dias);
  if (!frecuencia || frecuencia < 1) {
    return res.redirect('/juntas/nueva?error=frecuencia_invalida');
  }

  if (!fecha_inicio) {
    return res.redirect('/juntas/nueva?error=fecha_invalida');
  }
  const fechaObj = new Date(fecha_inicio);
  if (isNaN(fechaObj.getTime())) {
    return res.redirect('/juntas/nueva?error=fecha_invalida');
  }

  const count = queryOne(
    'SELECT COUNT(*) as cnt FROM participantes WHERE usuario_id = ? AND activo = 1',
    [req.user.id]
  );
  if (!count || count.cnt === 0) {
    return res.redirect('/participantes?sin_participantes=1');
  }

  let ids = [];
  if (Array.isArray(participantes)) {
    ids = participantes;
  } else if (participantes) {
    ids = [participantes];
  }

  if (ids.length === 0) {
    return res.redirect('/juntas/nueva?error=sin_participantes');
  }

  const idsValidos = ids.map(pid => safeId(pid)).filter(pid => pid !== null);
  if (idsValidos.length === 0 || idsValidos.length !== ids.length) {
    return res.redirect('/juntas/nueva?error=participante_invalido');
  }

  for (const pid of idsValidos) {
    const p = queryOne('SELECT id FROM participantes WHERE id = ? AND usuario_id = ? AND activo = 1', [pid, req.user.id]);
    if (!p) return res.redirect('/juntas/nueva?error=participante_invalido');
  }

  const cantidadTurnos = parseInt(req.body.cantidad_turnos) || idsValidos.length;
  if (idsValidos.length !== cantidadTurnos) {
    return res.redirect('/juntas/nueva?error=sin_participantes');
  }

  try {
    transaction(() => {
      const juntaId = insert('juntas', {
        usuario_id: req.user.id,
        nombre: nombre.trim(),
        monto_aporte: monto,
        frecuencia_dias: frecuencia,
        fecha_inicio,
        dia_resumen: fechaObj.toLocaleDateString('en-US', { weekday: 'long' }),
      });

      idsValidos.forEach((pid, idx) => {
        insert('turnos', {
          junta_id: juntaId,
          participante_id: pid,
          orden: idx + 1,
        });
      });

      const totalTurnos = idsValidos.length;
      const fechaInicioObj = new Date(fecha_inicio);
      for (let i = 0; i < totalTurnos; i++) {
        const fechaCierre = new Date(fechaInicioObj);
        fechaCierre.setDate(fechaCierre.getDate() + i * frecuencia);
        insert('ciclos', {
          junta_id: juntaId,
          numero: i + 1,
          fecha_cierre: fechaCierre.toISOString().split('T')[0],
        });
      }
    });
    return res.redirect('/juntas');
  } catch (e) {
    console.error('Error al crear junta:', e);
    return res.redirect('/juntas/nueva?error=error_general');
  }
});

router.get('/:id', (req, res) => {
  const id = safeId(req.params.id);
  if (!id) return res.redirect('/juntas');

  const junta = queryOne(
    'SELECT * FROM juntas WHERE id = ? AND usuario_id = ?',
    [id, req.user.id]
  );
  if (!junta) return res.redirect('/juntas');

  const turnos = query(`
    SELECT t.*, p.nombre as participante_nombre
    FROM turnos t JOIN participantes p ON t.participante_id = p.id
    WHERE t.junta_id = ? AND t.activo = 1 ORDER BY t.orden
  `, [junta.id]);

  const ciclos = query(
    'SELECT * FROM ciclos WHERE junta_id = ? ORDER BY numero',
    [junta.id]
  );

  const pagos = query(`
    SELECT pg.*, t.id as turno_id_ref, mp.nombre as metodo_nombre, mp.icono as metodo_icono
    FROM pagos pg
    JOIN turnos t ON pg.turno_id = t.id
    JOIN metodos_pago mp ON pg.metodo_pago_id = mp.id
    WHERE t.junta_id = ?
    ORDER BY pg.id ASC
  `, [junta.id]);

  const excesos = query(
    'SELECT turno_id, ciclo_id, monto FROM historial WHERE junta_id = ? AND tipo = ?',
    [junta.id, 'pago_exceso']
  );
  const excesosSet = new Set(excesos.map(e => `${e.turno_id}-${e.ciclo_id}-${e.monto}`));
  pagos.forEach(p => {
    p.esExceso = excesosSet.has(`${p.turno_id_ref}-${p.ciclo_id}-${p.monto}`);
  });

  const pagosPorTurnoCiclo = {};
  pagos.forEach(p => {
    const key = `${p.turno_id_ref}-${p.ciclo_id}`;
    if (!pagosPorTurnoCiclo[key]) pagosPorTurnoCiclo[key] = [];
    pagosPorTurnoCiclo[key].push(p);
  });

  const balancePorTurno = {};
  turnos.forEach(t => {
    const totalPagado = queryOne(
      'SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE turno_id = ?',
      [t.id]
    ).total;
    const totalEsperado = junta.monto_aporte * ciclos.length;
    balancePorTurno[t.id] = {
      total_pagado: totalPagado,
      total_debido: totalEsperado,
      saldo: totalPagado - totalEsperado,
    };
  });

  let cicloActualIdx = 0;
  for (let i = 0; i < ciclos.length; i++) {
    const c = ciclos[i];
    if (!c.completado) {
      cicloActualIdx = i;
      break;
    }
  }

  const metodosPago = query(
    'SELECT * FROM metodos_pago WHERE activo = 1 ORDER BY id'
  );

  const historial = query(`
    SELECT h.*, p.nombre as participante_nombre
    FROM historial h
    LEFT JOIN participantes p ON h.participante_id = p.id
    WHERE h.junta_id = ?
    ORDER BY h.id DESC
  `, [junta.id]);

  const participantes = query(
    'SELECT * FROM participantes WHERE usuario_id = ? AND activo = 1 ORDER BY nombre',
    [req.user.id]
  );

  res.render('junta', {
    user: req.user,
    junta,
    error: req.query.error,
    turnos,
    ciclos,
    pagosPorTurnoCiclo,
    balancePorTurno,
    cicloActualIdx,
    metodosPago,
    historial,
    participantes,
  });
});

router.get('/:id/historial', (req, res) => {
  const id = safeId(req.params.id);
  if (!id) return res.redirect('/juntas');

  const junta = queryOne(
    'SELECT * FROM juntas WHERE id = ? AND usuario_id = ?',
    [id, req.user.id]
  );
  if (!junta) return res.redirect('/juntas');

  const historial = query(`
    SELECT h.*,
      p.nombre as participante_nombre,
      c.numero as ciclo_numero,
      mp.nombre as metodo_nombre,
      mp.icono as metodo_icono
    FROM historial h
    LEFT JOIN participantes p ON h.participante_id = p.id
    LEFT JOIN ciclos c ON h.ciclo_id = c.id
    LEFT JOIN metodos_pago mp ON h.metodo_pago_id = mp.id
    WHERE h.junta_id = ?
    ORDER BY h.id DESC
  `, [junta.id]);

  res.render('historial', { user: req.user, junta, historial });
});

router.post('/:id/ceder', (req, res) => {
  const junta_id = safeId(req.params.id);
  const turno_id = safeId(req.body.turno_id);
  const nuevo_participante_id = safeId(req.body.nuevo_participante_id);

  if (!junta_id || !turno_id || !nuevo_participante_id) {
    return res.redirect(`/juntas/${junta_id || ''}?error=parametros_invalidos`);
  }

  const junta = queryOne('SELECT id FROM juntas WHERE id = ? AND usuario_id = ?', [junta_id, req.user.id]);
  if (!junta) return res.redirect('/juntas');

  const turno = queryOne(
    'SELECT * FROM turnos WHERE id = ? AND junta_id = ?',
    [turno_id, junta_id]
  );
  if (!turno) return res.redirect(`/juntas/${junta_id}`);

  const nuevoParticipante = queryOne(
    'SELECT id, nombre FROM participantes WHERE id = ? AND usuario_id = ? AND activo = 1',
    [nuevo_participante_id, req.user.id]
  );
  if (!nuevoParticipante) return res.redirect(`/juntas/${junta_id}?error=participante_invalido`);

  const anterior = queryOne('SELECT nombre FROM participantes WHERE id = ?', [turno.participante_id]);

  try {
    transaction(() => {
      insert('historial_cesiones', {
        turno_id: turno.id,
        participante_anterior_id: turno.participante_id,
        participante_nuevo_id: nuevoParticipante.id,
      });

      insert('historial', {
        junta_id,
        tipo: 'cesion',
        turno_id: turno.id,
        participante_id: nuevoParticipante.id,
        descripcion: `${anterior ? anterior.nombre : '?'} → ${nuevoParticipante.nombre}`,
      });

      insert('turnos', {
        junta_id: turno.junta_id,
        participante_id: nuevoParticipante.id,
        orden: turno.orden,
        turno_origen_id: turno.id,
      });

      execute('UPDATE turnos SET activo = 0 WHERE id = ?', [turno.id]);
    });
    return res.redirect(`/juntas/${junta_id}`);
  } catch (e) {
    console.error('Error en ceder:', e);
    return res.redirect(`/juntas/${junta_id}?error=error_general`);
  }
});
