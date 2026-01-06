// /afcon/afconFixtures.js
(function () {
  // 🔹 CENTRAL list of ALL AFCON fixtures (A–F)
  // Copy your Group B–F fixtures in the same structure
  window.AFCON_FIXTURES = [
    // ===== GROUP A =====
    {
      id: "AFGA-1",
      group: "A",
      utcDate: "2025-12-21T19:00:00Z",
      roundNum: 1,
      roundText: "Matchday 1",
      leagueId: null,
      home: { id: "MOR", name: "Morocco", logo: "../img/morocco.png" },
      away: { id: "COM", name: "Comoros", logo: "../img/comoros.png" },
      goals: { home: null, away: null },
      status: { short: "NS", long: "Not Started" },
    },
    {
      id: "AFGA-2",
      group: "A",
      utcDate: "2025-12-22T14:30:00Z",
      roundNum: 1,
      roundText: "Matchday 1",
      leagueId: null,
      home: { id: "MLI", name: "Mali", logo: "../img/mali.png" },
      away: { id: "ZAM", name: "Zambia", logo: "../img/zambia.png" },
      goals: { home: null, away: null },
      status: { short: "NS", long: "Not Started" },
    },
    {
      id: "AFGA-3",
      group: "A",
      utcDate: "2025-12-26T20:00:00Z",
      roundNum: 2,
      roundText: "Matchday 2",
      leagueId: null,
      home: { id: "MOR", name: "Morocco", logo: "../img/morocco.png" },
      away: { id: "MLI", name: "Mali", logo: "../img/mali.png" },
      goals: { home: null, away: null },
      status: { short: "NS", long: "Not Started" },
    },
    {
      id: "AFGA-4",
      group: "A",
      utcDate: "2025-12-26T17:30:00Z",
      roundNum: 2,
      roundText: "Matchday 2",
      leagueId: null,
      home: { id: "ZAM", name: "Zambia", logo: "../img/zambia.png" },
      away: { id: "COM", name: "Comoros", logo: "../img/comoros.png" },
      goals: { home: null, away: null },
      status: { short: "NS", long: "Not Started" },
    },
    {
      id: "AFGA-5",
      group: "A",
      utcDate: "2025-12-29T19:00:00Z",
      roundNum: 3,
      roundText: "Matchday 3",
      leagueId: null,
      home: { id: "ZAM", name: "Zambia", logo: "../img/zambia.png" },
      away: { id: "MOR", name: "Morocco", logo: "../img/morocco.png" },
      goals: { home: null, away: null },
      status: { short: "NS", long: "Not Started" },
    },
    {
      id: "AFGA-6",
      group: "A",
      utcDate: "2025-12-29T19:00:00Z",
      roundNum: 3,
      roundText: "Matchday 3",
      leagueId: null,
      home: { id: "COM", name: "Comoros", logo: "../img/comoros.png" },
      away: { id: "MLI", name: "Mali", logo: "../img/mali.png" },
      goals: { home: null, away: null },
      status: { short: "NS", long: "Not Started" },
    },
    

     {
          id: "AFGB-1",
          group: "B",
          utcDate: "2025-12-22T19:00:00Z",
          roundNum: 1,
          roundText: "Matchday 1",
          leagueId: "AFCON",
          home: { id: "EGY", name: "Egypt", logo: "../img/egypt.png" },
          away: { id: "ZIM", name: "Zimbabwe", logo: "../img/zimbabwe.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGB-2",
          group: "B",
          utcDate: "2025-12-22T14:30:00Z",
          roundNum: 1,
          roundText: "Matchday 1",
          leagueId: "AFCON",
          home: { id: "RSA", name: "South Africa", logo: "../img/southafrica.png" },
          away: { id: "ANG", name: "Angola", logo: "../img/angola.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGB-3",
          group: "B",
          utcDate: "2025-12-26T15:00:00Z",
          roundNum: 2,
          roundText: "Matchday 2",
          leagueId: "AFCON",
          home: { id: "EGY", name: "Egypt", logo: "../img/egypt.png" },
          away: { id: "RSA", name: "South Africa", logo: "../img/southafrica.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGB-4",
          utcDate: "2025-12-26T12:30:00Z",
          roundNum: 2,
          roundText: "Matchday 2",
          leagueId: "AFCON",
          home: { id: "ANG", name: "Angola", logo: "../img/angola.png" },
          away: { id: "ZIM", name: "Zimbabwe", logo: "../img/zimbabwe.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGB-5",
          group: "B",
          utcDate: "2025-12-29T16:00:00Z",
          roundNum: 3,
          roundText: "Matchday 3",
          leagueId: "AFCON",
          home: { id: "EGY", name: "Egypt", logo: "../img/egypt.png" },
          away: { id: "ANG", name: "Angola", logo: "../img/angola.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGB-6",
          group: "B",
          utcDate: "2025-12-29T16:00:00Z",
          roundNum: 3,
          roundText: "Matchday 3",
          leagueId: "AFCON",
          home: { id: "ZIM", name: "Zimbabwe", logo: "../img/zimbabwe.png" },
          away: { id: "RSA", name: "South Africa", logo: "../img/southafrica.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        // ===== GROUP C =====
{
  id: "AFGC-1",
  group: "C",
  utcDate: "2025-12-23T19:00:00Z",
  roundNum: 1,
  roundText: "Matchday 1",
  leagueId: null,
  home: { id: "NGA", name: "Nigeria",   logo: "../img/nigeria.png" },
  away: { id: "TZA", name: "Tanzania",  logo: "../img/tanzania.png" },
  goals: { home: null, away: null },
  status: { short: "NS", long: "Not Started" },
},
{
  id: "AFGC-2",
  group: "C",
  utcDate: "2025-12-23T14:30:00Z",
  roundNum: 1,
  roundText: "Matchday 1",
  leagueId: null,
  home: { id: "TUN", name: "Tunisia",  logo: "../img/tunisia.png" },
  away: { id: "UGA", name: "Uganda",   logo: "../img/uganda.png" },
  goals: { home: null, away: null },
  status: { short: "NS", long: "Not Started" },
},
{
  id: "AFGC-3",
  group: "C",
  utcDate: "2025-12-27T20:00:00Z",
  roundNum: 2,
  roundText: "Matchday 2",
  leagueId: null,
  home: { id: "NGA", name: "Nigeria",  logo: "../img/nigeria.png" },
  away: { id: "TUN", name: "Tunisia",  logo: "../img/tunisia.png" },
  goals: { home: null, away: null },
  status: { short: "NS", long: "Not Started" },
},
{
  id: "AFGC-4",
  group: "C",
  utcDate: "2025-12-27T17:30:00Z",
  roundNum: 2,
  roundText: "Matchday 2",
  leagueId: null,
  home: { id: "UGA", name: "Uganda",   logo: "../img/uganda.png" },
  away: { id: "TZA", name: "Tanzania", logo: "../img/tanzania.png" },
  goals: { home: null, away: null },
  status: { short: "NS", long: "Not Started" },
},
{
  id: "AFGC-5",
  group: "C",
  utcDate: "2025-12-30T16:00:00Z",
  roundNum: 3,
  roundText: "Matchday 3",
  leagueId: null,
  home: { id: "NGA", name: "Nigeria",  logo: "../img/nigeria.png" },
  away: { id: "UGA", name: "Uganda",   logo: "../img/uganda.png" },
  goals: { home: null, away: null },
  status: { short: "NS", long: "Not Started" },
},
{
  id: "AFGC-6",
  group: "C",
  utcDate: "2025-12-30T16:00:00Z",
  roundNum: 3,
  roundText: "Matchday 3",
  leagueId: null,
  home: { id: "TZA", name: "Tanzania", logo: "../img/tanzania.png" },
  away: { id: "TUN", name: "Tunisia",  logo: "../img/tunisia.png" },
  goals: { home: null, away: null },
  status: { short: "NS", long: "Not Started" },
},

       {
          id: "AFGD-1",
          group: "D",
          utcDate: "2025-12-23T19:00:00Z",
          roundNum: 1,
          roundText: "Matchday 1",
          leagueId: "AFCON",
          home: { id: "SEN", name: "Senegal", logo: "../img/senegal.png" },
          away: { id: "BOT", name: "Botswana", logo: "../img/botswana.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGD-2",
           group: "D",
          utcDate: "2025-12-23T14:30:00Z",
          roundNum: 1,
          roundText: "Matchday 1",
          leagueId: "AFCON",
          home: { id: "COD", name: "DR Congo", logo: "../img/drcongo.png" },
          away: { id: "BEN", name: "Benin", logo: "../img/benin.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGD-3",
           group: "D",
          utcDate: "2025-12-27T15:00:00Z",
          roundNum: 2,
          roundText: "Matchday 2",
          leagueId: "AFCON",
          home: { id: "COD", name: "DR Congo", logo: "../img/drcongo.png" },
          away: { id: "SEN", name: "Senegal", logo: "../img/senegal.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGD-4",
           group: "D",
          utcDate: "2025-12-27T12:30:00Z",
          roundNum: 2,
          roundText: "Matchday 2",
          leagueId: "AFCON",
          home: { id: "BEN", name: "Benin", logo: "../img/benin.png" },
          away: { id: "BOT", name: "Botswana", logo: "../img/botswana.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGD-5",
           group: "D",
          utcDate: "2025-12-30T19:00:00Z",
          roundNum: 3,
          roundText: "Matchday 3",
          leagueId: "AFCON",
          home: { id: "BOT", name: "Botswana", logo: "../img/botswana.png" },
          away: { id: "COD", name: "DR Congo", logo: "../img/drcongo.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGD-6",
           group: "D",
          utcDate: "2025-12-30T19:00:00Z",
          roundNum: 3,
          roundText: "Matchday 3",
          leagueId: "AFCON",
          home: { id: "BEN", name: "Benin", logo: "../img/benin.png" },
          away: { id: "SEN", name: "Senegal", logo: "../img/senegal.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        
         {
          id: "AFGE-1",
           group: "E",
          utcDate: "2025-12-24T15:00:00Z",
          roundNum: 1,
          roundText: "Matchday 1",
          leagueId: "AFCON",
          home: { id: "ALG", name: "Algeria", logo: "../img/algeria.png" },
          away: { id: "SDN", name: "Sudan", logo: "../img/sudan.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGE-2",
            group: "E",
          utcDate: "2025-12-24T12:30:00Z",
          roundNum: 1,
          roundText: "Matchday 1",
          leagueId: "AFCON",
          home: { id: "BFA", name: "Burkina Faso", logo: "../img/burkinafaso.png" },
          away: { id: "EQG", name: "Equatorial Guinea", logo: "../img/equatorialguinea.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGE-3",
            group: "E",
          utcDate: "2025-12-28T17:30:00Z",
          roundNum: 2,
          roundText: "Matchday 2",
          leagueId: "AFCON",
          home: { id: "ALG", name: "Algeria", logo: "../img/algeria.png" },
          away: { id: "BFA", name: "Burkina Faso", logo: "../img/burkinafaso.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGE-4",
            group: "E",
          utcDate: "2025-12-28T15:00:00Z",
          roundNum: 2,
          roundText: "Matchday 2",
          leagueId: "AFCON",
          home: { id: "EQG", name: "Equatorial Guinea", logo: "../img/equatorialguinea.png" },
          away: { id: "SDN", name: "Sudan", logo: "../img/sudan.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGE-5",
            group: "E",
          utcDate: "2025-12-31T16:00:00Z",
          roundNum: 3,
          roundText: "Matchday 3",
          leagueId: "AFCON",
          home: { id: "EQG", name: "Equatorial Guinea", logo: "../img/equatorialguinea.png" },
          away: { id: "ALG", name: "Algeria", logo: "../img/algeria.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGE-6",
            group: "E",
          utcDate: "2025-12-31T16:00:00Z",
          roundNum: 3,
          roundText: "Matchday 3",
          leagueId: "AFCON",
          home: { id: "BFA", name: "Burkina Faso", logo: "../img/burkinafaso.png" },
          away: { id: "SDN", name: "Sudan", logo: "../img/sudan.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGF-1",
            group: "F",
          utcDate: "2025-12-24T17:30:00Z",
          roundNum: 1,
          roundText: "Matchday 1",
          leagueId: "AFCON",
          home: { id: "CIV", name: "Côte d’Ivoire", logo: "../img/cotedivoire.png" },
          away: { id: "MOZ", name: "Mozambique", logo: "../img/mozambique.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGF-2",
             group: "F",
          utcDate: "2025-12-24T20:00:00Z",
          roundNum: 1,
          roundText: "Matchday 1",
          leagueId: "AFCON",
          home: { id: "CMR", name: "Cameroon", logo: "../img/cameroon.png" },
          away: { id: "GAB", name: "Gabon", logo: "../img/gabon.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGF-3",
             group: "F",
          utcDate: "2025-12-28T20:00:00Z",
          roundNum: 2,
          roundText: "Matchday 2",
          leagueId: "AFCON",
          home: { id: "CMR", name: "Cameroon", logo: "../img/cameroon.png" },
          away: { id: "CIV", name: "Côte d’Ivoire", logo: "../img/cotedivoire.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGF-4",
             group: "F",
          utcDate: "2025-12-28T12:30:00Z",
          roundNum: 2,
          roundText: "Matchday 2",
          leagueId: "AFCON",
          home: { id: "GAB", name: "Gabon", logo: "../img/gabon.png" },
          away: { id: "MOZ", name: "Mozambique", logo: "../img/mozambique.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGF-5",
             group: "F",
          utcDate: "2025-12-31T19:00:00Z",
          roundNum: 3,
          roundText: "Matchday 3",
          leagueId: "AFCON",
          home: { id: "CMR", name: "Cameroon", logo: "../img/cameroon.png" },
          away: { id: "MOZ", name: "Mozambique", logo: "../img/mozambique.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFGF-6",
             group: "F",
          utcDate: "2025-12-31T19:00:00Z",
          roundNum: 3,
          roundText: "Matchday 3",
          leagueId: "AFCON",
          home: { id: "CIV", name: "Côte d’Ivoire", logo: "../img/cotedivoire.png" },
          away: { id: "GAB", name: "Gabon", logo: "../img/gabon.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },

        // ===== QUARTER-FINALS (Round 5) =====
        // NOTE: Times are in UTC (displayed in local time by the UI)
        {
          id: "AFCON-QF-001",
          group: "QF",
          utcDate: "2026-01-09T16:00:00Z", // 17:00 (UTC+1)
          roundNum: 5,
          roundText: "Quarter-finals",
          leagueId: "AFCON",
          home: { id: "MLI", name: "Mali", logo: "../img/mali.png" },
          away: { id: "SEN", name: "Senegal", logo: "../img/senegal.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFCON-QF-002",
          group: "QF",
          utcDate: "2026-01-09T19:00:00Z", // 20:00 (UTC+1)
          roundNum: 5,
          roundText: "Quarter-finals",
          leagueId: "AFCON",
          home: { id: "MAR", name: "Morocco", logo: "../img/morocco.png" },
          away: { id: "CMR", name: "Cameroon", logo: "../img/cameroon.png" },
          goals: { home: null, away: null },
          status: { short: "NS", long: "Not Started" }
        },
        {
          id: "AFCON-QF-003",
          group: "QF",
          utcDate: "2026-01-10T16:00:00Z", // 17:00 (UTC+1)
          roundNum: 5,
          roundText: "Quarter-finals",
          leagueId: "AFCON",
          home: { id: "TBD1", name: "TBD", logo: "" },
          away: { id: "NIG", name: "Nigeria", logo: "../img/nigeria.png" },
          goals: { home: null, away: null },
          status: { short: "TBD", long: "To Be Determined" }
        },
        {
          id: "AFCON-QF-004",
          group: "QF",
          utcDate: "2026-01-10T19:00:00Z", // 20:00 (UTC+1)
          roundNum: 5,
          roundText: "Quarter-finals",
          leagueId: "AFCON",
          home: { id: "EGY", name: "Egypt", logo: "../img/egypt.png" },
          away: { id: "TBD4", name: "TBD", logo: "" },
          goals: { home: null, away: null },
          status: { short: "TBD", long: "To Be Determined" }
        }

    // ===== GROUP B =====
    // ❗TODO: copy fixtures from your groupB.html:
    // {
    //   id: "AFGB-1",
    //   group: "B",
    //   utcDate: "...",
    //   roundNum: 1,
    //   roundText: "Matchday 1",
    //   home: { id: "...", name: "...", logo: "../img/..." },
    //   away: { id: "...", name: "...", logo: "../img/..." },
    //   goals: { home: null, away: null },
    //   status: { short: "NS", long: "Not Started" },
    // },

    // ===== GROUP C, D, E, F =====
    // ❗Repeat exactly the same pattern, with:
    // - id: "AFGC-1", "AFGD-2", etc.
    // - group: "C", "D", "E", "F"
    // - roundNum: 1/2/3
  ];

  // Helper: get all fixtures for a matchday (any group)
  window.getAfconFixturesForMatchday = function (matchday) {
    const day = Number(matchday);
    if (!Number.isFinite(day)) return [];
    return (window.AFCON_FIXTURES || []).filter(
      (f) => Number(f.roundNum) === day
    );
  };
})();
