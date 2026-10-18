// Tests must never touch a real Firebase project (integration tests delete data).
// Always point the Admin SDK at the local emulators, whatever the shell has set.
process.env.FIREBASE_PROJECT_ID = "demo-saas-dashboard";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
delete process.env.FIREBASE_CLIENT_EMAIL;
delete process.env.FIREBASE_PRIVATE_KEY;
delete process.env.GEMINI_API_KEY;
process.env.METADATA_SERVER_DETECTION = "none";
