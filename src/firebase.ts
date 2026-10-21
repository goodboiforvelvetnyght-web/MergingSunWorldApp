import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
const emulator = import.meta.env.VITE_FIREBASE_EMULATORS === "true";
const config = {
  apiKey: emulator ? "demo-api-key" : "AIzaSyAGCFlgh3zRlO7ZfLGwXuBSsNvxRgtJaw4",
  authDomain: "mergingsunapp-2.firebaseapp.com",
  projectId: emulator ? "demo-merging-sun" : "mergingsunapp-2",
  storageBucket: "mergingsunapp-2.firebasestorage.app",
  messagingSenderId: "277886772831",
  appId: "1:277886772831:web:425227fd5a1805628dddea",
};
const app = initializeApp(config);
export const auth = getAuth(app),
  db = getFirestore(app),
  functions = getFunctions(
    app,
    import.meta.env.VITE_FUNCTIONS_REGION || "asia-southeast1",
  );
if (emulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
