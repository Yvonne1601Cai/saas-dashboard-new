import "server-only";
import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function createApp(): App {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // When an emulator host is set the Admin SDK talks to it automatically and
  // needs no credentials, so the project runs locally without any secrets.
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId });
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    return initializeApp({
      // Env vars flatten the key's newlines into literal "\n"; restore them.
      credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }),
    });
  }

  // Falls back to Application Default Credentials (e.g. on Google Cloud).
  return initializeApp({ credential: applicationDefault(), projectId });
}

// Reuse the app across hot reloads in dev, where this module is re-evaluated.
const app = getApps()[0] ?? createApp();

export const adminAuth = getAuth(app);
export const db = getFirestore(app);
