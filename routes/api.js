import { Router } from 'express';
import { query, insert, execute } from '../db/database.js';
import { sendEmail } from '../services/email.js';
import { enviarResumenSemanal } from '../services/notificaciones.js';
import { ensureAuth } from './auth.js';
import webpush from 'web-push';

const router = Router();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.GMAIL_USER || 'admin@juntas.app'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || '' });
});

router.post('/suscribir-push', ensureAuth, (req, res) => {
  const { suscripcion } = req.body;
  if (!suscripcion) return res.status(400).json({ error: 'Falta suscripcion' });
  insert('suscripciones_push', {
    usuario_id: req.user.id,
    suscripcion_json: JSON.stringify(suscripcion),
  });
  res.json({ ok: true });
});

router.post('/enviar-push-prueba', ensureAuth, async (req, res) => {
  const subs = query(
    'SELECT * FROM suscripciones_push WHERE usuario_id = ? ORDER BY id DESC LIMIT 1',
    [req.user.id]
  );
  if (subs.length === 0) return res.status(400).json({ error: 'No hay suscripcion' });
  try {
    const sub = JSON.parse(subs[0].suscripcion_json);
    await webpush.sendNotification(sub, JSON.stringify({
      title: 'Prueba de notificación',
      body: 'Si ves esto, las notificaciones push funcionan!',
    }));
    res.json({ ok: true });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.post('/test-email', ensureAuth, async (req, res) => {
  const ok = await sendEmail('Prueba - Sistema de Juntas', '<h1>Funciona!</h1><p>Los correos funcionan correctamente.</p>');
  res.json({ ok });
});

router.post('/resumen-semanal', ensureAuth, async (req, res) => {
  await enviarResumenSemanal();
  res.json({ ok: true });
});

export default router;
