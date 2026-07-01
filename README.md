# JuntApp

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express)](https://expressjs.com)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](LICENSE)

**[ES]** App web para gestionar comunidades de ahorro (juntas). Permite registrar participantes, crear juntas con turnos, registrar pagos, distribuir excedentes automáticamente y recibir notificaciones por email y push.

**[EN]** Web app for managing savings communities (rotating savings groups). Register participants, create savings groups with turns, track payments, auto-distribute overpayments, and receive email + push notifications.

---

## Stack / Tecnologies

| Capa         | Tecnología / Technology                        |
|--------------|------------------------------------------------|
| Runtime      | Node.js 18+, ES Modules                        |
| Backend      | Express 4.18, Passport.js                      |
| Templates    | EJS (Server-Side Rendering)                    |
| Auth         | Google OAuth 2.0 + Email Whitelist             |
| Database     | SQLite (sql.js)                                |
| Frontend     | Tailwind CSS (CDN), Material Symbols           |
| Email        | Nodemailer (Gmail SMTP)                        |
| Push         | Web Push API (VAPID)                           |
| PWA          | Service Worker + manifest.json                 |

---

## Setup Local

### Requisitos / Requirements

- Node.js 18+
- Google Cloud account (para OAuth / for OAuth)
- Gmail with App Password (para notificaciones / for notifications)

### Instalación / Installation

```bash
# 1. Clonar el repositorio / Clone the repository
git clone https://github.com/DaikoDk/AppJuntas.git
cd AppJuntas

# 2. Copiar variables de entorno / Copy environment variables
cp .env.example .env

# 3. Instalar dependencias / Install dependencies
npm install

# 4. Configurar .env (ver tabla abajo) / Configure .env (see table below)

# 5. Ejecutar / Run
npm run dev

# App en http://localhost:3000
```

---

## Variables de Entorno / Environment Variables

| Variable | Requerida / Required | Descripción / Description |
|----------|----------------------|---------------------------|
| `GOOGLE_CLIENT_ID` | Sí / Yes | Client ID de Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Sí / Yes | Client Secret de Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | Sí / Yes | URL de callback OAuth (ej: `http://localhost:3000/auth/google/callback`) |
| `SESSION_SECRET` | Sí / Yes | Secreto para firmar sesiones de usuario |
| `ALLOWED_EMAILS` | Sí / Yes | Emails permitidos, separados por coma (ej: `user1@gmail.com,user2@gmail.com`) |
| `ADMIN_EMAIL` | No | Email del administrador (accede al panel de admin) |
| `GMAIL_USER` | No | Gmail para enviar notificaciones semanales |
| `GMAIL_APP_PASSWORD` | No | App Password de Gmail (no la contraseña normal) |
| `VAPID_PUBLIC_KEY` | No | Clave pública VAPID para push notifications |
| `VAPID_PRIVATE_KEY` | No | Clave privada VAPID para push notifications |
| `PORT` | No | Puerto del servidor (default: `3000`) |

---

## Autenticación / Authentication

**[ES]** La app utiliza Google OAuth como único método de login. Solo los emails listados en `ALLOWED_EMAILS` pueden acceder. El registro es automático al primer login con Google. Soporte para máximo 10 usuarios registrados.

**[EN]** The app uses Google OAuth as the only login method. Only emails listed in `ALLOWED_EMAILS` can access the app. Registration is automatic on first Google login. Supports up to 10 registered users.

---

## Estructura del Proyecto / Project Structure

```
AppJuntas/
├── index.js                # Entry point — Express server
├── .env                    # Environment variables (no gitignored, see .env.example)
├── .env.example            # Template for environment variables
├── package.json
├── db/
│   ├── database.js         # DB abstraction layer (sql.js wrapper)
│   └── schema.js           # Schema initialization + migrations
├── routes/
│   ├── auth.js             # Google OAuth + session management
│   ├── juntas.js           # Junta CRUD + turn cession
│   ├── pagos.js            # Payment registration, undo, validation
│   ├── participantes.js    # Participant CRUD
│   └── api.js              # API endpoints (push, email, weekly summary)
├── services/
│   ├── email.js            # Nodemailer Gmail transport
│   └── notificaciones.js   # Weekly goal notifications + email summaries
├── views/                  # EJS templates
│   ├── header.ejs          # Shared header/nav + dark mode toggle
│   ├── footer.ejs          # Shared footer + mobile bottom nav
│   ├── login.ejs           # Login page (Google OAuth)
│   ├── dashboard.ejs       # Dashboard with alerts + active juntas
│   ├── juntas.ejs          # Junta listing
│   ├── junta.ejs           # Junta detail (payments, turns, history)
│   ├── junta-nueva.ejs     # Create new junta form
│   ├── participantes.ejs   # Participant management + admin panel
│   ├── historial.ejs       # Payment history timeline
│   ├── alertas.ejs         # Overdue payment alerts
│   └── no-autorizado.ejs   # Access denied page
└── public/
    ├── estilos.css         # Custom CSS
    ├── manifest.json       # PWA manifest
    └── sw.js               # Service Worker (push notifications)
```

---

## Base de Datos / Database

**[ES]** SQLite con 11 tablas. La BD se crea automáticamente al primer inicio.

**[EN]** SQLite with 11 tables. Database is created automatically on first run.

| Tabla / Table | Descripción / Description |
|---------------|---------------------------|
| `usuarios` | Cuentas de usuario (Google OAuth) / User accounts |
| `participantes` | Miembros de la comunidad de ahorro / Savings group members |
| `juntas` | Grupos de ahorro / Savings groups |
| `turnos` | Orden de cobro por junta / Turn order within a junta |
| `ciclos` | Semanas/ciclos de pago / Payment cycles |
| `metodos_pago` | Métodos de pago (Efectivo, Yape, Plin) / Payment methods |
| `pagos` | Pagos registrados / Registered payments |
| `historial` | Auditoría de eventos (append-only) / Event audit trail |
| `historial_cesiones` | Transferencias de turno / Turn transfer history |
| `envios_email` | Log de emails enviados / Email send log |
| `suscripciones_push` | Suscripciones a notificaciones push / Push notification subscriptions |

---

## Funcionalidades / Features

- [ES] Auth con Google OAuth + whitelist por email
- [EN] Google OAuth auth + email whitelist

- [ES] CRUD completo de participantes con validación de teléfono
- [EN] Full participant CRUD with phone validation

- [ES] Creación de juntas con turnos y ciclos automáticos
- [EN] Junta creation with automatic turns and cycles

- [ES] Registro de pagos manual e inteligente (prioriza deudas)
- [EN] Manual and smart payment registration (debt prioritization)

- [ES] Distribución automática de excedentes a ciclos futuros
- [EN] Automatic overpayment distribution to future cycles

- [ES] Deshacer pagos con reversión de excedentes
- [EN] Undo payments with overpayment reversal

- [ES] Cesión de turnos a otros participantes
- [EN] Turn cession to other participants

- [ES] Historial completo de pagos (audit trail append-only)
- [EN] Complete payment history (append-only audit trail)

- [ES] Alertas de deuda con conteo de días de atraso
- [EN] Debt alerts with overdue day count

- [ES] Balance por participante
- [EN] Per-participant balance

- [ES] Resumen semanal por email
- [EN] Weekly email summary

- [ES] Push notifications (PWA)
- [EN] Push notifications (PWA)

- [ES] Dark mode con transiciones suaves
- [EN] Dark mode with smooth transitions

- [ES] Diseño responsive (mobile + desktop)
- [EN] Responsive design (mobile + desktop)

- [ES] Panel de administrador (solo ADMIN_EMAIL)
- [EN] Admin panel (ADMIN_EMAIL only)

---

## License

MIT
