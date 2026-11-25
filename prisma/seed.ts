/* Initial data: owner account, two stores, and a few demo parts. Run: npm run db:seed */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const norm = (s: string) => s.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");

async function main() {
  const ownerPassword = process.env.OWNER_PASSWORD || "kgy12345";

  if ((await db.user.count()) > 0) {
    console.log("Database already has users — skipping seed.");
    return;
  }

  const main = await db.store.create({ data: { name: "KGY — المحل الرئيسي", address: "", phone: "" } });
  const second = await db.store.create({ data: { name: "KGY — المخزن", address: "", phone: "" } });

  await db.user.create({
    data: {
      name: "المالك",
      username: "admin",
      passwordHash: await bcrypt.hash(ownerPassword, 10),
      role: "OWNER",
    },
  });

  if (process.env.SEED_DEMO === "0") return;

  const cats = Object.fromEntries(
    await Promise.all(
      [
        ["فرامات", "Brakes"],
        ["فيلترات", "Filters"],
        ["كهرباء", "Electrical"],
        ["محرك", "Engine"],
        ["تعليق", "Suspension"],
      ].map(async ([ar, en]) => [ar, (await db.category.create({ data: { nameAr: ar, nameEn: en } })).id]),
    ),
  ) as Record<string, string>;

  type Demo = {
    reference: string;
    nameAr: string;
    nameEn: string;
    brand: string;
    cat: string;
    buy: number;
    sell: number;
    barcode: string;
    compat: { type: "CAR" | "TRUCK"; make: string; model: string; yearFrom?: number; yearTo?: number }[];
    stock: [number, number, string, number, number, string]; // main qty,min,loc | second qty,min,loc
  };

  const demo: Demo[] = [
    {
      reference: "0 986 494 294", nameAr: "بلاكيت فرام قدام", nameEn: "Front brake pads", brand: "Bosch", cat: "فرامات",
      buy: 2800, sell: 3600, barcode: "4047025261876",
      compat: [{ type: "CAR", make: "Renault", model: "Symbol", yearFrom: 2013, yearTo: 2020 }, { type: "CAR", make: "Dacia", model: "Logan", yearFrom: 2012, yearTo: 2020 }],
      stock: [12, 4, "A-3", 20, 5, "R1-2"],
    },
    {
      reference: "OC 1196", nameAr: "فيلتر زيت", nameEn: "Oil filter", brand: "Mahle", cat: "فيلترات",
      buy: 650, sell: 950, barcode: "4009026500123",
      compat: [{ type: "CAR", make: "Volkswagen", model: "Golf 7", yearFrom: 2013, yearTo: 2019 }, { type: "CAR", make: "Seat", model: "Leon", yearFrom: 2013, yearTo: 2020 }],
      stock: [3, 6, "B-1", 30, 10, "R2-1"],
    },
    {
      reference: "A0004201220", nameAr: "بلاكيت فرام شاحنة", nameEn: "Truck brake pads", brand: "Mercedes", cat: "فرامات",
      buy: 9500, sell: 12500, barcode: "",
      compat: [{ type: "TRUCK", make: "Mercedes", model: "Actros", yearFrom: 2003, yearTo: 2018 }, { type: "TRUCK", make: "Mercedes", model: "Axor", yearFrom: 2004, yearTo: 2016 }],
      stock: [6, 2, "T-1", 4, 2, "T-4"],
    },
    {
      reference: "2992241", nameAr: "فيلتر قازوال", nameEn: "Fuel filter", brand: "Iveco", cat: "فيلترات",
      buy: 1800, sell: 2500, barcode: "",
      compat: [{ type: "TRUCK", make: "Iveco", model: "Daily", yearFrom: 2006, yearTo: 2019 }],
      stock: [0, 3, "T-2", 8, 3, "T-5"],
    },
    {
      reference: "VAL 439720", nameAr: "ألترناتور", nameEn: "Alternator", brand: "Valeo", cat: "كهرباء",
      buy: 18500, sell: 23900, barcode: "",
      compat: [{ type: "CAR", make: "Peugeot", model: "208", yearFrom: 2012, yearTo: 2019 }, { type: "CAR", make: "Citroën", model: "C3", yearFrom: 2010, yearTo: 2016 }],
      stock: [2, 1, "C-7", 1, 1, "R5-1"],
    },
    {
      reference: "KD457.43", nameAr: "كيت كوروا (سير التوزيع)", nameEn: "Timing belt kit", brand: "Dayco", cat: "محرك",
      buy: 7200, sell: 9400, barcode: "",
      compat: [{ type: "CAR", make: "Hyundai", model: "Accent", yearFrom: 2011, yearTo: 2017 }, { type: "CAR", make: "Kia", model: "Rio", yearFrom: 2011, yearTo: 2017 }],
      stock: [5, 2, "D-2", 0, 0, ""],
    },
    {
      reference: "334842", nameAr: "أمورتيسور قدام", nameEn: "Front shock absorber", brand: "Kayaba", cat: "تعليق",
      buy: 6400, sell: 8200, barcode: "",
      compat: [{ type: "CAR", make: "Renault", model: "Clio 4", yearFrom: 2012, yearTo: 2019 }],
      stock: [8, 2, "E-1", 4, 2, "R3-3"],
    },
  ];

  const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
  let n = 1;
  for (const d of demo) {
    const part = await db.part.create({
      data: {
        reference: d.reference,
        refNorm: norm(d.reference),
        nameAr: d.nameAr,
        nameEn: d.nameEn,
        brand: d.brand,
        categoryId: cats[d.cat],
        purchasePrice: new Prisma.Decimal(d.buy),
        salePrice: new Prisma.Decimal(d.sell),
        barcode: d.barcode || `20000000000${String(n++).padStart(2, "0")}`,
        compat: { create: d.compat },
      },
    });
    const [q1, m1, l1, q2, m2, l2] = d.stock;
    for (const [store, q, m, l] of [
      [main.id, q1, m1, l1],
      [second.id, q2, m2, l2],
    ] as const) {
      await db.stock.create({ data: { partId: part.id, storeId: store, quantity: q, minQuantity: m, location: l } });
      if (q > 0)
        await db.stockMovement.create({
          data: { partId: part.id, storeId: store, userId: admin.id, type: "INITIAL", quantity: q, after: q },
        });
    }
  }
  console.log(`Seeded: 2 stores, owner "admin", ${demo.length} demo parts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
