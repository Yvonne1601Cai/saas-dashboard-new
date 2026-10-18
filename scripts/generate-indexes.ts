// Regenerates firestore.indexes.json from the query plan, the single source of
// truth for which queries the API can issue. Run: npm run indexes:generate
// (tests/queryPlan.test.ts fails if the committed file is out of date).
import { writeFileSync } from "node:fs";
import { fieldOverrides, requiredIndexes } from "../src/lib/products/queryPlan.ts";

const file = new URL("../firestore.indexes.json", import.meta.url);
writeFileSync(file, JSON.stringify({ indexes: requiredIndexes(), fieldOverrides: fieldOverrides() }, null, 2) + "\n");
console.log(`Wrote ${requiredIndexes().length} composite indexes to firestore.indexes.json`);
