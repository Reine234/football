(function () {
  const STORAGE_KEY = "FBL_LANG";
  const DEFAULT_LANG = "en";

  // ✅ Your dictionary (add more keys anytime)
  const DICT = {
    fr: {
      // ===== existing =====
      app_name: "FANSBETLIGA",
      about: "À propos",
      wallet: "Portefeuille",
      notifications: "Notifications",
      login: "Connexion",
      signup: "Inscription",
      email: "Email",
      password: "Mot de passe",
      confirm_password: "Confirmer le mot de passe",
      start: "Commencer",
      bet_plus: "Parier +",
      add_money: "Ajouter de l'argent",
      withdraw_funds: "Retirer des fonds",
      recent_transactions: "Transactions récentes",
      view_all: "Tout voir",
      current_balance: "Solde courant",
      bonus_balance: "Solde bonus",
      language: "Langue",
      english: "Anglais",
      french: "Français",

      // ===== added (minimal) to match your CURRENT HTML keys =====
      "app.brand": "FANSBETLIGA",
      "nav.notificationsAria": "Notifications",

      "nav.home": "Accueil",
      "nav.results": "Résultats",
      "nav.winners": "Gagnants",
      "nav.rules": "Règles",

      "common.betPlus": "Parier +",

      "afcon.groupA.heading": "CAN 2025 — Groupe A",
      "afcon.groupB.heading": "CAN 2025 — Groupe B",
      "afcon.groupC.heading": "CAN 2025 — Groupe C",
      "afcon.groupD.heading": "CAN 2025 — Groupe D",
      "afcon.groupE.heading": "CAN 2025 — Groupe E",
      "afcon.groupF.heading": "CAN 2025 — Groupe F",

      "afcon.groupA.tab": "Groupe A",
      "afcon.groupB.tab": "Groupe B",
      "afcon.groupC.tab": "Groupe C",
      "afcon.groupD.tab": "Groupe D",
      "afcon.groupE.tab": "Groupe E",
      "afcon.groupF.tab": "Groupe F",

      "afcon.groupA.day1.date": "Mardi, 23 Déc 2025",
      "afcon.groupA.day2.date": "Samedi, 27 Déc 2025",
      "afcon.groupA.day3.date": "Mardi, 30 Déc 2025",
    },

    en: {
      // ===== existing =====
      app_name: "FANSBETLIGA",
      about: "About",
      wallet: "Wallet",
      notifications: "Notifications",
      login: "Login",
      signup: "Sign up",
      email: "Email",
      password: "Password",
      confirm_password: "Confirm password",
      start: "Start",
      bet_plus: "Bet +",
      add_money: "Add money",
      withdraw_funds: "Withdraw funds",
      recent_transactions: "Recent Transactions",
      view_all: "View all",
      current_balance: "Current Balance",
      bonus_balance: "Bonus Balance",
      language: "Language",
      english: "English",
      french: "French",

      // ===== added (minimal) to match your CURRENT HTML keys =====
      "app.brand": "FANSBETLIGA",
      "nav.notificationsAria": "Notifications",

      "nav.home": "Home",
      "nav.results": "Results",
      "nav.winners": "Winners",
      "nav.rules": "Rules",

      "common.betPlus": "Bet +",

      "afcon.groupA.heading": "AFCON 2025 — Group A",
      "afcon.groupB.heading": "AFCON 2025 — Group B",
      "afcon.groupC.heading": "AFCON 2025 — Group C",
      "afcon.groupD.heading": "AFCON 2025 — Group D",
      "afcon.groupE.heading": "AFCON 2025 — Group E",
      "afcon.groupF.heading": "AFCON 2025 — Group F",

      "afcon.groupA.tab": "Group A",
      "afcon.groupB.tab": "Group B",
      "afcon.groupC.tab": "Group C",
      "afcon.groupD.tab": "Group D",
      "afcon.groupE.tab": "Group E",
      "afcon.groupF.tab": "Group F",

      "afcon.groupA.day1.date": "Tuesday, 23 Dec 2025",
      "afcon.groupA.day2.date": "Saturday, 27 Dec 2025",
      "afcon.groupA.day3.date": "Tuesday, 30 Dec 2025",
    }
  };

  function getLang() {
    const v = (localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
    return v === "en" || v === "fr" ? v : DEFAULT_LANG;
  }

  function setLang(lang) {
    const safe = (lang || "").toLowerCase() === "en" ? "en" : "fr";
    localStorage.setItem(STORAGE_KEY, safe);
    applyLang(safe);
  }

  function t(lang, key) {
    return (DICT[lang] && DICT[lang][key]) || (DICT[DEFAULT_LANG] && DICT[DEFAULT_LANG][key]) || key;
  }

  function applyLang(lang) {
    // text nodes
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(lang, key);
    });

    // placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", t(lang, key));
    });

    // optional title
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      el.setAttribute("title", t(lang, key));
    });

    // keep dropdown in sync
    const dd = document.getElementById("langSelect");
    if (dd) dd.value = lang;

    // set <html lang="">
    document.documentElement.lang = lang;
  }

  // expose globally
  window.FBL_I18N = { getLang, setLang, applyLang, DICT };

  // apply as soon as DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    applyLang(getLang());

    // wire dropdown if it exists on this page
    const dd = document.getElementById("langSelect");
    if (dd) {
      dd.value = getLang();
      dd.addEventListener("change", (e) => setLang(e.target.value));
    }
  });
})();
