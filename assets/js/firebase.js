// J Star Property Management — Firebase client setup
// Firebase web config is public. Never put passwords or private API secrets here.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDr1tOlET5YvPvvpbJS3dh8EG1vCHKESIQ",
  authDomain: "j-star-property-management.firebaseapp.com",
  projectId: "j-star-property-management",
  storageBucket: "j-star-property-management.firebasestorage.app",
  messagingSenderId: "1057232742653",
  appId: "1:1057232742653:web:12df36f3f1ace7bc107694",
  measurementId: "G-88FK20ESVX"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
