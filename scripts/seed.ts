// Creates two demo users and ~60 demo products in the Firebase EMULATORS.
//   npm run seed            (skips if products already exist)
//   npm run seed -- --reset (wipes products first)
//
// Refuses to run against anything but the emulators: it creates accounts with a
// published password.
import { adminAuth, db } from "../src/lib/firebase/admin.ts";
import { createProduct, getMetrics } from "../src/lib/products/repository.ts";
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
  Software: ["Insight Analytics", "TaskFlow", "CodeLens", "FormBuilder", "DataSync", "ChatDesk"],
  Hardware: ["Smart Badge Reader", "Desk Hub", "Sensor Kit", "Edge Gateway", "Label Printer"],
  Services: ["Onboarding Package", "Security Audit", "Migration Service", "Premium Support"],
  Subscriptions: ["Team Plan", "Business Plan", "Enterprise Plan", "Starter Plan", "Pro Plan"],
  Other: ["Gift Card", "Training Voucher", "Sticker Pack"],
};

async function main() {
  const [admin] = await Promise.all(DEMO_USERS.map((u) => ensureUser(u.email, u.role)));
  console.log(`Users ready: ${DEMO_USERS.map((u) => `${u.email} (${u.role})`).join(", ")}  password: ${PASSWORD}`);

  if (process.argv.includes("--reset")) await db.recursiveDelete(db.collection("products"));
  if ((await getMetrics()).totalProducts > 0) {
    console.log("Products already exist; skipping (use --reset to recreate).");
    return;
  }

  const rand = mulberry32(42);
  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
  const day = 24 * 60 * 60 * 1000;
  const editions = ["", " Lite", " Plus", " Max", " 2.0", " Cloud"];

  const total = 60;
  for (let i = 0; i < total; i++) {
    const category = pick(PRODUCT_CATEGORIES);
    const product: ProductCreateInput = {
      name: `${pick(NAMES[category])}${pick(editions)}`,
      category,
      priceCents: (Math.floor(rand() * 400) + 5) * 100 - (rand() < 0.5 ? 1 : 0),
      status: rand() < 0.75 ? "active" : "inactive",
      unitsSold: Math.floor(rand() * 500),
      description: "",
    };
    // Spread creation dates over the last ~90 days, oldest first.
    await createProduct(product, admin.uid, { createdAt: new Date(Date.now() - (total - i) * 1.5 * day) });
  }
  console.log(`Created ${total} products.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
