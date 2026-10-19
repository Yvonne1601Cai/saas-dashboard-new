// Creates two demo users and ~60 demo products, with sales, in the Firebase EMULATORS.
//   npm run seed            (skips if products already exist)
//   npm run seed -- --reset (wipes products and sales first)
//
// Refuses to run against anything but the emulators: it creates accounts with a
// published password.
import { adminAuth, db } from "../src/lib/firebase/admin.ts";
import { createProduct, getMetrics, recordSale } from "../src/lib/products/repository.ts";
import { setUserRole } from "../src/lib/users/repository.ts";
import { PRODUCT_CATEGORIES, type ProductCreateInput } from "../src/lib/products/schema.ts";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Refusing to seed: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are not set.");
  console.error("Copy .env.example to .env.local and run `npm run emulators` first.");
  process.exit(1);
}

const PASSWORD = "Passw0rd!demo";
const DEMO_USERS = [
  { email: "admin@example.com", role: "admin" },
  { email: "viewer@example.com", role: "viewer" },
] as const;

async function ensureUser(email: string, role: "admin" | "viewer") {
  let user;
  try {
    user = await adminAuth.getUserByEmail(email);
  } catch {
    user = await adminAuth.createUser({ email, password: PASSWORD, emailVerified: true });
  }
  await setUserRole(user.uid, role);
  return user;
}

// Small deterministic PRNG so every run produces the same catalogue.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES: Record<(typeof PRODUCT_CATEGORIES)[number], string[]> = {
  Bread: ["Sourdough Loaf", "Baguette", "Ciabatta", "Multigrain Loaf", "Rye Loaf", "Brioche Loaf", "Focaccia", "Challah"],
  Pastries: ["Butter Croissant", "Pain au Chocolat", "Cinnamon Roll", "Almond Danish", "Apple Turnover", "Cheese Danish", "Eclair"],
  Cakes: ["Chocolate Fudge Cake", "Carrot Cake", "Lemon Drizzle Cake", "Red Velvet Cake", "Cheesecake", "Black Forest Cake"],
  Cookies: ["Chocolate Chip Cookie", "Oatmeal Raisin Cookie", "Shortbread", "Macarons", "Snickerdoodle", "Ginger Snap"],
  Drinks: ["Flat White", "Cold Brew", "Chai Latte", "Hot Chocolate", "Fresh Orange Juice"],
  Other: ["Gift Box", "Baking Class Voucher", "Tote Bag"],
};

// Realistic whole-dollar price range per category, so a cake is not cheaper than a coffee.
const PRICE_DOLLARS: Record<(typeof PRODUCT_CATEGORIES)[number], [number, number]> = {
  Bread: [4, 9],
  Pastries: [3, 7],
  Cakes: [18, 65],
  Cookies: [2, 12],
  Drinks: [3, 8],
  Other: [10, 60],
};

async function main() {
  const [admin] = await Promise.all(DEMO_USERS.map((u) => ensureUser(u.email, u.role)));
  console.log(`Users ready: ${DEMO_USERS.map((u) => `${u.email} (${u.role})`).join(", ")}  password: ${PASSWORD}`);

  if (process.argv.includes("--reset")) {
    await Promise.all([db.recursiveDelete(db.collection("products")), db.recursiveDelete(db.collection("sales"))]);
  }
  if ((await getMetrics()).totalProducts > 0) {
    console.log("Products already exist; skipping (use --reset to recreate).");
    return;
  }

  const rand = mulberry32(42);
  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
  const day = 24 * 60 * 60 * 1000;
  const editions = ["", " (Mini)", " (Large)", " Family Pack", " Gluten-Free", " Vegan"];

  const total = 60;
  for (let i = 0; i < total; i++) {
    const category = pick(PRODUCT_CATEGORIES);
    const [minDollars, maxDollars] = PRICE_DOLLARS[category];
    const edition = pick(editions);
    const product: ProductCreateInput = {
      name: `${pick(NAMES[category])}${category === "Other" ? "" : edition}`,
      category,
      priceCents: (minDollars + Math.floor(rand() * (maxDollars - minDollars + 1))) * 100 - (rand() < 0.5 ? 1 : 0),
      status: rand() < 0.75 ? "active" : "inactive",
      description: "",
    };
    // Spread creation dates over the last ~90 days, oldest first.
    const createdAt = Date.now() - (total - i) * 1.5 * day;
    const { id } = await createProduct(product, admin.uid, { createdAt: new Date(createdAt) });

    // Up to three sales, in date order, between creation and now.
    const saleCount = Math.floor(rand() * 4);
    const saleTimes = Array.from({ length: saleCount }, () => createdAt + rand() * (Date.now() - createdAt)).sort((a, b) => a - b);
    for (const time of saleTimes) {
      await recordSale(id, { quantity: 1 + Math.floor(rand() * 150) }, admin.uid, { createdAt: new Date(time) });
    }
  }
  console.log(`Created ${total} products with sales.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
