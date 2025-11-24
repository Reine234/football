// scripts/auth.js
(function () {
  const authRaw = window.FBL_FIREBASE && window.FBL_FIREBASE.auth;

  // compat-safe auth getter
  function getAuth() {
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
        uid,      // ensure uid on each prediction
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

  // 🔒 Make next-path always same-origin and never localhost
  function sanitizeNext(nextRaw) {
    if (!nextRaw) return null;

    const origin = window.location.origin.replace(/\/$/, "");

    try {
      // URL() will normalize ../ and ./ safely
      const u = new URL(nextRaw, origin + "/");

      // If next is pointing to localhost or another origin, strip to path only
      const host = u.hostname || "";
      const isLocalhost = /localhost|127\.0\.0\.1/.test(host);
      const pathOnly = u.pathname + u.search + u.hash;

      return pathOnly.startsWith("/") ? pathOnly : "/" + pathOnly;
    } catch (e) {
      // fallback for weird strings
      let n = String(nextRaw).trim();

      // strip absolute localhost
      if (/^https?:\/\//i.test(n) && /localhost|127\.0\.0\.1/.test(n)) {
        try {
          const u2 = new URL(n);
          n = u2.pathname + u2.search + u2.hash;
        } catch (_) {}
      }

      n = n.replace(/^(\.\/|\.\.\/)+/, ""); // remove leading ./ or ../
      if (!n.startsWith("/")) n = "/" + n;
      return n;
    }
  }

  function redirectAfterAuth() {
    const params = new URLSearchParams(location.search);
    const nextRaw = params.get("next");

    const origin = window.location.origin.replace(/\/$/, "");
    const nextPath = sanitizeNext(nextRaw);

    if (nextPath) {
      console.log("[Auth] redirecting to next =", origin + nextPath);
      location.assign(origin + nextPath);
      return;
    }

    const key = sessionStorage.getItem("FBL_leagueKey") || "PREMIER_LEAGUE";
    const folder = leagueFolderFromKey(key);
    const fallback = `/${folder}/results.html`;

    console.log("[Auth] redirecting to fallback =", origin + fallback);
    location.assign(origin + fallback);
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
      await cred.user.updateProfile({ displayName: username });

      saveUserToSession(cred.user);

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

  // Auto-flush once user is already logged in
  (function autoFlushOnAuthReady() {
    const a = getAuth();
    if (!a) return;

    a.onAuthStateChanged(async (user) => {
      if (!user) return;
      if (!sessionStorage.getItem("pending_predictions")) return;

      try { await flushPendingPredictionsFromSession(); }
      catch (e) { console.warn("[Auth] auto flush failed:", e); }
    });
  })();

  // Google Sign-In with Firebase (compat-safe)
  window.fblGoogleOneTap = async function () {
    try {
      const rawAuth =
        (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) ||
        (window.firebase && firebase.auth);

      if (!rawAuth) {
        throw new Error("Firebase auth not ready. Check firebase-init.js order.");
      }

      const authApi = (typeof rawAuth === "function") ? rawAuth() : rawAuth;

      if (!authApi || typeof authApi.signInWithPopup !== "function") {
        throw new Error("Firebase auth instance invalid.");
      }

      if (!firebase?.auth?.GoogleAuthProvider) {
        throw new Error("GoogleAuthProvider not available.");
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const cred = await authApi.signInWithPopup(provider);

      saveUserToSession(cred.user);
      await flushPendingPredictionsFromSession();

      console.log("[Auth] Google sign-in success ✅", cred.user?.uid);
      redirectAfterAuth();
    } catch (err) {
      console.error("[Auth] Google sign-in failed:", err);
      alert(err.message || "Google sign-in failed. Please try again.");
    }
  };

  // Facebook (you'll wire provider later)
  window.fblFacebookSignIn = async function () {
    alert("Facebook sign-in not wired yet.");
  };
})();
