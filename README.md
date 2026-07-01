# JuntApp

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express)](https://expressjs.com)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](LICENSE)

Web app for managing savings communities (rotating savings groups). Register participants, create savings groups with turns, track payments, auto-distribute overpayments, and receive email + push notifications.

[🇪🇸 Leer en español](#versión-en-español)

---

## Stack

| Layer      | Technology                                     |
|------------|------------------------------------------------|
| Runtime    | Node.js 18+, ES Modules                       |
| Backend    | Express 4.18, Passport.js                     |
| Templates  | EJS (Server-Side Rendering)                   |
| Auth       | Google OAuth 2.0 + Email Whitelist            |
| Database   | SQLite (sql.js)                               |
| Frontend   | Tailwind CSS (CDN), Material Symbols          |
| Email      | Nodemailer (Gmail SMTP)                       |
| Push       | Web Push API (VAPID)                          |
| PWA        | Service Worker + manifest.json                |

---

## Setup

### Requirements

- Node.js 18+
- Google Cloud account (for OAuth)
- Gmail with App Password (for notifications)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/DaikoDk/AppJuntas.git
cd AppJuntas

# 2. Copy environment variables
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Configure .env (see table below)

# 5. Run
npm run dev

# App at http://localhost:3000
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Google Cloud Console Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google Cloud Console Client Secret |
| `GOOGLE_CALLBACK_URL` | Yes | OAuth callback URL (e.g. `http://localhost:3000/auth/google/callback`) |
| `SESSION_SECRET` | Yes | Secret for signing user sessions |
| `ALLOWED_EMAILS` | Yes | Allowed emails, comma-separated (e.g. `user1@gmail.com,user2@gmail.com`) |
| `ADMIN_EMAIL` | No | Admin email (grants access to admin panel) |
| `GMAIL_USER` | No | Gmail for sending weekly notifications |
| `GMAIL_APP_PASSWORD` | No | Gmail App Password (not your regular password) |
| `VAPID_PUBLIC_KEY` | No | VAPID public key for push notifications |
| `VAPID_PRIVATE_KEY` | No | VAPID private key for push notifications |
| `PORT` | No | Server port (default: `3000`) |

---

## Authentication

The app uses Google OAuth as the only login method. Only emails listed in `ALLOWED_EMAILS` can access the app. Registration is automatic on first Google login. Supports up to 10 registered users.

---

## Project Structure

```
AppJuntas/
├── index.js                # Entry point — Express server
├── .env                    # Environment variables (see .env.example)
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

## Database

SQLite with 11 tables. Database is created automatically on first run.

| Table | Description |
|-------|-------------|
| `usuarios` | User accounts (Google OAuth) |
| `participantes` | Savings group members |
| `juntas` | Savings groups |
| `turnos` | Turn order within a junta |
| `ciclos` | Payment cycles |
| `metodos_pago` | Payment methods (Cash, Yape, Plin) |
| `pagos` | Registered payments |
| `historial` | Event audit trail (append-only) |
| `historial_cesiones` | Turn transfer history |
| `envios_email` | Email send log |
| `suscripciones_push` | Push notification subscriptions |

---

## Features

- Google OAuth authentication + email whitelist
- Full participant CRUD with phone validation
- Junta creation with automatic turns and cycles
- Manual and smart payment registration (debt prioritization)
- Automatic overpayment distribution to future cycles
- Undo payments with overpayment reversal
- Turn cession to other participants
- Complete payment history (append-only audit trail)
- Debt alerts with overdue day count
- Per-participant balance
- Weekly email summary
- Push notifications (PWA)
- Dark mode with smooth transitions
- Responsive design (mobile + desktop)
- Admin panel (ADMIN_EMAIL only)

---

## License

MIT

---
---

# Versión en español

App web para gestionar comunidades de ahorro (juntas). Permite registrar participantes, crear juntas con turnos, registrar pagos, distribuir excedentes automáticamente y recibir notificaciones por email y push.

---

## Stack

| Capa       | Tecnología                                    |
|------------|-----------------------------------------------|
| Runtime    | Node.js 18+, ES Modules                      |
| Backend    | Express 4.18, Passport.js                    |
| Templates  | EJS (Server-Side Rendering)                  |
| Auth       | Google OAuth 2.0 + Whitelist por email       |
| BD         | SQLite (sql.js)                              |
| Frontend   | Tailwind CSS (CDN), Material Symbols         |
| Email      | Nodemailer (Gmail SMTP)                      |
| Push       | Web Push API (VAPID)                         |
| PWA        | Service Worker + manifest.json               |

---

## Setup Local

### Requisitos

- Node.js 18+
- Cuenta de Google Cloud (para OAuth)
- Gmail con App Password (para notificaciones)

### Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/DaikoDk/AppJuntas.git
cd AppJuntas

# 2. Copiar variables de entorno
cp .env.example .env

# 3. Instalar dependencias
npm install

# 4. Configurar .env (ver tabla abajo)

# 5. Ejecutar
npm run dev

# App en http://localhost:3000
```

---

## Variables de Entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `GOOGLE_CLIENT_ID` | Sí | Client ID de Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Sí | Client Secret de Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | Sí | URL de callback OAuth (ej: `http://localhost:3000/auth/google/callback`) |
| `SESSION_SECRET` | Sí | Secreto para firmar sesiones de usuario |
| `ALLOWED_EMAILS` | Sí | Emails permitidos, separados por coma (ej: `user1@gmail.com,user2@gmail.com`) |
| `ADMIN_EMAIL` | No | Email del administrador (accede al panel de admin) |
| `GMAIL_USER` | No | Gmail para enviar notificaciones semanales |
| `GMAIL_APP_PASSWORD` | No | App Password de Gmail (no la contraseña normal) |
| `VAPID_PUBLIC_KEY` | No | Clave pública VAPID para push notifications |
| `VAPID_PRIVATE_KEY` | No | Clave privada VAPID para push notifications |
| `PORT` | No | Puerto del servidor (default: `3000`) |

---

## Autenticación

La app utiliza Google OAuth como único método de login. Solo los emails listados en `ALLOWED_EMAILS` pueden acceder. El registro es automático al primer login con Google. Soporte para máximo 10 usuarios registrados.

---

## Estructura del Proyecto

```
AppJuntas/
├── index.js                # Punto de entrada — Servidor Express
├── .env                    # Variables de entorno (ver .env.example)
├── .env.example            # Plantilla de variables de entorno
├── package.json
├── db/
│   ├── database.js         # Capa de abstracción de BD (wrapper de sql.js)
│   └── schema.js           # Inicialización del esquema + migraciones
├── routes/
│   ├── auth.js             # Google OAuth + manejo de sesiones
│   ├── juntas.js           # CRUD de juntas + cesión de turnos
│   ├── pagos.js            # Registro de pagos, deshacer, validación
│   ├── participantes.js    # CRUD de participantes
│   └── api.js              # Endpoints API (push, email, resumen semanal)
├── services/
│   ├── email.js            # Transporte Nodemailer (Gmail)
│   └── notificaciones.js   # Notificaciones de meta semanal + resúmenes por email
├── views/                  # Templates EJS
│   ├── header.ejs          # Header/nav compartido + toggle dark mode
│   ├── footer.ejs          # Footer compartido + nav móvil inferior
│   ├── login.ejs           # Página de login (Google OAuth)
│   ├── dashboard.ejs       # Dashboard con alertas + juntas activas
│   ├── juntas.ejs          # Listado de juntas
│   ├── junta.ejs           # Detalle de junta (pagos, turnos, historial)
│   ├── junta-nueva.ejs     # Formulario para crear nueva junta
│   ├── participantes.ejs   # Gestión de participantes + panel admin
│   ├── historial.ejs       # Línea de tiempo de historial de pagos
│   ├── alertas.ejs         # Alertas de pago atrasado
│   └── no-autorizado.ejs   # Página de acceso denegado
└── public/
    ├── estilos.css         # CSS personalizado
    ├── manifest.json       # Manifest PWA
    └── sw.js               # Service Worker (push notifications)
```

---

## Base de Datos

SQLite con 11 tablas. La BD se crea automáticamente al primer inicio.

| Tabla | Descripción |
|-------|-------------|
| `usuarios` | Cuentas de usuario (Google OAuth) |
| `participantes` | Miembros de la comunidad de ahorro |
| `juntas` | Grupos de ahorro |
| `turnos` | Orden de cobro por junta |
| `ciclos` | Semanas/ciclos de pago |
| `metodos_pago` | Métodos de pago (Efectivo, Yape, Plin) |
| `pagos` | Pagos registrados |
| `historial` | Auditoría de eventos (append-only) |
| `historial_cesiones` | Transferencias de turno |
| `envios_email` | Log de emails enviados |
| `suscripciones_push` | Suscripciones a notificaciones push |

---

## Funcionalidades

- Auth con Google OAuth + whitelist por email
- CRUD completo de participantes con validación de teléfono
- Creación de juntas con turnos y ciclos automáticos
- Registro de pagos manual e inteligente (prioriza deudas)
- Distribución automática de excedentes a ciclos futuros
- Deshacer pagos con reversión de excedentes
- Cesión de turnos a otros participantes
- Historial completo de pagos (audit trail append-only)
- Alertas de deuda con conteo de días de atraso
- Balance por participante
- Resumen semanal por email
- Push notifications (PWA)
- Dark mode con transiciones suaves
- Diseño responsive (mobile + desktop)
- Panel de administrador (solo ADMIN_EMAIL)

---

## License

MIT
