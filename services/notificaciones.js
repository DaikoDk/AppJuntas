import { query, queryOne, insert } from '../db/database.js';
import { sendEmail } from './email.js';

export async function verificarMetaSemanal(juntaId, cicloId) {
  const junta = queryOne('SELECT * FROM juntas WHERE id = ?', [juntaId]);
  if (!junta) return;

  const yaEnviado = queryOne(
    'SELECT * FROM envios_email WHERE junta_id = ? AND ciclo_id = ? AND tipo = ?',
    [juntaId, cicloId, 'meta_semanal']
  );
  if (yaEnviado) return;

  const turnos = query('SELECT * FROM turnos WHERE junta_id = ? AND activo = 1', [juntaId]);
  const meta = junta.monto_aporte * turnos.length;

  const pagos = query(`
    SELECT pg.*, t.orden, p.nombre as participante_nombre, mp.nombre as metodo_nombre, mp.icono as metodo_icono
    FROM pagos pg
    JOIN turnos t ON pg.turno_id = t.id
    JOIN participantes p ON t.participante_id = p.id
    JOIN metodos_pago mp ON pg.metodo_pago_id = mp.id
    WHERE pg.ciclo_id = ?
  `, [cicloId]);

  let totalRecaudado = 0;
  const pagaronTiempo = [];
  const pagaronTarde = [];
  const ciclo = queryOne('SELECT * FROM ciclos WHERE id = ?', [cicloId]);

  const pagosPorTurno = {};
  pagos.forEach(p => {
    totalRecaudado += p.monto;
    if (!pagosPorTurno[p.turno_id]) pagosPorTurno[p.turno_id] = { nombre: p.participante_nombre, pagos: [] };
    pagosPorTurno[p.turno_id].pagos.push(p);
  });

  Object.values(pagosPorTurno).forEach(({ nombre, pagos: pagosArr }) => {
    const sum = pagosArr.reduce((s, p) => s + p.monto, 0);
    if (sum < junta.monto_aporte) return;

    const earliestPago = pagosArr.reduce((earliest, p) =>
      p.fecha_pago < earliest ? p.fecha_pago : earliest, pagosArr[0].fecha_pago
    );
    const pagoDate = new Date(earliestPago);
    const cierreDate = new Date(ciclo.fecha_cierre);
    if (pagoDate <= cierreDate) {
      pagaronTiempo.push(nombre);
    } else {
      const dias = Math.round((pagoDate - cierreDate) / (1000 * 60 * 60 * 24));
      pagaronTarde.push({ nombre, dias });
    }
  });

  if (totalRecaudado >= meta) {
    insert('envios_email', { junta_id: juntaId, tipo: 'meta_semanal', ciclo_id: cicloId });

    let html = `<h2>Meta semanal alcanzada: ${junta.nombre}</h2>`;
    html += `<p><strong>Ciclo:</strong> ${ciclo.numero}</p>`;
    html += `<p><strong>Meta:</strong> ${meta} soles</p>`;
    html += `<p><strong>Total recaudado:</strong> ${totalRecaudado} soles</p>`;
    html += `<p><strong>Pagaron a tiempo:</strong> ${pagaronTiempo.join(', ') || 'Ninguno'}</p>`;
    if (pagaronTarde.length > 0) {
      html += `<p><strong>Pagaron con demora:</strong></p><ul>`;
      pagaronTarde.forEach(p => { html += `<li>${p.nombre} (${p.dias} días de retraso)</li>`; });
      html += `</ul>`;
    }

    await sendEmail(
      `Meta semanal: ${junta.nombre} - Ciclo ${ciclo.numero}`,
      html
    );
  }
}

export async function enviarResumenSemanal() {
  const hoy = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const juntas = query('SELECT * FROM juntas WHERE finalizada = 0');

  for (const junta of juntas) {
    if (junta.dia_resumen !== hoy) continue;

    const yaEnviado = queryOne(
      "SELECT * FROM envios_email WHERE junta_id = ? AND tipo = ? AND date(enviado_en) = date(?)",
      [junta.id, 'resumen_semanal', new Date().toISOString().split('T')[0]]
    );
    if (yaEnviado) continue;

    const cicloActual = queryOne(
      'SELECT * FROM ciclos WHERE junta_id = ? AND completado = 0 ORDER BY numero ASC LIMIT 1',
      [junta.id]
    );
    if (!cicloActual) continue;

    const turnos = query(`
      SELECT t.*, p.nombre as participante_nombre
      FROM turnos t JOIN participantes p ON t.participante_id = p.id
      WHERE t.junta_id = ? AND t.activo = 1 ORDER BY t.orden
    `, [junta.id]);

    const pagosPorTurno = {};
    turnos.forEach(t => {
      const total = queryOne(
        'SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE turno_id = ? AND ciclo_id = ?',
        [t.id, cicloActual.id]
      );
      pagosPorTurno[t.id] = total.total;
    });

    let html = `<h2>Resumen Semanal: ${junta.nombre}</h2>`;
    html += `<p><strong>Ciclo actual:</strong> ${cicloActual.numero}</p>`;
    html += `<p><strong>Fecha cierre:</strong> ${cicloActual.fecha_cierre}</p>`;
    html += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">`;
    html += `<tr><th>Orden</th><th>Participante</th><th>Estado</th></tr>`;
    turnos.forEach(t => {
      const total = pagosPorTurno[t.id] || 0;
      const pagado = total >= junta.monto_aporte;
      const estado = pagado ? 'Pagado' : (new Date() > new Date(cicloActual.fecha_cierre) ? 'Atrasado' : 'Pendiente');
      html += `<tr><td>${t.orden}</td><td>${t.participante_nombre}</td><td>${estado}</td></tr>`;
    });
    html += `</table>`;

    const totalRecaudado = Object.values(pagosPorTurno).reduce((s, v) => s + v, 0);
    html += `<p><strong>Total recaudado:</strong> ${totalRecaudado} / ${junta.monto_aporte * turnos.length} soles</p>`;

    insert('envios_email', { junta_id: junta.id, tipo: 'resumen_semanal' });
    await sendEmail(`Resumen Semanal: ${junta.nombre}`, html);
  }
}
