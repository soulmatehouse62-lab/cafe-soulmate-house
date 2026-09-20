import "server-only";
import { prisma } from "./prisma";
import { normalizePhone } from "./money";

/** Last 10 digits of a phone number, or null when it has fewer than 10 digits. */
export function phoneKeyOf(phone: string | null | undefined): string | null {
  const digits = normalizePhone(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function nameWordsOf(name: string): string[] {
  return Array.from(new Set(name.toLowerCase().split(/\s+/).filter(Boolean)));
}

/**
 * Keep the Customer row for this phone in step with the latest order. Best effort: a failure
 * here must never fail the order itself, so errors are logged and swallowed.
 */
export async function rememberCustomer(phone: string | null, name: string | null, at: Date): Promise<void> {
  const phoneKey = phoneKeyOf(phone);
  if (!phoneKey || !phone || !name?.trim()) return;
  const data = { phone, name: name.trim(), nameWords: nameWordsOf(name), lastVisitAt: at };
  try {
    await prisma.customer.upsert({ where: { phoneKey }, create: { phoneKey, ...data }, update: data });
  } catch (e) {
    console.error("rememberCustomer", e);
  }
}
