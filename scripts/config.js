(function (global) { 
  const FBL = global.FBL || {};

  // We are now working with the *current* active season:
  // API-Football:
  //   season=2025  -> means 2025/2026 season
  //
  // We'll pull fixtures from July 1, 2025 up to May 2026.
  // (Bundesliga usually ends a bit earlier in May, so we respect that.)

  const API_CONFIG = {
    SEASON: 2025,              // 2025/2026 season
    TIMEZONE: "Africa/Douala", // display reference (you can keep this)
  };

  // Each league we support
  const LEAGUE_MAP = {
    "PREMIER_LEAGUE": {
      id: 39,                        // API-Football league id (Premier League)
      name: "Premier League",
      folder: "premier",

      // date window for fixtures in this season
      startDate: "2025-07-01",
      endDate:   "2026-05-25",

      totalRounds: 38,

      // TheSportsDB fallback for this same season
      sdb: {
        leagueId:  "4328",           // English Premier League on TheSportsDB
        seasonStr: "2025-2026"
      }
    },

    "LALIGA": {
      id: 140,                      // API-Football league id (La Liga)
      name: "La Liga",
      folder: "laliga",

      startDate: "2025-07-01",
      endDate:   "2026-05-25",

      totalRounds: 38,

      sdb: {
        leagueId:  "4335",          // La Liga on TheSportsDB
        seasonStr: "2025-2026"
      }
    },

    "BUNDESLIGA": {
      id: 78,                       // API-Football league id (Bundesliga)
      name: "Bundesliga",
      folder: "bundesliga",

      startDate: "2025-07-01",
      endDate:   "2026-05-17",      // Bundesliga finishes a bit earlier in May

      totalRounds: 34,

      sdb: {
        leagueId:  "4331",          // Bundesliga on TheSportsDB
        seasonStr: "2025-2026"
      }
    }
  };

  FBL.API_CONFIG = API_CONFIG;
  FBL.LEAGUE_MAP = LEAGUE_MAP;

  global.FBL = FBL;
})(window);
