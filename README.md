# 🏥 PH Healthcare System

A full-stack healthcare platform that connects patients with doctors for online consultations. Patients can discover doctors, book available consultation slots, make secure payments, attend video consultations, and receive digital prescriptions.

The platform also provides administrative tools for managing doctors, patients, and platform users.

---

## ✨ Core Features

* 🔐 Secure authentication with JWT & HTTP-only cookies
* 📧 Email OTP verification
* 🔑 Forgot, reset, change & set password
* 🔵 Google authentication for patients
* 👥 Role-based access control (RBAC)
* 🩺 Doctor application & approval system
* 📅 Doctor schedule & 20-minute appointment slots
* 📋 Appointment booking & management
* 💳 Stripe payment integration
* 🔄 Appointment cancellation & refund system
* 💊 Digital prescription management
* 📄 Invoice & prescription PDF generation
* 📧 Automated email notifications
* 🛡️ Admin & Super Admin management

---

## 👥 User Roles

The system supports four roles:

| Role            | Responsibilities                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Patient**     | Find doctors, book appointments, make payments, attend consultations, receive prescriptions        |
| **Doctor**      | Manage profile, create schedules, handle appointments, conduct consultations, create prescriptions |
| **Admin**       | Manage doctors and patients, approve doctor applications, create admins                            |
| **Super Admin** | Full platform management, including Admin/Super Admin management                                   |

---

## 🔄 Main Workflow

### Patient

```text
Register / Login
      ↓
Find Doctor
      ↓
View Available Schedule
      ↓
Select Slot
      ↓
Make Payment
      ↓
Appointment Confirmed
      ↓
Join Consultation
      ↓
Receive Prescription
```

### Doctor

```text
Apply as Doctor
      ↓
Email Verification
      ↓
Admin Approval
      ↓
Doctor Account Activated
      ↓
Create Schedule
      ↓
Manage Appointments
      ↓
Complete Consultation
      ↓
Create Prescription
```

---

## 🛠️ Tech Stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS

### Backend

* Node.js
* Express.js
* TypeScript
* Zod

### Database

* PostgreSQL
* Prisma ORM

### Authentication & Services

* JWT
* Google OAuth
* Stripe
* Email Service
* PDF Generation

---

### Configure environment variables

Create a `.env` file and configure the required environment variables.

```env
DATABASE_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

EMAIL_USER=
EMAIL_PASSWORD=

FRONTEND_URL=
```

### Run Prisma

```bash
npx prisma generate
npx prisma migrate dev
```

### Start development server

```bash
npm run dev
```

---

## 📌 Project Status

🚧 **Currently in Development**

This project is being developed with a focus on production-oriented backend architecture, secure authentication, database design, payment processing, scheduling, and real-world business logic.

---

## 🎯 Goal

The goal of this project is to build a scalable healthcare platform while practicing real-world full-stack engineering concepts such as:

* Clean & modular architecture
* Secure authentication & authorization
* Database design & transactions
* Payment integration
* Appointment scheduling
* Business rule enforcement
* Error handling
* Production-ready development practices

---

## 👨‍💻 Developer

**Rakib** — Full-Stack Web Developer
