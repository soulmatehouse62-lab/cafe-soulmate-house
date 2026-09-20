/**
 * Create an account from the command line — used for the first admin, and for recovery
 * when the only admin has forgotten their password.
 *
 *   npm run user:create -- --username priya --name "Priya Nair" --role ADMIN
 *   npm run user:create -- --username priya --reset        # new password, re-enable, sign out everywhere
 *
 * Anything not given on the command line is asked for (handy in PowerShell, which can swallow
 * the "--" in "npm run user:create -- ..."; "npx tsx scripts/create-user.ts --username ..." also works).
 * The password is asked for interactively (not echoed) so it never lands in shell history.
 * When stdin is not a terminal, the first line of stdin is used instead.
 */
import readline from "node:readline";
import { PrismaClient } from "@prisma/client";
import { USERNAME_RE, hashPassword, normalizeUsername, passwordProblem } from "../lib/password";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

/** Command-line value, or ask for it when running in a terminal. */
async function argOrAsk(name: string, question: string): Promise<string> {
  const value = arg(name);
  if (value !== undefined || !process.stdin.isTTY) return value ?? "";
  return ask(question);
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    const write = out._writeToOutput.bind(rl);
    let muted = false;
    out._writeToOutput = (s) => {
      if (!muted) write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function readPassword(username: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin });
    for await (const line of rl) return line;
    throw new Error("No password on stdin");
  }
  for (;;) {
    const password = await askHidden("Password: ");
    const problem = passwordProblem(password, username);
    if (problem) {
      console.error(problem);
      continue;
    }
    if ((await askHidden("Repeat password: ")) !== password) {
      console.error("Passwords don't match, try again.");
      continue;
    }
    return password;
  }
}

async function main() {
  const username = normalizeUsername(await argOrAsk("username", "Username: "));
  if (!USERNAME_RE.test(username)) {
    throw new Error("--username is required: 3–32 characters, letters, numbers, dot, dash or underscore");
  }

  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });

  if (process.argv.includes("--reset")) {
    if (!existing) throw new Error(`No account called "${username}"`);
    const password = await readPassword(username);
    const problem = passwordProblem(password, username);
    if (problem) throw new Error(problem);
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), isActive: true },
    });
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    await prisma.loginThrottle.deleteMany({ where: { id: `user:${username}` } });
    console.log(`Password reset for @${username}. All their sessions were signed out.`);
    return;
  }

  if (existing) throw new Error(`"${username}" already exists. Use --reset to set a new password.`);
  const name = (await argOrAsk("name", "Full name: ")).trim();
  if (!name) throw new Error('--name is required, e.g. --name "Priya Nair"');
  const role = ((await argOrAsk("role", "Role (ADMIN or STAFF) [STAFF]: ")) || "STAFF").toUpperCase();
  if (role !== "ADMIN" && role !== "STAFF") throw new Error("--role must be ADMIN or STAFF");

  const password = await readPassword(username);
  const problem = passwordProblem(password, username);
  if (problem) throw new Error(problem);
  await prisma.user.create({ data: { username, name, role, passwordHash: await hashPassword(password) } });
  console.log(`Created ${role === "ADMIN" ? "admin" : "staff"} account @${username}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
