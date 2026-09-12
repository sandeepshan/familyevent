// =============================================================================
// FIREBASE CONFIG — paste your project's values here.
//
// Where to get these: Firebase console → ⚙️ Project settings → General →
// "Your apps" → Web app → SDK setup and configuration → "Config".
// Full step-by-step instructions are in README.md.
//
// These values are NOT secret — they identify your Firebase project the same
// way a website URL does. Your data is protected by the Firestore/Storage
// security rules (see firestore.rules and storage.rules), not by hiding
// these values.
// =============================================================================

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID",
};

// Simple sanity check the rest of the app uses to decide whether to show
// the "please configure Firebase" banner instead of trying to run.
export function isFirebaseConfigured(cfg) {
  return Boolean(
    cfg &&
      cfg.apiKey &&
      !cfg.apiKey.startsWith("PASTE_") &&
      cfg.projectId &&
      !cfg.projectId.startsWith("PASTE_")
  );
}
