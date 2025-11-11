// /scripts/resultsPage.js
(function () {
  const resultsContainer = document.getElementById('results-container') || document.querySelector('.results-container') || document.getElementById('results-list');
  if (!resultsContainer) { console.error('results.js: missing results container'); return; }

  const leagueKey = sessionStorage.getItem('FBL_leagueKey') || (() => {
    const p = location.pathname.toLowerCase();
    if (p.includes('/laliga/')) return 'LALIGA';
    if (p.includes('/bundesliga/')) return 'BUNDESLIGA';
    return 'PREMIER_LEAGUE';
  })();

  async function checkSession() {
    try {
      const r = await fetch('/api/users.php?action=session');
      const j = await r.json();
      return !!(j && j.success);
    } catch { return false; }
  }

  async function loadPredictions() {
    resultsContainer.innerHTML = '<div class="loading">Loading results…</div>';
const API_USERS = (window.FBL_API_BASE || "") + "/api/users.php";





    if (!(await checkSession())) {
      // send to sign in (user can switch to signup)
      const next = location.pathname;
      window.location.href = '/signin.html?next=' + encodeURIComponent(next);
      return;
    }

    try {
      const res = await fetch('/api/users.php?action=get_my_predictions');
      const json = await res.json();
      if (!json.success) { resultsContainer.innerHTML = `<div class="error">Unable to fetch: ${json.message || ''}</div>`; return; }
      const preds = (json.predictions || []).filter(p => p.league === leagueKey);
      if (!preds.length) { resultsContainer.innerHTML = '<div class="hint">No saved predictions for this league.</div>'; return; }

      // render (keeps your simple layout)
      resultsContainer.innerHTML = preds.map(p => `
        <div class="result-row" data-fixture="${p.fixtureId}">
          <div class="teams">${escapeHtml(p.home.name)} ${p.home.score} - ${p.away.score} ${escapeHtml(p.away.name)}</div>
        </div>
      `).join('');

    } catch (err) {
      console.error(err);
      resultsContainer.innerHTML = `<div class="error">Error loading results</div>`;
    }
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  loadPredictions();
})();






