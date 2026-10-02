// Firebase project: mahjongtracker-66092 (Spark free plan).
// Requires: Firestore Database + Authentication > Anonymous sign-in enabled.
// This config is public by design; access is controlled by firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyAILL-s4TvqEdjxfNTrk57PbGJS0OWwUOc',
  authDomain: 'mahjongtracker-66092.firebaseapp.com',
  projectId: 'mahjongtracker-66092',
  storageBucket: 'mahjongtracker-66092.firebasestorage.app',
  messagingSenderId: '1014626507638',
  appId: '1:1014626507638:web:19bd16a4f492d29c6d7857',
  // App Check (protects the free Gemini quota) with reCAPTCHA Enterprise. The SITE key is public.
  // Firebase console → App Check → Apps → web app → reCAPTCHA Enterprise → same site key. Leave '' to turn App Check off.
  appCheckSiteKey: '6LcGU9stAAAAAIWto20jsD2ejqCi3L15P8GQTabs',
  appCheckProvider: 'enterprise', // 'enterprise' (recommended) or 'v3' (reCAPTCHA Classic, deprecated)
};
