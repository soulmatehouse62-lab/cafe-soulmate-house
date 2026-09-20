import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

export const MENU_TAG = "public-menu";

export interface PublicMenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  variants: { name: string; price: number }[];
}

/**
 * What customers see on the public menu (/m): available items only, and only the fields a
 * customer needs. Cached so a busy table of scanners doesn't hit the database each time;
 * menu changes clear it immediately (revalidateTag in app/actions/menu.ts).
 */
export const getPublicMenu = unstable_cache(
  async (): Promise<PublicMenuItem[]> => {
    const items = await prisma.menuItem.findMany({
      where: { isAvailable: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, category: true, variants: true },
    });
    return items.map((i) => ({ ...i, variants: i.variants.map((v) => ({ name: v.name, price: v.price })) }));
  },
  ["public-menu"],
  { tags: [MENU_TAG], revalidate: 300 },
);
