// ============================================================
//  STEP: Paste YOUR Firebase web config here (see README.md)
//  Firebase Console → Project settings → General → Your apps → Web app → Config
//  (This key is safe to be public — your data is protected by firestore.rules)
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAtj2JrJW2lCL0ZVVKvqg3xwyc7Ol5T68w",
  authDomain: "folio-library-366ed.firebaseapp.com",
  projectId: "folio-library-366ed",
  storageBucket: "folio-library-366ed.firebasestorage.app",
  messagingSenderId: "110897831091",
  appId: "1:110897831091:web:d397d6ee71d50705e2a4c6",
  measurementId: "G-0M4XRHJ75M"
};

// ---- Library settings (change freely) ----
export const LIBRARY_NAME = "Folio Library";
export const LOAN_DAYS = 14;      // default loan period in days
export const FINE_PER_DAY = 5;    // fine per overdue day
export const CURRENCY = "₹";
