import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDJvKskQ8s89rkVn3FdzZtmKyi9ocdDQzk",
  authDomain: "xisco-e8ecc.firebaseapp.com",
  databaseURL: "https://xisco-e8ecc-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "xisco-e8ecc",
  storageBucket: "xisco-e8ecc.firebasestorage.app",
  messagingSenderId: "414502663445",
  appId: "1:414502663445:web:8940659e0eb026e4fb251c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export database instance
export const db = getDatabase(app);
