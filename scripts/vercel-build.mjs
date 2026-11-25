import { execSync } from "node:child_process";

const run = (cmd, env = process.env) => {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
};

run("npx prisma generate");

// Prefer direct/unpooled connection string for Prisma migrations on Neon/Supabase,
// falling back to pooled DATABASE_URL / POSTGRES_URL.
const migrateUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

const runtimeUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  migrateUrl;

if (migrateUrl) {
  run("npx prisma migrate deploy", { ...process.env, DATABASE_URL: migrateUrl });
} else {
  console.warn("Notice: No DATABASE_URL found during build — skipping `prisma migrate deploy` until database is connected.");
}

run("npx next build", {
  ...process.env,
  ...(runtimeUrl ? { DATABASE_URL: runtimeUrl } : {}),
});
