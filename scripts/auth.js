// /scripts/auth.js
(function () {
  //
  // Base URLs (come from config.js; fall back to current origin)
  //
  const APP_BASE =
    window.FBL_APP_BASE ||
    (window.FBL_CFG && window.FBL_CFG.APP_BASE) ||
    window.location.origin;

  const API_BASE = (
    window.FBL_API_BASE ||
    (window.FBL_CFG && window.FBL_CFG.API_BASE) ||
    APP_BASE
  ).replace(/\/$/, "");

  const API_USERS = API_BASE + "/api/users.php";

  // -------- helpers --------
  async function apiPost(body) {
    const res = await fetch(API_USERS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // send/receive PHP session cookie
      body: JSON.stringify(body),
    });

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `API not JSON (status ${res.status}). Body: ${text.slice(0, 160)}…`
      );
    }
  }

  async function apiGet(q) {
    const res = await fetch(API_USERS + (q ? `?${q}` : ""), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `API not JSON (status ${res.status}). Body: ${text.slice(0, 160)}…`
      );
    }
  }

  // ---- pending predictions helper (shared with predictionsPage.js) ----
  function getPending() {
    try {
      return JSON.parse(
        sessionStorage.getItem("pending_predictions") || "[]"
      );
    } catch {
      return [];
    }
  }

  function clearPending() {
    sessionStorage.removeItem("pending_predictions");
  }

  // Called after signup / login to send pending predictions to PHP
  async function flushPendingIfAny() {
    const arr = getPending();
    if (!arr.length) return;

    for (const p of arr) {
      const r = await apiPost({ action: "save_prediction", prediction: p });
      if (!r || !r.success) {
        throw new Error(r?.message || "Save failed");
      }
    }
    clearPending();
  }

  // ---- redirect helpers ----
  function leagueFolderFromKey(key) {
    if (key === "LIGUE1") return "ligue1";
    if (key === "LALIGA") return "laliga";
    if (key === "BUNDESLIGA") return "bundesliga";
    return "premier";
  }

  function toAppUrl(next) {
    const base = APP_BASE.replace(/\/$/, "");
    if (!next) return base + "/";

    // absolute URL → leave it alone
    if (/^https?:\/\//i.test(next) || next.startsWith("//")) return next;

    // root-relative
    if (next.startsWith("/")) return base + next;

    // relative
    return base + "/" + next.replace(/^\.?\//, "");
  }

  function redirectAfterAuth() {
    const url = new URL(location.href);
    const next = url.searchParams.get("next");

    if (next) {
      location.href = toAppUrl(next);
      return;
    }

    // default → current league’s results
    const key = sessionStorage.getItem("FBL_leagueKey") || "PREMIER_LEAGUE";
    const folder = leagueFolderFromKey(key);
    location.href = toAppUrl(`/${folder}/results.html`);
  }

  // -------- public API --------
  const FBL_AUTH = {
    // returns true if ok, throws Error on failure
    async signUp(username, email, password) {
      if (!username || !email || !password) {
        throw new Error("Please complete all fields.");
      }

      const r = await apiPost({
        action: "signup",    // PHP expects "signup"
        username,            // PHP expects "username"
        email,
        password,
      });

      if (!r || !r.success) {
        throw new Error(r?.message || "Signup failed");
      }

      // push any pending predictions now that we have a PHP session
      await flushPendingIfAny();

      const u = r.user || {};
      sessionStorage.setItem(
        "fbl_current_user",
        JSON.stringify({
          id: u.id,
          username: u.username || username,
          email: u.email || email,
        })
      );

      return true;
    },

    async signIn(userOrEmail, password) {
      if (!userOrEmail || !password) {
        throw new Error("Please complete all fields.");
      }

      // server expects `email` for login (can be email or username for you)
      const r = await apiPost({
        action: "login",
        email: userOrEmail,
        password,
      });

      if (!r || !r.success) {
        throw new Error(r?.message || "Signin failed");
      }

      await flushPendingIfAny();

      const u = r.user || {};
      sessionStorage.setItem(
        "fbl_current_user",
        JSON.stringify({
          id: u.id,
          username: u.username,
          email: u.email || userOrEmail,
        })
      );

      return true;
    },

    async signOut() {
      try {
        await apiPost({ action: "logout" });
      } catch {
        // ignore
      }
      sessionStorage.removeItem("fbl_current_user");
      location.reload();
    },

    // ✅ trust ONLY the PHP session
    async hasSession() {
      try {
        const j = await apiGet("action=session");
        if (j && j.success && j.user) {
          sessionStorage.setItem(
            "fbl_current_user",
            JSON.stringify(j.user)
          );
          return true;
        }
      } catch (e) {
        console.warn("hasSession() failed:", e);
      }
      return false;
    },

    redirectAfterAuth,
    // compatibility alias
    redirectToResultsForCurrentLeague: redirectAfterAuth,

    // expose so signup/signin pages can use it too
    flushPendingIfAny,

    // -------- Google Identity (disabled) --------
    _googleInitDone: false,
    _googleClientId: null,

    googleInitOnce() {
      // Google sign-in disabled on server (see users.php)
      console.warn("Google sign-in is disabled.");
    },

    googlePrompt() {
      alert("Google sign-in is currently disabled on this site.");
    },
  };

  window.FBL_AUTH = FBL_AUTH;

  // Global callback used by the Google script tag (kept but disabled)
  window.fblGoogleOneTap = function () {
    alert("Google sign-in is currently disabled on this site.");
  };

  // Hook a visible Google button if it exists
  window.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("#g_id_signin");
    if (!btn) return;
    e.preventDefault();
    FBL_AUTH.googlePrompt();
  });

  // Auto-warm Google init if ever re-enabled
  window.addEventListener("load", () => {
    if (document.getElementById("g_id_onload")) {
      setTimeout(() => FBL_AUTH.googleInitOnce(), 200);
    }
  });
})();







