
# 🏥 PH Healthcare System

A backend-focused healthcare management and telemedicine platform designed to simplify the complete online doctor consultation workflow — from doctor onboarding and appointment booking to secure payment and digital prescription delivery.

## 🎯 What I Built

PH Healthcare System provides a structured platform where patients can:

- Register and verify their account through email OTP
- Find verified doctors and view available consultation schedules
- Book available 20-minute appointment slots
- Pay consultation fees through bKash
- Join scheduled online consultations
- Receive digital prescriptions after consultation

Doctors can apply for verification, publish consultation schedules, manage appointments, and provide digital prescriptions.

Admins manage doctor verification, user accounts, and platform operations.

## 🔄 Core Workflow

```text
Patient Registration
        ↓
Email Verification
        ↓
Find Verified Doctor
        ↓
Book Available Slot
        ↓
bKash Payment
        ↓
Appointment Confirmation
        ↓
Online Consultation
        ↓
Digital Prescription
🧩 Problems Solved

The system addresses several real-world healthcare workflow challenges:

Manual doctor verification → Admin-controlled doctor approval workflow
Unstructured appointment scheduling → Date-based schedules with automatically generated 20-minute slots
Payment uncertainty → Payment verification before confirming appointments
Double booking risk → Transaction-based appointment and slot management
Manual prescription delivery → PDF prescription generation and email delivery
Account security issues → OTP verification, JWT authentication, HTTP-only cookies, and role-based access control
⚙️ Key Features
JWT Authentication with Access & Refresh Tokens
HTTP-only Cookie Based Authentication
Email OTP Verification
Google Authentication
Role-Based Access Control (RBAC)
Doctor Application & Approval System
Doctor Schedule & Slot Management
Appointment Booking & Cancellation
bKash Payment Integration
Payment Verification & Refund Workflow
Digital Prescription PDF Generation
Email Notifications
Cloudinary File Management
Redis for OTP & Token Caching
Admin & Super Admin Management
Patient & Doctor Analytics
Automated Cron Jobs for Data Cleanup
🛠️ Tech Stack

Backend

Node.js
Express.js
TypeScript

Database

PostgreSQL
Prisma ORM

Authentication & Security

JWT
bcrypt
Zod
Google OAuth

Infrastructure & Services

Redis
Cloudinary
bKash Payment Gateway
Nodemailer
EJS
PDFKit
Node-Cron
📈 Result

This project helped transform a basic healthcare API into a more realistic backend system with:

Secure authentication and authorization
Real-world payment processing
Transaction-safe appointment booking
Automated scheduling and cleanup workflows
Digital prescription management
Role-specific healthcare operations

The main goal was to practice designing backend systems around real business rules, data consistency, security, and automation rather than building only CRUD-based APIs.

🚀 Project Status

In Development

Built as an industry-oriented backend project to strengthen practical experience with scalable backend architecture, business logic, integrations, and real-world workflows.

👨‍💻 Developer

Rakibul Hassan Rakib

Full-Stack Web Developer