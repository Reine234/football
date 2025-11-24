// scripts/auth.js

(function () {

  // ✅ compat-safe auth getter (works whether auth is a function or object)
  // ✅ DO NOT cache authRaw at load time (race on prod)
  function getAuth() {
    const authRaw =
      (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) ||
      (window.firebase && firebase.auth);

    try {
      return typeof authRaw === "function" ? authRaw() : authRaw;
    } catch (_) {
      return null;
    }
  }

  // Flush predictions made before auth (stored in sessionStorage)
  async function flushPendingPredictionsFromSession() {
    const raw = sessionStorage.getItem("pending_predictions");
    if (!raw) return 0;

    let pending = [];
    try { pending = JSON.parse(raw); } catch (_) {}

    if (!Array.isArray(pending) || pending.length === 0) return 0;

    // store must exist
    if (
      !window.FBL_STORE ||
      typeof window.FBL_STORE.savePredictionsForRound !== "function"
    ) {
      console.warn("[Auth] FBL_STORE missing, keeping pending_predictions for later.");
      return 0; // keep pending, do NOT delete
    }

    const a = getAuth();
    const uid = a && a.currentUser ? a.currentUser.uid : null;
    if (!uid) {
      console.warn("[Auth] No uid yet, keeping pending_predictions for later.");
      return 0; // keep pending, do NOT delete
    }

    // Group by league + matchday so we save correctly
    const groups = {};
    pending.forEach((p) => {
      const lk = String(
        p.league || sessionStorage.getItem("FBL_leagueKey") || "PREMIER_LEAGUE"
      ).toUpperCase();

      const md = String(
        p.matchday || sessionStorage.getItem("FBL_roundNum") || "1"
      );

      const key = lk + "__" + md;
      if (!groups[key]) groups[key] = { leagueKey: lk, roundNum: md, items: [] };

      groups[key].items.push({
        ...p,
        uid,                 // ✅ ensure uid on each prediction
        league: lk,
        matchday: md,
      });
    });

    // Save each group
    for (const key in groups) {
      const g = groups[key];
      await window.FBL_STORE.savePredictionsForRound(
        g.leagueKey,
        g.roundNum,
        g.items
      );
    }

    sessionStorage.removeItem("pending_predictions");
    console.log("[Auth] flushed pending predictions:", pending.length);
    return pending.length;
  }

  // ----- Helpers -----
  function saveUserToSession(user) {
    if (!user) {
      sessionStorage.removeItem("fbl_current_user");
      return;
    }
    const { uid, email, displayName } = user;
    const payload = {
      id: uid,
      username: displayName || email?.split("@")[0] || "Player",
      email: email || "",
    };
    sessionStorage.setItem("fbl_current_user", JSON.stringify(payload));
  }

  function leagueFolderFromKey(key) {
    if (key === "LIGUE1") return "ligue1";
    if (key === "LALIGA") return "laliga";
    if (key === "BUNDESLIGA") return "bundesliga";
    return "premier";
  }

  function redirectAfterAuth() {
    const params = new URLSearchParams(location.search);
    const next = params.get("next");

    const origin = window.location.origin.replace(/\/$/, "");

    const cfgBase =
      (window.FBL_APP_BASE ||
        (window.FBL_CFG && window.FBL_CFG.APP_BASE) ||
        origin).replace(/\/$/, "");

    // ✅ SAFETY: never use localhost base when we’re on a real domain
    const appBase =
      /localhost|127\.0\.0\.1/.test(cfgBase) && !/localhost|127\.0\.0\.1/.test(origin)
        ? origin
        : cfgBase;

    if (next) {
      if (/^https?:\/\//i.test(next) || next.startsWith("//")) {
        location.href = next;
      } else if (next.startsWith("/")) {
        location.href = appBase + next;
      } else {
        location.href = appBase + "/" + next.replace(/^\.?\//, "");
      }
      return;
    }

    const key = sessionStorage.getItem("FBL_leagueKey") || "PREMIER_LEAGUE";
    const folder = leagueFolderFromKey(key);
    location.href = appBase + `/${folder}/results.html`;
  }

  // ----- Public API -----
  const FBL_AUTH = {
    async signUp(username, email, password) {
      if (!username || !email || !password) {
        throw new Error("Please complete all fields.");
      }

      const a = getAuth();
      if (!a) throw new Error("Firebase auth not ready.");

      const cred = await a.createUserWithEmailAndPassword(email, password);

      // update profile with username
      await cred.user.updateProfile({ displayName: username });

      saveUserToSession(cred.user);

      // ✅ flush AFTER signup (uid now exists)
      try { await flushPendingPredictionsFromSession(); } catch (e) {
        console.warn("[Auth] flush after signup failed:", e);
      }

      redirectAfterAuth();
      return true;
    },

    async signIn(emailOrUser, password) {
      if (!emailOrUser || !password) {
        throw new Error("Please complete all fields.");
      }

      const a = getAuth();
      if (!a) throw new Error("Firebase auth not ready.");

      const cred = await a.signInWithEmailAndPassword(emailOrUser, password);

      saveUserToSession(cred.user);

      // ✅ flush AFTER signin
      try { await flushPendingPredictionsFromSession(); } catch (e) {
        console.warn("[Auth] flush after signin failed:", e);
      }

      redirectAfterAuth();
      return true;
    },

    async signOut() {
      const a = getAuth();
      if (!a) return;
      await a.signOut();
      saveUserToSession(null);
      location.reload();
    },

    async hasSession() {
      return new Promise((resolve) => {
        const a = getAuth();
        if (!a) return resolve(false);

        const unsub = a.onAuthStateChanged((user) => {
          saveUserToSession(user || null);
          unsub();
          resolve(!!user);
        });
      });
    },

    redirectAfterAuth,
    redirectToResultsForCurrentLeague: redirectAfterAuth,
  };

  window.FBL_AUTH = FBL_AUTH;

  // ✅ SAFETY AUTO-FLUSH:
  // If a user lands on any page already logged in and there are pending predictions,
  // flush them once store+uid are ready.
  (function autoFlushOnAuthReady() {
    let tries = 0;
    const t = setInterval(() => {
      const a = getAuth();
      if (!a) {
        if (++tries > 50) clearInterval(t); // ~5s max wait
        return;
      }
      clearInterval(t);

      a.onAuthStateChanged(async (user) => {
        if (!user) return;
        const raw = sessionStorage.getItem("pending_predictions");
        if (!raw) return;

        try {
          await flushPendingPredictionsFromSession();
        } catch (e) {
          console.warn("[Auth] auto flush failed:", e);
        }
      });
    }, 100);
  })();

  // Keep hooks for Google button (now real Firebase Google sign-in)

  // Google Sign-In with Firebase (compat-safe)
  window.fblGoogleOneTap = async function () {
    try {
      // Grab whatever you stored in firebase-init.js
      const rawAuth =
        (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) ||
        (window.firebase && firebase.auth); // could be function OR instance

      if (!rawAuth) {
        throw new Error("Firebase auth not ready. Check firebase-init.js order.");
      }

      // Normalize to an auth *instance*
      const authApi = (typeof rawAuth === "function") ? rawAuth() : rawAuth;

      if (!authApi || typeof authApi.signInWithPopup !== "function") {
        throw new Error("Firebase auth instance invalid. Check FBL_FIREBASE.auth setup.");
      }

      if (!firebase?.auth?.GoogleAuthProvider) {
        throw new Error("GoogleAuthProvider not available. Ensure compat SDK is loaded.");
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const cred = await authApi.signInWithPopup(provider);

      // keep your existing flow
      saveUserToSession(cred.user);
      await flushPendingPredictionsFromSession();

      console.log("[Auth] Google sign-in success ✅", cred.user?.uid);
      redirectAfterAuth();
    } catch (err) {
      console.error("[Auth] Google sign-in failed:", err);
      alert(err.message || "Google sign-in failed. Please try again.");
    }
  };

})();
