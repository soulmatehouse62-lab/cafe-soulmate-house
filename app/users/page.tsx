import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth";
import { UserManager } from "@/components/UserManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireAdminPage();
  const now = new Date();
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    // Never select passwordHash here: this is sent to the browser.
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
    },
  });

  return (
    <UserManager
      meId={me.id}
      users={users.map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        sessions: u._count.sessions,
      }))}
    />
  );
}
