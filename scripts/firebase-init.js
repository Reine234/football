//
// /scripts/firebase-init.js
(function () {
  if (!window.firebase) {
    console.error("[Firebase] compat SDK not loaded. Check script order.");
    return;
  }
const firebaseConfig = {
    apiKey: "AIzaSyApe--2B4qyVRwxUzREwsPgZ7hD5NLLcPc",
    authDomain: "fansbetliga-8cb53.firebaseapp.com",
    projectId: "fansbetliga-8cb53",
    storageBucket: "fansbetliga-8cb53.firebasestorage.app",
    messagingSenderId: "168157485644",
    appId: "1:168157485644:web:47e0ea8279114a503832e9",
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

  window.FBL_FIREBASE = { app: firebase.app(), auth, db };

  console.log("[Firebase] Ready:", firebase.app().options.projectId);
})();



