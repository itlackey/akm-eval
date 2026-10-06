---
description: What you need to run Tarnwick locally and the commands to start it.
tags: [dev, setup]
---

# Tarnwick local dev setup

- Local development for Tarnwick needs Node 20 and pnpm 9.
- Copy `.env.example` to `.env.local` before the first start.
- The dev server listens on port 5173.
- Run `pnpm db:up` to start the local Postgres container.
- Run `pnpm db:seed` to load the sample data.
- The sample admin login is admin@example.test, and the password is in `.env.example`.
- Run `pnpm dev` to start the app with hot reload.
