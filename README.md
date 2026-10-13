<div align="center">

# ⚡ GC GLOBAL

### ENGINEERING DIGITAL SOLUTIONS

**Web Development • Business Integrations • Workflow Automation**

*Building modern digital experiences and connected business systems for growing businesses.*

[![Website](https://img.shields.io/badge/Website-Visit%20Us-2563EB?style=for-the-badge&logo=googlechrome&logoColor=white)](YOUR_COMPANY_WEBSITE_URL)
[![GitHub](https://img.shields.io/badge/GitHub-Explore%20Projects-8B5CF6?style=for-the-badge&logo=github&logoColor=white)](https://github.com/YOUR_GITHUB_USERNAME)
[![Email](https://img.shields.io/badge/Email-Contact%20Us-0EA5E9?style=for-the-badge&logo=microsoftoutlook&logoColor=white)](mailto:gc.globl@outlook.com)

<br/>

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![Status](https://img.shields.io/badge/Status-In%20Development-F59E0B?style=flat-square)

</div>

---

## 📑 Contents

- [About GC Global](#-about-gc-global)
- [Featured Project — Bay Design](#-featured-project--bay-design)
- [Bay Design Base](#-bay-design-base)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap)
- [Our Approach](#-our-approach)
- [Connect](#-connect-with-gc-global)

---

## 🏢 About GC Global

GC Global is a technology services company delivering modern websites, system integrations, and business automation. We help businesses streamline operations, improve their digital presence, and connect the systems they rely on every day.

### 💡 What We Do

| | Service | Description |
|:-:|---|---|
| 🌐 | **Web Development** | Modern, responsive, and user-friendly websites |
| 🛒 | **E-commerce Solutions** | Digital storefronts and online business experiences |
| 🔗 | **System Integrations** | Connecting websites, APIs, and third-party platforms |
| ⚙️ | **Workflow Automation** | Simplifying repetitive business processes |
| 📊 | **CRM & Business Solutions** | Connecting customer management and operations |
| 🚀 | **Custom Software** | Building technology around real business needs |

---

## 🛍️ Featured Project — Bay Design

**Bay Design Store** is an interior design and fine-furniture studio in **Naples, Florida**. This repository contains two products that share one codebase:

<table>
<tr>
<td width="50%" valign="top">

### 🖥️ Public Website

The customer-facing site for the studio.

- 🏠 Home, About & Services
- 🛋️ Collections & Portfolio
- 📰 Blog with individual posts
- ✉️ Contact form & newsletter sign-up — saved to the database with email alerts
- 🔎 SEO-ready sitemap, robots & web manifest

</td>
<td width="50%" valign="top">

### 🗓️ Bay Design Base

An in-house team portal at `/base` that replaces a third-party scheduling tool.

- 📅 Shift scheduling & "My Week"
- 📍 GPS clock in / clock out
- 🌴 Time off, leave balances & availability
- ⏱️ Timesheets with PDF export
- 📥 Website inquiries inbox

</td>
</tr>
</table>

---

## 🗓️ Bay Design Base

Bay Design Base gives the team one place to manage their work week — built around how the studio actually operates.

| Feature | Details |
|---|---|
| 👥 **Team & Roles** | Employee roster, job roles, and work types with role-specific screens |
| 🔐 **Access Levels** | Employee, manager, and administrator permissions |
| 📅 **Scheduling** | Weekly schedules, personal "My Week" view, and team availability |
| 📍 **Clock In / Out** | GPS-tagged punches — designers can clock in on-site or at client visits |
| 🌴 **Time Off** | Requests, approvals, vacation allowances, and leave balances |
| ⏱️ **Timesheets** | Date-range filtering and downloadable PDF timesheets |
| 📥 **Inquiries** | Contact-form messages and newsletter subscribers from the public website |
| ⚙️ **Settings** | Company settings, time zone, and first-time setup |

> 🔒 **Security by design:** all secrets stay on the server (none are `NEXT_PUBLIC_*`), sessions use signed cookies, and passwords are stored as hashes.

---

## 💻 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Server Actions) |
| **UI** | React 19, Tailwind CSS, Framer Motion, Lucide icons |
| **Language** | TypeScript |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL) |
| **Auth** | Signed session cookies with `jose` |
| **Validation** | Zod |
| **Dates & Time Zones** | date-fns, @date-fns/tz |
| **PDF** | jsPDF + jspdf-autotable |
| **Email** | Resend |
| **Tooling** | ESLint, TypeScript, Git & GitHub |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- A [Supabase](https://supabase.com/) project
- *(Optional)* A [Resend](https://resend.com/) API key for email alerts

### 1. Install

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/Bay-Design.git
cd Bay-Design
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local` — every variable is documented in [`.env.example`](.env.example). To create the admin password hash:

```bash
npm run hash-password -- --generate
```

> ⚠️ Never commit `.env.local`. It is already listed in `.gitignore`.

### 3. Set up the database

```bash
npm run db:migrate -- --seed
```

### 4. Run

```bash
npm run dev
```

Open **http://localhost:3000** for the website and **http://localhost:3000/base** for Bay Design Base.

### 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint the codebase |
| `npm run typecheck` | Type-check without emitting |
| `npm run hash-password` | Hash an admin password |
| `npm run db:migrate` | Apply Supabase migrations (`-- --seed` to seed) |

---

## 📁 Project Structure

```text
Bay-Design/
├── public/                 # Logos, favicons, manifest, robots.txt
├── scripts/                # Password hashing & database migration scripts
├── supabase/
│   ├── migrations/         # SQL schema migrations
│   └── seed.sql            # Starter data
└── src/
    ├── app/
    │   ├── (site)/         # Public website pages
    │   └── base/           # Bay Design Base (team portal)
    ├── components/         # Shared UI components
    ├── data/               # Site content
    ├── lib/                # Server utilities, auth & database helpers
    └── views/              # Page-level views
```

---

## 🔌 Roadmap

| Phase | Milestone | Status |
|:-:|---|:-:|
| **01** | **Store Development** — Build and refine the Bay Design website | ✅ Complete |
| **02** | **Bay Design Base** — In-house scheduling, attendance & time off | ✅ Live |
| **03** | **CRM & Workflow Integration** — Connect a CRM / work-management platform such as monday.com | 🔜 Planned |
| **04** | **Business Automation** — Workflow efficiency, data connectivity & operational visibility | 🔜 Planned |

---

## 🤝 Our Approach

- 🎯 **Understand** business goals before building
- 🧩 **Design** solutions around real-world requirements
- 🔐 **Prioritize** security and maintainable engineering
- 🔗 **Integrate** systems for smoother operations
- 🚀 **Improve** continuously through testing and iteration

### 🌌 Our Vision

To build reliable, scalable, and innovative digital solutions that help businesses grow and operate more efficiently — combining thoughtful engineering, practical problem-solving, and exceptional user experiences.

---

## 📬 Connect With GC Global

Interested in collaboration or digital solutions? Let's connect.

- 🌐 **Website:** YOUR_COMPANY_WEBSITE_URL
- 📧 **Email:** [gc.globl@outlook.com](mailto:gc.globl@outlook.com)
- 💼 **LinkedIn:** YOUR_COMPANY_LINKEDIN_URL
- 💻 **GitHub:** [github.com/YOUR_GITHUB_USERNAME](https://github.com/YOUR_GITHUB_USERNAME)

---

<div align="center">

### 💜 BUILD. INTEGRATE. INNOVATE.

**GC GLOBAL**

*Technology That Moves Business Forward.* ⚡

<sub>© 2026 GC Global. All rights reserved. Built for Bay Design Store, Naples, Florida.</sub>

</div>
