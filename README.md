# Hroast

Next.js (App Router) + TypeScript starter with Tailwind CSS.

What's included

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS (wired via PostCSS)
- ESLint (Next.js recommended config)

Quick start

1. Install dependencies

```bash
npm install
```

2. Run dev server

```bash
npm run dev
```

3. Lint

```bash
npm run lint
```

Notes

- Tailwind config is at `tailwind.config.cjs` and looks at `src/app` and `src/components`.
- PostCSS is configured in `postcss.config.mjs` and requires `autoprefixer` and `tailwindcss` to be installed.
- If you see editor errors about unknown at-rules for `@tailwind`, make sure your editor or CSS plugin supports PostCSS/Tailwind or ensure `postcss.config.mjs` is picked up by your tooling.

Next steps

- Tell me what your app will do and I can scaffold pages, components, and types.
# Database & Supabase setup

- We use Supabase for storing interviews and Drizzle ORM for migrations/schema.

1. Install additional packages

```bash
npm install @supabase/supabase-js drizzle-orm drizzle-kit
```

2. Create the `interviews` table using the provided SQL migration in `drizzle/migrations/0001_create_interviews.sql` or run `drizzle-kit` migration tooling.

3. Set env vars in `.env.local` (Next.js):

- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_SUPABASE_ANON_KEY (optional for client-side)

4. Run the migration and then start the dev server.

If you want, I can add `drizzle-kit` config and a npm script to run migrations.
# Hroast
