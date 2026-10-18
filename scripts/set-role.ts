// Sets a user's role from the command line. This is how the FIRST admin is
// created (the Users page needs an admin to already exist).
//   npm run set-role -- someone@example.com admin
// Against production it needs service-account credentials in the environment.
import { adminAuth } from "../src/lib/firebase/admin.ts";
import { ROLES, type Role } from "../src/lib/auth/roles.ts";
import { setUserRole } from "../src/lib/users/repository.ts";

const [email, role] = process.argv.slice(2);
if (!email || !ROLES.includes(role as Role)) {
  console.error(`Usage: npm run set-role -- <email> <${ROLES.join("|")}>`);
  process.exit(1);
}

try {
  const user = await adminAuth.getUserByEmail(email);
  await setUserRole(user.uid, role as Role);
  const target = process.env.FIREBASE_AUTH_EMULATOR_HOST ? "emulator" : process.env.FIREBASE_PROJECT_ID;
  console.log(`${email} is now ${role} (${target}). They must sign in again.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
process.exit(0);
