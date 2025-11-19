// /scripts/config.js
(function () {
  // Global config container
  window.FBL_CFG = window.FBL_CFG || {};

  // ===== Base URLs =====
  // PHP backend (where users.php lives)
  if (!window.FBL_CFG.API_BASE) {
    // DEV: Apache/PHP on port 8080
    window.FBL_CFG.API_BASE = "http://localhost:8080";
    // PROD EXAMPLE:
    // window.FBL_CFG.API_BASE = "https://api.fansbetliga.com";
  }

  // Frontend base (your HTML pages / dev server)
  if (!window.FBL_CFG.APP_BASE) {
    // DEV: Vite / static frontend on port 5000
    window.FBL_CFG.APP_BASE = "http://localhost:5000";
    // PROD EXAMPLE:
    // window.FBL_CFG.APP_BASE = "https://fansbetliga.com";
  }

  // ===== API-Football / fixtures metadata =====
  // This is what `tryFetchAF` in api.js is expecting:
  //   window.FBL_CFG.API_FOOTBALL[leagueKey].SEASON
  //   window.FBL_CFG.API_FOOTBALL[leagueKey].LEAGUE_ID
  window.FBL_CFG.API_FOOTBALL = window.FBL_CFG.API_FOOTBALL || {
    PREMIER_LEAGUE: {
      LEAGUE_ID: 39,   // API-Football league id for Premier League
      SEASON:   2025,
    },
    BUNDESLIGA: {
      LEAGUE_ID: 78,   // Bundesliga
      SEASON:   2025,
    },
    LALIGA: {
      LEAGUE_ID: 140,  // La Liga
      SEASON:   2025,
    },
    LIGUE1: {
      LEAGUE_ID: 61,   // Ligue 1
      SEASON:   2025,
    },
  };

  // Legacy aliases for older scripts
  window.FBL_API_BASE = window.FBL_CFG.API_BASE;
  window.FBL_APP_BASE = window.FBL_CFG.APP_BASE;
})();








