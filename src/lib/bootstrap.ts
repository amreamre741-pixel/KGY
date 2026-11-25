import "server-only";
import bcrypt from "bcryptjs";
import { db } from "./db";

let initialized = false;

/**
 * Ensures that a freshly migrated production database (e.g. Neon on Vercel)
 * gets an initial OWNER account ("admin") and default stores on first visit
 * without requiring manual CLI access.
 */
export async function ensureInitialSetup(): Promise<void> {
  if (initialized) return;
  try {
    const count = await db.user.count();
    if (count > 0) {
      initialized = true;
      return;
    }

    const ownerPassword = process.env.OWNER_PASSWORD || "kgy12345";
    const passwordHash = await bcrypt.hash(ownerPassword, 10);

    await db.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) return;
      if ((await tx.store.count()) === 0) {
        await tx.store.createMany({
          data: [
            { name: "KGY — المحل الرئيسي", address: "", phone: "" },
            { name: "KGY — المخزن", address: "", phone: "" },
          ],
        });
      }
      await tx.user.create({
        data: {
          name: "المالك",
          username: "admin",
          passwordHash,
          role: "OWNER",
        },
      });
    });

    initialized = true;
  } catch {
    // Ignore transient connection errors during build/cold start; login action handles DB errors cleanly.
  }
}
