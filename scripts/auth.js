// scripts/auth.js
(function () {
  const auth = window.FBL_FIREBASE.auth;

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

    const appBase =
      (window.FBL_APP_BASE ||
        (window.FBL_CFG && window.FBL_CFG.APP_BASE) ||
        window.location.origin).replace(/\/$/, "");

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

      const cred = await auth().createUserWithEmailAndPassword(email, password);
      // update profile with username
      await cred.user.updateProfile({ displayName: username });

      saveUserToSession(cred.user);
      return true;
    },

    async signIn(emailOrUser, password) {
      if (!emailOrUser || !password) {
        throw new Error("Please complete all fields.");
      }

      // we always use email for Firebase; you can decide email == username if you want
      const cred = await auth().signInWithEmailAndPassword(emailOrUser, password);
      saveUserToSession(cred.user);
      return true;
    },

    async signOut() {
      await auth().signOut();
      saveUserToSession(null);
      location.reload();
    },

    async hasSession() {
      return new Promise((resolve) => {
        const unsub = auth().onAuthStateChanged((user) => {
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

  // Keep hooks for Google button (for now just show alert or later hook GSI)
  window.fblGoogleOneTap = function () {
    alert("Google sign-in via Firebase not wired yet.");
  };
})();







