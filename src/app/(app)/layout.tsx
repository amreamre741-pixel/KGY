import { db } from "@/lib/db";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import Shell from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const stores = can.seeAllStores(user)
    ? await db.store.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } })
    : [];
  const activeStoreId = await getActiveStoreId(user);

  return (
    <Shell
      user={{ name: user.name, role: user.role, storeName: user.storeName }}
      perms={{ import: can.importData(user), stores: can.manageStores(user), users: can.manageUsers(user) }}
      stores={stores}
      activeStoreId={activeStoreId}
    >
      {children}
    </Shell>
  );
}
