// /scripts/signinPage.js
(function () {
  function boot() {
    const form =
      document.getElementById("signin-form") ||
      document.getElementById("login-form");

    const emailInput =
      document.getElementById("email") ||
      document.getElementById("login-email");

    const passInput =
      document.getElementById("password") ||
      document.getElementById("login-password");

    const errEl =
      document.getElementById("signin-error") ||
      document.querySelector(".signin-error");

    if (!form || !emailInput || !passInput) {
      console.warn(
        "[Signin] Missing form/inputs. Expected ids: signin-form/login-form, email/login-email, password/login-password"
      );
      return;
    }

    const showErr = (msg) => {
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = "block";
      } else {
        alert(msg);
      }
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = emailInput.value.trim().toLowerCase();
      const password = passInput.value;

      if (!email || !password) {
        showErr("Email and password are required.");
        return;
      }

      try {
        const auth =
          (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) ||
          (window.firebase && firebase.auth());

        if (!auth) {
          showErr("Firebase auth not ready. Check script order.");
          return;
        }

        await auth.signInWithEmailAndPassword(email, password);

        // redirect
        const next = new URLSearchParams(location.search).get("next");
        if (next) {
          location.href = next;
          return;
        }

        const leagueKey =
          (sessionStorage.getItem("FBL_leagueKey") || "PREMIER_LEAGUE").toUpperCase();

        const folder =
          leagueKey === "LALIGA"
            ? "laliga"
            : leagueKey === "BUNDESLIGA"
            ? "bundesliga"
            : leagueKey === "LIGUE1"
            ? "ligue1"
            : "premier";

        location.href = `../${folder}/results.html`;
      } catch (err) {
        console.error("[Signin] failed:", err);
        const msg =
          (err && err.message) ? err.message.replace(/^Firebase:\s*/, "") : "Sign in failed.";
        showErr(msg);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
