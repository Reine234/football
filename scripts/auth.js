// /scripts/auth.js
(function () {
const API_BASE  = (window.FBL_CFG && window.FBL_CFG.API_BASE) || "";
const API_USERS = API_BASE + "/api/users.php";

async function apiPost(body) {
  const res = await fetch(API_USERS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",      // <-- important for cookie session
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`API not JSON (status ${res.status}). Body: ${text.slice(0,120)}…`); }
}

async function apiGet(q) {
  const res = await fetch(API_USERS + (q ? `?${q}` : ""), {
    method: "GET",
    headers: { "Accept": "application/json" },
    credentials: "include",      // <-- important
  });
  return res.json();
}


  function getPending() {
    try { return JSON.parse(sessionStorage.getItem("pending_predictions") || "[]"); }
    catch { return []; }
  }
  function clearPending() { sessionStorage.removeItem("pending_predictions"); }

  async function flushPendingIfAny() {
    const arr = getPending();
    if (!arr.length) return;
    for (const p of arr) {
      await apiPost({ action: "save_prediction", prediction: p });
    }
    clearPending();
  }

  function leagueFolderFromKey(key) {
    if (key === "LALIGA") return "laliga";
    if (key === "BUNDESLIGA") return "bundesliga";
    return "premier";
  }

  function redirectAfterAuth() {
    const url = new URL(location.href);
    const next = url.searchParams.get("next");
    if (next) { location.href = next; return; }
    const key = sessionStorage.getItem("FBL_leagueKey") || "PREMIER_LEAGUE";
    const folder = leagueFolderFromKey(key);
    location.href = `/${folder}/results.html`;
  }

  // ---------- public API (used by your pages) ----------
  const FBL_AUTH = {
    // returns true on success, throws on error
    async signUp(username, email, password) {
      if (!username || !email || !password) throw new Error("Missing fields");
      await apiPost({ action: "signup", name: username, email, password });
      await flushPendingIfAny();
      return true;
    },

    async signIn(userOrEmail, password) {
      if (!userOrEmail || !password) throw new Error("Missing fields");
      await apiPost({ action: "login", email: userOrEmail, password });
      await flushPendingIfAny();
      return true;
    },

    async signOut() {
      try { await apiPost({ action: "logout" }); } catch {}
      location.reload();
    },

    async hasSession() {
      try {
        const j = await apiGet("action=session");
        return !!(j && j.success);
      } catch { return false; }
    },

    redirectAfterAuth,

    // -------- Google Identity --------
    _googleInitDone: false,
    _googleClientId: null,

    googleInitOnce() {
      if (this._googleInitDone) return;
      // try to read client id from your existing markup
      const el = document.getElementById("g_id_onload");
      const cid = el?.dataset?.client_id || window.FBL_GOOGLE_CLIENT_ID || null;
      if (!cid) { console.warn("Google Client ID missing."); return; }

      this._googleClientId = cid;

      if (!window.google || !google.accounts || !google.accounts.id) {
        console.warn("Google Identity script not loaded yet.");
        return;
      }
      google.accounts.id.initialize({
        client_id: cid,
        callback: window.fblGoogleOneTap, // defined below
        auto_select: false,
        cancel_on_tap_outside: true,
        context: "signin",
      });
      this._googleInitDone = true;
    },

    googlePrompt() {
      this.googleInitOnce();
      if (!window.google || !google.accounts || !google.accounts.id) {
        alert("Google sign-in not ready yet."); return;
      }
      google.accounts.id.prompt(); // show one-tap or account chooser
    },
  };

  window.FBL_AUTH = FBL_AUTH;

  // Global callback used by the Google script tag
  window.fblGoogleOneTap = async function (response) {
    try {
      const credential = response && (response.credential || response.id_token || response.idToken);
      if (!credential) throw new Error("No Google credential");
      await apiPost({ action: "google_login", credential });
      await flushPendingIfAny();
      FBL_AUTH.redirectAfterAuth();
    } catch (e) {
      alert(e.message || "Google sign-in failed");
    }
  };

  // Optional: auto-warm Google init when the SDK loads
  window.addEventListener("load", () => {
    if (document.getElementById("g_id_onload")) {
      // try a little later to ensure SDK finished parsing
      setTimeout(() => FBL_AUTH.googleInitOnce(), 200);
    }
  });
})();
