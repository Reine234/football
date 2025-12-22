// /scripts/winnersPage.js
(function () {
  if (window.__FBL_WINNERS_INITED__) return;
  window.__FBL_WINNERS_INITED__ = true;

  // ---------- I18N ----------
  function getLangSafe() {
    try {
      return (window.FBL_I18N && window.FBL_I18N.getLang && window.FBL_I18N.getLang()) || "en";
    } catch (_) {
      return "en";
    }
  }

  function tr(key, vars) {
    try {
      const i18n = window.FBL_I18N;
      const lang = getLangSafe();
      if (i18n && typeof i18n.t === "function") return i18n.t(lang, key, vars);
    } catch (_) {}
    if (vars && typeof vars === "object") {
      let s = key;
      Object.keys(vars).forEach((k) => (s = s.replaceAll(`{${k}}`, String(vars[k]))));
      return s;
    }
    return key;
  }

  // ---------- Helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );
  }

  function getLeagueSlugFromPath() {
    const path = (location.pathname || "").toLowerCase();
    if (path.includes("/laliga/")) return "laliga";
    if (path.includes("/bundesliga/")) return "bundesliga";
    if (path.includes("/premier/")) return "premier";
    if (path.includes("/afcon/")) return "afcon";

    const stored = (sessionStorage.getItem("FBL_leagueSlug") || "").toLowerCase();
    if (["laliga", "bundesliga", "premier", "afcon"].includes(stored)) {
      return stored;
    }
    return "premier";
  }

  function leagueKeyFromSlug(slug) {
    if (slug === "premier") return "PREMIER_LEAGUE";
    if (slug === "bundesliga") return "BUNDESLIGA";
    if (slug === "laliga") return "LALIGA";
    if (slug === "afcon") return "AFCON";
    return "PREMIER_LEAGUE";
  }

  function resolveLeagueKey() {
    const fromBody = (document.body.dataset.league || "").toUpperCase();
    if (["PREMIER_LEAGUE", "BUNDESLIGA", "LALIGA", "AFCON"].includes(fromBody)) {
      return fromBody;
    }
    const slug = getLeagueSlugFromPath();
    return leagueKeyFromSlug(slug);
  }

  // 🔧 only fallback is plain "Player" now (no UID tail)
  function computeDisplayNameFromData(data, fallbackUid) {
    return (
      data.userName ||
      data.username ||
      data.displayName ||
      (data.email ? data.email.split("@")[0] : null) ||
      tr("common.player")
    );
  }

  function normalizeLeagueString(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function leagueSynonyms(leagueKey) {
    const k = String(leagueKey || "").toUpperCase();
    if (k === "PREMIER_LEAGUE") {
      return ["premierleague", "premier", "epl"];
    }
    if (k === "BUNDESLIGA") {
      return ["bundesliga"];
    }
    if (k === "LALIGA") {
      return ["laliga", "laligasantander", "laligaes", "laligaea", "laligas"];
    }
    if (k === "AFCON") {
      return ["afcon", "can", "coupeafriquedesnations"];
    }
    return [normalizeLeagueString(k)];
  }

  // ---------- Points computation (same logic as resultsPage) ----------
  function computePoints(predH, predA, finH, finA) {
    if (!Number.isFinite(finH) || !Number.isFinite(finA)) return null;
    if (!Number.isFinite(predH) || !Number.isFinite(predA)) return 0;

    if (predH === finH && predA === finA) return 3;

    const po = predH === predA ? 0 : predH > predA ? 1 : -1;
    const ro = finH === finA ? 0 : finH > finA ? 1 : -1;
    const pd = predH - predA;
    const rd = finH - finA;

    if (po === ro && pd === rd) return 2;
    if (po === ro) return 1;
    return 0;
  }

  // ---------- Fixtures for this league ----------
  async function fetchFixturesForCurrentLeague(leagueKey) {
    if (!window.FBL || typeof window.FBL.fetchFixturesForLeague !== "function") {
      return { list: [], byId: {} };
    }
    try {
      const list = await window.FBL.fetchFixturesForLeague(leagueKey);
      const byId = {};
      (list || []).forEach((f) => {
        byId[String(f.id)] = f;
      });
      return { list: list || [], byId };
    } catch (err) {
      console.warn("[Winners] fetchFixturesForLeague failed", err);
      return { list: [], byId: {} };
    }
  }

  // ---------- Bottom nav + league tabs ----------
  function initBottomNavAndTabs(leagueSlug) {
    const nav = document.querySelector("nav.nav");
    const path = (location.pathname || "").toLowerCase();

    if (nav) {
      const items = nav.querySelectorAll(".nav-item");
      items.forEach((item) => {
        const dataNav = (item.dataset.nav || "").toLowerCase();

        // fallback to old label logic if data-nav is missing
        const labelEl = item.querySelector("span");
        const labelFallback = labelEl ? (labelEl.textContent || "").trim().toLowerCase() : "";
        const key = dataNav || labelFallback;

        // set active state based on current path
        if (key === "home" && path.includes("/index")) {
          item.classList.add("nav-active");
        } else if (key === "results" && path.includes("/results")) {
          item.classList.add("nav-active");
        } else if (key === "winners" && path.includes("/winners")) {
          item.classList.add("nav-active");
        } else if (key === "rules" && path.includes("/rules")) {
          item.classList.add("nav-active");
        }

        item.addEventListener("click", (e) => {
          e.preventDefault();
          if (key === "home") {
            window.location.href = `../${leagueSlug}/index.html`;
          } else if (key === "results") {
            window.location.href = `../${leagueSlug}/results.html`;
          } else if (key === "winners") {
            window.location.href = `../${leagueSlug}/winners.html`;
          } else if (key === "rules") {
            window.location.href = `../${leagueSlug}/rules.html`;
          }
        });
      });
    }

    const tabs = document.querySelectorAll(".league-tabs .tab");
    if (tabs.length) {
      tabs.forEach((tab) => {
        const href = (tab.getAttribute("data-href") || "").toLowerCase();
        // mark active if this href matches the end of the current path
        if (href && path.endsWith(href.split("../").pop())) {
          tab.classList.add("active");
        }
        tab.addEventListener("click", () => {
          const target = tab.getAttribute("data-href");
          if (target) window.location.href = target;
        });
      });
    }
  }

  // 🎯 Only include users who exist in the database (filter out deleted users)
  async function enrichUsernamesFromUsersCollection(db, scoresByUid) {
    if (!db) return;
    const uids = Object.keys(scoresByUid);
    if (!uids.length) return;

    try {
      await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await db.collection("users").doc(uid).get();
            if (!snap.exists) {
              // If the user does not exist, skip
              return;
            }
            const data = snap.data() || {};
            const email = data.email || data.userEmail || null;
            const bestName =
              data.userName ||
              data.username ||
              data.displayName ||
              (email ? email.split("@")[0] : null);

            if (bestName && bestName !== tr("common.player")) {
              scoresByUid[uid].username = bestName; // Only assign if the name is valid
            }
          } catch (e) {
            console.warn("[Winners] user lookup failed for", uid, e);
            // Skip user if lookup fails
          }
        })
      );
    } catch (err) {
      console.warn("[Winners] enrichUsernamesFromUsersCollection failed:", err);
    }
  }

  // ---------- Matchday "status" strip (WhatsApp-style) ----------
  // Now supports AFCON group + matchday, e.g. "Group A|1".
  function ensureMatchdayStrip(matchdays, currentKey, leagueKey, onSelectMatchday) {
    if (!matchdays || !matchdays.length) return;

    const card = document.querySelector(".card");
    if (!card) return;

    let tableEl = card.querySelector(".table");

    let strip = card.querySelector(".matchday-strip");
    if (!strip) {
      strip = document.createElement("div");
      strip.className = "matchday-strip";

      // 🔹 Find the direct child of .card that contains the table
      let target = tableEl;
      while (target && target.parentNode !== card) {
        target = target.parentNode;
      }

      if (target && target.parentNode === card) {
        // strip ABOVE the block that holds the table
        card.insertBefore(strip, target);
      } else {
        // fallback if structure is weird
        card.appendChild(strip);
      }
    }

    strip.innerHTML = matchdays
      .map((key) => {
        const isActive = key === currentKey;
        let labelText = "";

        // ✅ NEW: AFCON "All"
        if (leagueKey === "AFCON" && key === "ALL") {
          labelText = "All";
        } else if (leagueKey === "AFCON" && key.includes("|")) {
          // key example: "Group A|1"
          const [groupLabel, mdStr] = key.split("|");
          const md = parseInt(mdStr, 10);
          labelText = tr("winners.groupMatchdayLabel", {
            group: groupLabel,
            n: Number.isFinite(md) ? md : mdStr
          });
        } else {
          // other leagues: key is just "1", "2", ...
          const md = parseInt(key, 10);
          labelText = tr("winners.matchdayLabel", { n: Number.isFinite(md) ? md : key });
        }

        return `
          <button class="matchday-pill${isActive ? " active" : ""}" data-md-key="${key}">
            ${esc(labelText)}
          </button>
        `;
      })
      .join("");

    const pills = strip.querySelectorAll(".matchday-pill");
    pills.forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-md-key");
        if (!key || key === currentKey) return;
        if (typeof onSelectMatchday === "function") {
          onSelectMatchday(key);
        }
      });
    });
  }

  // ---------- Daily Rankings from Firestore (now per matchday AND group for AFCON) ----------
  async function loadDailyRankings(
    db,
    leagueKey,
    currentUser,
    tbody,
    userPointsEl,
    selectedMatchdayKey // may be null on first call
  ) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="3">${esc(tr("winners.loadingRankings"))}</td></tr>`;

    try {
      // 1) fixtures for this league (for final scores if points are missing)
      const { byId: fixturesById } = await fetchFixturesForCurrentLeague(leagueKey);

      // 2) all predictions; we'll filter by league
      const snap = await db.collection("predictions").get();

      const wantedLeagues = leagueSynonyms(leagueKey);

      // scoresByKey[key][uid] = { uid, username, points }
      const scoresByKey = {};
      const keySet = new Set();

      // ✅ NEW: AFCON "ALL" bucket across any matchday/group
      const allByUid = {};

      snap.forEach((doc) => {
        const data = doc.data() || {};
        const uid = data.uid;
        if (!uid) return;

        // filter by league
        const rawLeague =
          data.league || data.leagueKey || data.leagueSlug || data.leagueName;
        const normLeague = normalizeLeagueString(rawLeague);
        if (!wantedLeagues.includes(normLeague)) return;

        const fixtureId = String(data.fixtureId || "");
        if (!fixtureId) return;

        const mdRaw = data.matchday;
        const mdNum = parseInt(mdRaw, 10);
        if (!Number.isFinite(mdNum)) return; // ignore docs without matchday

        const fixture = fixturesById[fixtureId];

        // predicted scores
        const predHome = Number(
          data.home && data.home.score != null ? data.home.score : NaN
        );
        const predAway = Number(
          data.away && data.away.score != null ? data.away.score : NaN
        );

        // final scores (from fixtures)
        let finHome = NaN;
        let finAway = NaN;
        if (fixture && fixture.goals) {
          if (fixture.goals.home !== null && fixture.goals.home !== undefined) {
            finHome = Number(fixture.goals.home);
          }
          if (fixture.goals.away !== null && fixture.goals.away !== undefined) {
            finAway = Number(fixture.goals.away);
          }
        }

        let pts = null;

        // Prefer points already stored by resultsPage.js
        if (typeof data.points === "number" && Number.isFinite(data.points)) {
          pts = data.points;
        } else {
          pts = computePoints(predHome, predAway, finHome, finAway);
        }

        // 🔹 Build the "key" for this ranking bucket
        let key;
        if (leagueKey === "AFCON") {
          const groupLabel =
            data.groupLabel ||
            (data.group ? `Group ${data.group}` : "Group ?");
          key = `${groupLabel}|${mdNum}`; // "Group A|1"
        } else {
          key = String(mdNum); // "1", "2", ...
        }

        keySet.add(key);

        if (!scoresByKey[key]) {
          scoresByKey[key] = {};
        }
        if (!scoresByKey[key][uid]) {
          scoresByKey[key][uid] = {
            uid,
            username: computeDisplayNameFromData(data, uid), // temp name
            points: 0,
          };
        }

        // ✅ Change: include users even if match not finished (pts === null => add 0)
        if (pts != null) {
          scoresByKey[key][uid].points += pts;
        }

        // ✅ NEW: AFCON "ALL" leaderboard accumulator
        if (leagueKey === "AFCON") {
          if (!allByUid[uid]) {
            allByUid[uid] = {
              uid,
              username: computeDisplayNameFromData(data, uid),
              points: 0,
            };
          }
          if (pts != null) {
            allByUid[uid].points += pts;
          }
        }
      });

      let matchdays = Array.from(keySet);

      // Sort keys nicely
      if (leagueKey === "AFCON") {
        // sort by matchday number, then group label
        matchdays.sort((a, b) => {
          const [gA, mA] = a.split("|");
          const [gB, mB] = b.split("|");
          const nA = parseInt(mA, 10);
          const nB = parseInt(mB, 10);
          if (Number.isFinite(nA) && Number.isFinite(nB) && nA !== nB) {
            return nA - nB;
          }
          return String(gA).localeCompare(String(gB));
        });

        // ✅ NEW: Add "ALL" at the front if there is any AFCON data
        if (Object.keys(allByUid).length) {
          matchdays.unshift("ALL");
        }
      } else {
        matchdays.sort((a, b) => {
          const nA = parseInt(a, 10);
          const nB = parseInt(b, 10);
          if (Number.isFinite(nA) && Number.isFinite(nB)) {
            return nA - nB;
          }
          return String(a).localeCompare(String(b));
        });
      }

      // If no matchdays at all
      if (!matchdays.length) {
        tbody.innerHTML = `<tr><td colspan="3">${esc(tr("winners.noRankingsYet"))}</td></tr>`;
        if (userPointsEl) userPointsEl.textContent = "0";
        return;
      }

      // ✅ NEW: AFCON default selection = ALL (if present)
      if (!selectedMatchdayKey) {
        if (leagueKey === "AFCON" && matchdays.includes("ALL")) {
          selectedMatchdayKey = "ALL";
        } else {
          selectedMatchdayKey = matchdays[matchdays.length - 1];
        }
      }

      // Build / update the matchday strip
      ensureMatchdayStrip(matchdays, selectedMatchdayKey, leagueKey, (newKey) => {
        loadDailyRankings(db, leagueKey, currentUser, tbody, userPointsEl, newKey);
      });

      // ✅ NEW: use ALL bucket for AFCON when selected
      const scoresByUid =
        leagueKey === "AFCON" && selectedMatchdayKey === "ALL"
          ? allByUid
          : (scoresByKey[selectedMatchdayKey] || {});

      // Replace generic names with best from users collection
      await enrichUsernamesFromUsersCollection(db, scoresByUid);

      const rows = Object.values(scoresByUid);
      rows.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return String(a.username).localeCompare(String(b.username));
      });

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="3">${esc(tr("winners.noRankingsThisMatchday"))}</td></tr>`;
      } else {
        tbody.innerHTML = rows
          .map(
            (row, idx) => ` 
              <tr>
                <td>${idx + 1}</td>
                <td>${esc(row.username)}</td>
                <td>${row.points}</td>
              </tr>
            `
          )
          .join("");
      }

      // update current user's points for this key
      if (currentUser && userPointsEl) {
        const myRow = scoresByUid[currentUser.uid];
        const myPoints = myRow ? myRow.points : 0;
        userPointsEl.textContent = String(myPoints);
      }
    } catch (err) {
      console.error("[Winners] Failed to load rankings", err);
      tbody.innerHTML = `<tr><td colspan="3">${esc(tr("winners.unableToLoadRankings"))}</td></tr>`;
    }
  }

  // ---------- Classification tabs ----------
  function initClassificationTabs(db, leagueKey, currentUser) {
    const tabs = document.querySelectorAll(".tab-row .tab");
    const tbody = document.querySelector(".card .table tbody");
    const userPointsEl = document.querySelector(
      ".user-strip .user-points .value"
    );

    if (!tabs.length || !tbody) return;

    function setActive(tab) {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
    }

    function tabKeyFromText(txt) {
      const s = (txt || "").trim().toLowerCase();
      if (s.includes("daily") || s.includes("jour")) return "daily";
      if (s.includes("first") || s.includes("1er") || s.includes("1er tour")) return "first";
      if (s.includes("overall") || s.includes("général") || s.includes("general")) return "overall";
      return "";
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const label = tabKeyFromText(tab.textContent || "");
        setActive(tab);

        if (label === "daily") {
          loadDailyRankings(db, leagueKey, currentUser, tbody, userPointsEl, null);
        } else if (label === "first") {
          tbody.innerHTML = `<tr><td colspan="3">${esc(tr("winners.firstRoundSoon"))}</td></tr>`;
          const strip = document.querySelector(".matchday-strip");
          if (strip) strip.innerHTML = "";
          if (userPointsEl) userPointsEl.textContent = "--";
        } else if (label === "overall") {
          tbody.innerHTML = `<tr><td colspan="3">${esc(tr("winners.overallSoon"))}</td></tr>`;
          const strip = document.querySelector(".matchday-strip");
          if (strip) strip.innerHTML = "";
          if (userPointsEl) userPointsEl.textContent = "--";
        }
      });
    });

    // initial tab = Daily Rankings (or first tab)
    const initial =
      Array.from(tabs).find((t) => tabKeyFromText(t.textContent || "") === "daily") || tabs[0];

    if (initial) {
      setActive(initial);
      loadDailyRankings(db, leagueKey, currentUser, tbody, userPointsEl, null);
    }
  }

  // ---------- User strip ----------
  function initUserStrip(user) {
    const userNameEl = document.querySelector(".user-strip .user-pill span");
    const userPointsEl = document.querySelector(
      ".user-strip .user-points .value"
    );

    if (user) {
      const name =
        user.displayName ||
        (user.email ? user.email.split("@")[0] : tr("common.player"));
      if (userNameEl) userNameEl.textContent = name;
      if (userPointsEl) userPointsEl.textContent = "--";
    } else {
      if (userNameEl) userNameEl.textContent = tr("common.guest");
      if (userPointsEl) userPointsEl.textContent = "--";
    }
  }

  // ---------- Boot ----------
  function boot() {
    const leagueSlug = getLeagueSlugFromPath();
    const leagueKey = resolveLeagueKey();

    initBottomNavAndTabs(leagueSlug);

    if (!window.firebase || !firebase.auth || !firebase.firestore) {
      console.error("[Winners] Firebase not found.");
      return;
    }

    const db = firebase.firestore();

    // Guests can see rankings; logged-in users see their total in the pill
    firebase.auth().onAuthStateChanged((user) => {
      initUserStrip(user);
      initClassificationTabs(db, leagueKey, user);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
