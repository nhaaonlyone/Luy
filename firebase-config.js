// Replace these values with the Firebase web app config from
// Firebase Console → Project settings → Your apps → SDK setup.

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "luy-1ba4d.firebaseapp.com",
  projectId: "luy-1ba4d",
  storageBucket: "luy-1ba4d.firebasestorage.app",
  messagingSenderId: "1062928986040",
  appId: "1:1062928986040:web:a2a825bd6c00bec8b83d4d",
};

export function isFirebaseConfigured() {
  return (
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    firebaseConfig.projectId !== "YOUR_PROJECT_ID" &&
    Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
  );
}
