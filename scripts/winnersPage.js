(function () {
  if (window.__FBL_WINNERS_INITED__) return;
  window.__FBL_WINNERS_INITED__ = true;

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
      "Player"
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
        const labelEl = item.querySelector("span");
        if (!labelEl) return;
        const label = (labelEl.textContent || "").trim().toLowerCase();

        // set active state based on current path
        if (label === "home" && path.includes("/index")) {
          item.classList.add("nav-active");
        } else if (label === "results" && path.includes("/results")) {
          item.classList.add("nav-active");
        } else if (label === "winners" && path.includes("/winners")) {
          item.classList.add("nav-active");
        } else if (label === "rules" && path.includes("/rules")) {
          item.classList.add("nav-active");
        }

        item.addEventListener("click", (e) => {
          e.preventDefault();
          if (label === "home") {
            window.location.href = `../${leagueSlug}/index.html`;
          } else if (label === "results") {
            window.location.href = `../${leagueSlug}/results.html`;
          } else if (label === "winners") {
            window.location.href = `../${leagueSlug}/winners.html`;
          } else if (label === "rules") {
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

            if (bestName && bestName !== "Player") {
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
  // Added leagueKey so we can customize the label for AFCON.
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

      if (leagueKey === "AFCON" && key.includes("|")) {
        // key example: "Group A|1"
        const [groupLabel, mdStr] = key.split("|");
        const md = parseInt(mdStr, 10);
        labelText = `${groupLabel} · Matchday ${Number.isFinite(md) ? md : mdStr}`;
      } else {
        // other leagues: key is just "1", "2", ...
        const md = parseInt(key, 10);
        labelText = `Matchday ${Number.isFinite(md) ? md : key}`;
      }

      return `
        <button class="matchday-pill${isActive ? " active" : ""}" data-md-key="${key}">
          ${labelText}
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

  // ---------- Daily Ra// ---------- Daily Rankings from Firestore (now per matchday AND group for AFCON) ----------
async function loadDailyRankings(
  db,
  leagueKey,
  currentUser,
  tbody,
  userPointsEl,
  selectedMatchdayKey // may be null on first call
) {
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3">Loading rankings…</td></tr>';

  try {
    // 1) fixtures for this league (for final scores if points are missing)
    const { byId: fixturesById } = await fetchFixturesForCurrentLeague(leagueKey);

    // 2) all predictions; we'll filter by league
    const snap = await db.collection("predictions").get();

    const wantedLeagues = leagueSynonyms(leagueKey);

    // scoresByKey[key][uid] = { uid, username, points }
    const scoresByKey = {};
    const keySet = new Set();

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

      // no final score yet -> pts === null -> ignore for ranking
      if (pts == null) return;

      // 🔹 Build the "key" for this ranking bucket
      let key;
      if (leagueKey === "AFCON") {
        // e.g. groupLabel = "Group A" or fallback "Group ?"
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
      scoresByKey[key][uid].points += pts;
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
    } else {
      // other leagues: matchdays are just "1", "2", ...
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
      tbody.innerHTML = '<tr><td colspan="3">No rankings yet.</td></tr>';
      if (userPointsEl) userPointsEl.textContent = "0";
      return;
    }

    // If no key chosen yet, use the latest (like the most recent status)
    if (!selectedMatchdayKey) {
      selectedMatchdayKey = matchdays[matchdays.length - 1];
    }

    // Build / update the WhatsApp-style matchday strip
    ensureMatchdayStrip(matchdays, selectedMatchdayKey, leagueKey, (newKey) => {
      // when a pill is clicked, reload rankings for that key
      loadDailyRankings(
        db,
        leagueKey,
        currentUser,
        tbody,
        userPointsEl,
        newKey
      );
    });

    const scoresByUid = scoresByKey[selectedMatchdayKey] || {};

    // 🔥 Try to replace generic names with email prefixes from users collection
    await enrichUsernamesFromUsersCollection(db, scoresByUid);

    const rows = Object.values(scoresByUid);
    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return String(a.username).localeCompare(String(b.username));
    });

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="3">No rankings yet for this matchday.</td></tr>';
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

    // update current user's points in the top strip *for this key*
    if (currentUser && userPointsEl) {
      const myRow = scoresByUid[currentUser.uid];
      const myPoints = myRow ? myRow.points : 0;
      userPointsEl.textContent = String(myPoints);
    }
  } catch (err) {
    console.error("[Winners] Failed to load rankings", err);
    tbody.innerHTML =
      '<tr><td colspan="3">Unable to load rankings.</td></tr>';
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

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const label = (tab.textContent || "").trim().toLowerCase();
        setActive(tab);

        if (label.includes("daily")) {
          // Daily Rankings -> per-matchday, status-style
          loadDailyRankings(db, leagueKey, currentUser, tbody, userPointsEl, null);
        } else if (label.includes("first round")) {
          tbody.innerHTML =
            '<tr><td colspan="3">First round standings coming soon.</td></tr>';
          const strip = document.querySelector(".matchday-strip");
          if (strip) strip.innerHTML = "";
          if (userPointsEl) userPointsEl.textContent = "--";
        } else if (label.includes("overall")) {
          tbody.innerHTML =
            '<tr><td colspan="3">Overall standings coming soon.</td></tr>';
          const strip = document.querySelector(".matchday-strip");
          if (strip) strip.innerHTML = "";
          if (userPointsEl) userPointsEl.textContent = "--";
        }
      });
    });

    // initial tab = Daily Rankings (or first tab)
    const initial =
      Array.from(tabs).find((t) =>
        (t.textContent || "").toLowerCase().includes("daily")
      ) || tabs[0];

    if (initial) {
      setActive(initial);
      // first load -> no matchday chosen yet (it will pick the latest)
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
        (user.email ? user.email.split("@")[0] : "Player");
      if (userNameEl) userNameEl.textContent = name;
      if (userPointsEl) userPointsEl.textContent = "--";
    } else {
      if (userNameEl) userNameEl.textContent = "Guest";
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
