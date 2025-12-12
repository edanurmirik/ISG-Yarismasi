import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration for this project
const firebaseConfig = {
  apiKey: 'AIzaSyB3nD_eCATf2chAPytkaC-LSYRCJQ30b5k',
  authDomain: 'isgyarismasi.firebaseapp.com',
  projectId: 'isgyarismasi',
  storageBucket: 'isgyarismasi.firebasestorage.app',
  messagingSenderId: '430745546366',
  appId: '1:430745546366:web:5c52e0733fc1a1fac0322f',
  measurementId: 'G-VHNB848YBC',
};

// Initialize Firebase once for the app
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Storage
// getStorage automatically uses storageBucket from firebaseConfig
const storage = getStorage(app);
console.log('Firebase Storage initialized');

// Analytics is optional and only runs in supported environments
let analytics;
if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
      return null;
    })
    .catch(() => {
      // Ignore analytics setup errors to keep auth working
    });
}

export { app, auth, analytics, db, storage };

