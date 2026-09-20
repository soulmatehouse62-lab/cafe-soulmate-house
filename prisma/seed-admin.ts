/**
 * Creates the first admin account if the database has no admin yet. Touches nothing else,
 * so it is safe on a database with real orders. Also run at the end of `prisma db seed`.
 *
 *   npm run db:seed-admin
 *
 * Username: SEED_ADMIN_USERNAME (default "admin").
 * Password: SEED_ADMIN_PASSWORD, or a random one printed once to the console.
 * Change it after signing in (Account → Change password).
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { USERNAME_RE, hashPassword, normalizeUsername, passwordProblem } from "../lib/password";

export async function ensureAdmin(prisma: PrismaClient): Promise<void> {
  const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
  if (admins > 0) {
    console.log("An admin account already exists; not creating another.");
    return;
  }

  const username = normalizeUsername(process.env.SEED_ADMIN_USERNAME ?? "admin");
  if (!USERNAME_RE.test(username)) throw new Error(`SEED_ADMIN_USERNAME "${username}" is not a valid username`);
  if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
    throw new Error(`"${username}" exists but is not an active admin. Use: npm run user:create -- --username ${username} --reset`);
  }

  const fromEnv = process.env.SEED_ADMIN_PASSWORD;
  // 12 random bytes → 16 characters, ~96 bits of entropy.
  const password = fromEnv || randomBytes(12).toString("base64url");
  const problem = passwordProblem(password, username);
  if (problem) throw new Error(`SEED_ADMIN_PASSWORD: ${problem}`);

  await prisma.user.create({
    data: { username, name: "Admin", role: "ADMIN", passwordHash: await hashPassword(password) },
  });

  console.log("\nAdmin account created — sign in and change the password under Account.");
  console.log(`  Username: ${username}`);
  console.log(fromEnv ? "  Password: (the SEED_ADMIN_PASSWORD you set)" : `  Password: ${password}   <- shown only once, save it now`);
  console.log("");
}

// Run directly: `tsx prisma/seed-admin.ts`
if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed-admin.ts")) {
  const prisma = new PrismaClient();
  ensureAdmin(prisma)
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
