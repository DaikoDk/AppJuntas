import { Router } from 'express';
import { query, queryOne, insert, execute, transaction } from '../db/database.js';
import { verificarMetaSemanal } from '../services/notificaciones.js';

export const router = Router();

function safeId(val) {
  const n = parseInt(val);
  return isNaN(n) || n < 1 ? null : n;
}

function safeFloat(val) {
  const n = parseFloat(val);
  return isNaN(n) || n < 0 ? null : n;
}

function safeFecha(val) {
  if (!val) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return val;
}

function registrarEnHistorial(juntaId, tipo, turnoId, cicloId, monto, metodoPagoId, fechaPago, fechaRegistro) {
  const turno = queryOne('SELECT participante_id FROM turnos WHERE id = ?', [turnoId]);
  const junta = queryOne('SELECT id FROM juntas WHERE id = ?', [juntaId]);
  if (!turno || !junta) return;

  let descripcion = '';
  const montoNum = safeFloat(monto) || 0;
  const metodo = metodoPagoId ? queryOne('SELECT nombre, icono FROM metodos_pago WHERE id = ?', [metodoPagoId]) : null;

  if (tipo === 'pago') {
    const ciclo = queryOne('SELECT numero FROM ciclos WHERE id = ?', [cicloId]);
    descripcion = `Pagó S/${montoNum.toFixed(0)} a Semana ${ciclo ? ciclo.numero : '?'} ${metodo ? 'vía ' + metodo.icono + metodo.nombre : ''}`;
  } else if (tipo === 'pago_eliminado') {
    const ciclo = queryOne('SELECT numero FROM ciclos WHERE id = ?', [cicloId]);
    descripcion = `Deshizo pago de S/${montoNum.toFixed(0)} a Semana ${ciclo ? ciclo.numero : '?'} ${metodo ? '(era ' + metodo.icono + metodo.nombre + ')' : ''}`;
  }

  insert('historial', {
    junta_id: juntaId,
    tipo,
    turno_id: turnoId,
    ciclo_id: cicloId,
    participante_id: turno.participante_id,
    monto: montoNum,
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
  const turno_id = safeId(req.body.turno_id);
  const ciclo_id = safeId(req.body.ciclo_id);
  const junta_id = safeId(req.body.junta_id);
  const monto = safeFloat(req.body.monto);
  const metodo_pago_id = safeId(req.body.metodo_pago_id) || 1;
  const fecha_pago = safeFecha(req.body.fecha_pago);

  if (!turno_id || !ciclo_id || !junta_id) {
    return res.redirect(`/juntas/${junta_id || ''}?error=parametros_invalidos`);
  }
  if (monto === null || monto <= 0) {
    return res.redirect(`/juntas/${junta_id}?error=monto_invalido`);
  }
  if (new Date(fecha_pago) > new Date()) {
    return res.redirect(`/juntas/${junta_id}?error=fecha_futura`);
  }

  const turnoVal = queryOne('SELECT id, junta_id, participante_id FROM turnos WHERE id = ?', [turno_id]);
  if (!turnoVal) return res.redirect(`/juntas/${junta_id}?error=turno_no_existe`);

  const cicloVal = queryOne('SELECT id, junta_id FROM ciclos WHERE id = ?', [ciclo_id]);
  if (!cicloVal) return res.redirect(`/juntas/${junta_id}?error=ciclo_no_existe`);

  const juntaVal = queryOne('SELECT * FROM juntas WHERE id = ? AND usuario_id = ?', [junta_id, req.user.id]);
  if (!juntaVal) return res.redirect(`/juntas/${junta_id}?error=junta_no_existe`);

  try {
    transaction(() => {
      const pagoId = insert('pagos', {
        turno_id,
        ciclo_id,
        monto,
        metodo_pago_id,
        fecha_pago,
      });

      const pago = queryOne('SELECT * FROM pagos WHERE id = ?', [pagoId]);
      if (!pago) throw new Error('No se pudo crear el pago');

      registrarEnHistorial(
        junta_id,
        'pago',
        turno_id,
        ciclo_id,
        monto,
        metodo_pago_id,
        pago.fecha_pago,
        pago.fecha_registro
      );

      const totalPagadoReg = queryOne(
        'SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE turno_id = ? AND ciclo_id = ?',
        [turno_id, ciclo_id]
      ).total;

      if (totalPagadoReg > juntaVal.monto_aporte) {
        let exceso = totalPagadoReg - juntaVal.monto_aporte;
        const ciclosFuturos = query(`
          SELECT id, numero FROM ciclos
          WHERE junta_id = ? AND completado = 0 AND numero > ?
          ORDER BY numero ASC
        `, [juntaVal.id, cicloVal.numero]);

        for (const cf of ciclosFuturos) {
          if (exceso <= 0) break;
          const pagadoCf = queryOne(
            'SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE turno_id = ? AND ciclo_id = ?',
            [turno_id, cf.id]
          ).total;
          const deudaCf = juntaVal.monto_aporte - pagadoCf;
          if (deudaCf <= 0) continue;
          const aPagar = Math.min(exceso, deudaCf);
          const ahora = new Date().toISOString().slice(0, 19).replace('T', ' ');
          insert('pagos', {
            turno_id,
            ciclo_id: cf.id,
            monto: aPagar,
            metodo_pago_id,
            fecha_pago: ahora,
          });
          insert('historial', {
            junta_id,
            tipo: 'pago_exceso',
            turno_id,
            ciclo_id: cf.id,
            monto: aPagar,
            fecha_pago: ahora,
            fecha_registro: ahora,
            participante_id: turnoVal.participante_id,
            descripcion: `Exceso S/${aPagar.toFixed(0)} de Semana ${cicloVal.numero} → Semana ${cf.numero}`,
          });
          exceso -= aPagar;
        }
      }
    });

    verificarCompletadoCiclo(ciclo_id, junta_id);
    return res.redirect(`/juntas/${junta_id}`);
  } catch (e) {
    console.error('Error en /registrar:', e);
    return res.redirect(`/juntas/${junta_id}?error=error_general`);
  }
});

router.post('/registrar-inteligente', (req, res) => {
  let { turno_id, monto, metodo_pago_id, fecha_pago } = req.body;

  turno_id = safeId(turno_id);
  monto = safeFloat(monto);
  metodo_pago_id = safeId(metodo_pago_id) || 1;

  if (!turno_id) return res.redirect(`/juntas?error=parametros_invalidos`);
  if (monto === null || monto <= 0) return res.redirect(`/juntas?error=monto_invalido`);

  const turno = queryOne('SELECT * FROM turnos WHERE id = ?', [turno_id]);
  if (!turno) return res.redirect('/juntas?error=turno_no_existe');

  const junta = queryOne('SELECT * FROM juntas WHERE id = ? AND usuario_id = ?', [turno.junta_id, req.user.id]);
  if (!junta) return res.redirect('/juntas?error=junta_no_existe');

  const junta_id = turno.junta_id;
  const fp = safeFecha(fecha_pago);

  if (new Date(fp) > new Date()) {
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

  if (ciclosConDeuda.length === 0) {
    return res.redirect(`/juntas/${junta_id}?error=sin_deuda`);
  }

  try {
    transaction(() => {
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
          fecha_pago: fp,
        });

        const pago = queryOne('SELECT * FROM pagos WHERE id = ?', [pagoId]);
        if (!pago) throw new Error('No se pudo crear el pago');

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
      }
    });

    for (const ciclo of ciclosConDeuda) {
      verificarCompletadoCiclo(ciclo.id, junta.id);
    }

    return res.redirect(`/juntas/${junta_id}`);
  } catch (e) {
    console.error('Error en /registrar-inteligente:', e);
    return res.redirect(`/juntas/${junta_id}?error=error_general`);
  }
});

