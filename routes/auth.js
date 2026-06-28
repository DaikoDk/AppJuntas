import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { queryOne, insert, execute } from '../db/database.js';

const router = Router();

export function setupAuth(app) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = queryOne('SELECT * FROM usuarios WHERE google_id = ?', [profile.id]);
      if (!user) {
        const id = insert('usuarios', {
          google_id: profile.id,
          email: profile.emails?.[0]?.value || '',
          nombre: profile.displayName,
          foto: profile.photos?.[0]?.value || '',
        });
        user = queryOne('SELECT * FROM usuarios WHERE id = ?', [id]);
      }
      // Auto-crear participante desde perfil de Google
      let p = queryOne('SELECT id, google_id FROM participantes WHERE google_id = ?', [profile.id]);
      if (!p) {
        p = queryOne('SELECT id, google_id FROM participantes WHERE usuario_id = ? AND nombre = ?', [user.id, profile.displayName]);
      }
      if (!p) {
        insert('participantes', {
          usuario_id: user.id,
          nombre: profile.displayName,
          google_id: profile.id,
        });
      } else if (!p.google_id) {
        execute('UPDATE participantes SET google_id = ? WHERE id = ?', [profile.id, p.id]);
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    const user = queryOne('SELECT * FROM usuarios WHERE id = ?', [id]);
    done(null, user);
  });

  app.use(passport.initialize());
  app.use(passport.session());

  router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
  }));

  router.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', (err, user) => {
      if (err || !user) return res.redirect('/login');
      req.logIn(user, (err) => {
        if (err) return next(err);
        const allowed = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
        if (allowed.length > 0 && !allowed.includes(user.email)) {
          req.logout(() => {
            req.session.destroy(() => {
              res.render('no-autorizado', { user: null, email: user.email });
            });
          });
          return;
        }
        execute('UPDATE usuarios SET ultimo_acceso = datetime("now", "localtime") WHERE id = ?', [user.id]);
        req.session.save(() => res.redirect('/dashboard'));
      });
    })(req, res, next);
  });

  router.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.redirect('/login');
      });
    });
  });

  return router;
}

export function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}
