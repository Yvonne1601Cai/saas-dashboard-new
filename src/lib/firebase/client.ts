// Browser-side Firebase, used for exactly one thing: proving who the user is
// (email + password) so the server can mint a session. After that the browser
// never holds a Firebase token: see LoginForm.
import { getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";

let auth: Auth | undefined;

export function getClientAuth(): Auth {
  if (auth) return auth;

  // NEXT_PUBLIC_* must be referenced literally so Next can inline them at build time.
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });

  // In-memory persistence: the default stores the ID/refresh token in IndexedDB,
  // where any XSS could read it. We only need the token for a moment to hand it to
  // our server, which then issues an httpOnly cookie that JavaScript cannot read.
  try {
    auth = initializeAuth(app, { persistence: inMemoryPersistence });
  } catch {
    auth = getAuth(app); // already initialised (hot reload)
    return auth;
  }

  if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
  }
  return auth;
}