router.post('/deshacer', (req, res) => {
  const turno_id = safeId(req.body.turno_id);
  const ciclo_id = safeId(req.body.ciclo_id);
  const junta_id = safeId(req.body.junta_id);

  if (!turno_id || !ciclo_id || !junta_id) {
    return res.redirect(`/juntas/${junta_id || ''}?error=parametros_invalidos`);
  }

  const juntaDesh = queryOne('SELECT * FROM juntas WHERE id = ? AND usuario_id = ?', [junta_id, req.user.id]);
  if (!juntaDesh) return res.redirect(`/juntas?error=junta_no_existe`);

  const cicloDesh = queryOne('SELECT * FROM ciclos WHERE id = ?', [ciclo_id]);
  if (!cicloDesh) return res.redirect(`/juntas/${junta_id}?error=ciclo_no_existe`);

  const ultimoPago = queryOne(`
    SELECT * FROM pagos
    WHERE turno_id = ? AND ciclo_id = ?
    ORDER BY id DESC LIMIT 1
  `, [turno_id, ciclo_id]);

  if (!ultimoPago) {
    return res.redirect(`/juntas/${junta_id}?error=sin_pago`);
  }

  try {
    transaction(() => {
      const totalAntes = queryOne(
        'SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE turno_id = ? AND ciclo_id = ?',
        [turno_id, ciclo_id]
      ).total;

      registrarEnHistorial(
        junta_id,
        'pago_eliminado',
        turno_id,
        ciclo_id,
        ultimoPago.monto,
        ultimoPago.metodo_pago_id,
        ultimoPago.fecha_pago,
        null
      );
      execute('DELETE FROM pagos WHERE id = ?', [ultimoPago.id]);

      const totalDespues = queryOne(
        'SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE turno_id = ? AND ciclo_id = ?',
        [turno_id, ciclo_id]
      ).total;
      const excesoAntes = Math.max(0, totalAntes - juntaDesh.monto_aporte);
      const excesoDespues = Math.max(0, totalDespues - juntaDesh.monto_aporte);
      const excesoPerdido = excesoAntes - excesoDespues;

      if (excesoPerdido > 0) {
        const excesses = query(`
          SELECT h.id as h_id, h.ciclo_id, h.monto
          FROM historial h
          JOIN ciclos c ON h.ciclo_id = c.id
          WHERE h.turno_id = ? AND h.tipo = 'pago_exceso' AND c.numero > ? AND c.junta_id = ?
          ORDER BY c.numero ASC
        `, [turno_id, cicloDesh.numero, junta_id]);

        let porEliminar = excesoPerdido;
        for (const ex of excesses) {
          if (porEliminar <= 0) break;
          const aEliminar = Math.min(porEliminar, ex.monto);
          execute('DELETE FROM historial WHERE id = ?', [ex.h_id]);
          execute('DELETE FROM pagos WHERE turno_id = ? AND ciclo_id = ? AND monto = ?',
            [turno_id, ex.ciclo_id, aEliminar]);
          porEliminar -= aEliminar;
        }
      }

      execute('UPDATE ciclos SET completado = 0 WHERE id = ?', [ciclo_id]);
    });

    return res.redirect(`/juntas/${junta_id}`);
  } catch (e) {
    console.error('Error en /deshacer:', e);
    return res.redirect(`/juntas/${junta_id}?error=error_general`);
  }
});
