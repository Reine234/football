<?php
// =============================
//  CORS SETUP
// =============================
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

$allowedOrigins = [
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'https://fansbetliga.com',
    'https://www.fansbetliga.com',
    'https://api.fansbetliga.com',
];

if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
}

// Handle preflight for POST/credentials
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}





// =============================
//  SESSION (cookie settings for local + prod)
// =============================
$host        = $_SERVER['HTTP_HOST'] ?? '';
$isLocalhost = ($host === 'localhost' || $host === '127.0.0.1');

// For PHP 7.3+ we can pass an array with samesite
if (PHP_VERSION_ID >= 70300) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        // In production make sure this matches your real domain:
        // e.g. ".fansbetliga.com"
        'domain'   => $isLocalhost ? '' : '.fansbetliga.com',
        'secure'   => $isLocalhost ? false : true,   // must be true for HTTPS in prod
        'httponly' => true,
        // Localhost → Lax (works fine).
        // Prod (subdomain api.<domain> called from <domain>) → None so cross-site XHR sends cookies.
        'samesite' => $isLocalhost ? 'Lax' : 'None',
    ]);
} else {
    // Older PHP fallback – keep it simple
    $params = session_get_cookie_params();
    $path   = $params['path'] . '; samesite=' . ($isLocalhost ? 'Lax' : 'None');
    $domain = $isLocalhost ? '' : '.fansbetliga.com';
    $secure = $isLocalhost ? false : true;
    session_set_cookie_params(0, $path, $domain, $secure, true);
}

session_start();



// =============================
//  FILE PATHS  (POINT TO /data)
// =============================
$baseDir = dirname(__DIR__);         // FOOTBALL/
$dataDir = $baseDir . '/data';       // FOOTBALL/data

if (!is_dir($dataDir)) {
    // directory should already exist, but just in case:
    @mkdir($dataDir, 0775, true);
}

$usersFile       = $dataDir . '/users.xml';
$predictionsFile = $dataDir . '/predictions.xml';

// =============================
//  HELPERS
// =============================
function respondJson(array $payload) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function ensureXmlFile($path, $rootName) {
    if (!file_exists($path) || trim((string)@file_get_contents($path)) === '') {
        $xml = new SimpleXMLElement('<?xml version="1.0"?><' . $rootName . '/>');
        $xml->asXML($path);
    }
}

function loadUsersXml() {
    global $usersFile;
    ensureXmlFile($usersFile, 'users');
    return simplexml_load_file($usersFile);
}

function saveUsersXml(SimpleXMLElement $xml) {
    global $usersFile;
    $xml->asXML($usersFile);
}

function loadPredictionsXml() {
    global $predictionsFile;
    ensureXmlFile($predictionsFile, 'predictions');
    return simplexml_load_file($predictionsFile);
}

function savePredictionsXml(SimpleXMLElement $xml) {
    global $predictionsFile;
    $xml->asXML($predictionsFile);
}

function nextUserId(SimpleXMLElement $users) {
    $max = 0;
    foreach ($users->user as $u) {
        $id = (int)($u['id'] ?? 0);
        if ($id > $max) $max = $id;
    }
    return $max + 1;
}

// relaxed matching for leagues (XML may use slightly different labels)
function leaguesMatchBackend($pLeagueRaw, $leagueKeyRaw) {
    $pl = strtoupper((string)$pLeagueRaw);
    $lk = strtoupper((string)$leagueKeyRaw);
    if (!$pl || !$lk) return false;
    if ($pl === $lk) return true;

    if (strpos($lk, 'PREMIER') !== false && strpos($pl, 'PREMIER') !== false) return true;
    if ((strpos($lk, 'LALIGA') !== false || strpos($lk, 'LA LIGA') !== false) &&
        (strpos($pl, 'LALIGA') !== false || strpos($pl, 'LA LIGA') !== false)) return true;
    if (strpos($lk, 'BUNDES') !== false && strpos($pl, 'BUNDES') !== false) return true;
    if (strpos($lk, 'LIGUE') !== false && strpos($pl, 'LIGUE') !== false) return true;

    return false;
}

// =============================
//  READ REQUEST / ACTION
// =============================
$method   = $_SERVER['REQUEST_METHOD'];
$rawBody  = file_get_contents('php://input');
$jsonBody = json_decode($rawBody, true);
if (!is_array($jsonBody)) $jsonBody = [];

$action = '';
if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
} elseif ($method === 'POST') {
    $action = $jsonBody['action'] ?? ($_POST['action'] ?? '');
}
$action = strtolower((string)$action);

// =============================
//  ROUTING
// =============================

// ---------- SESSION ----------
if ($method === 'GET' && $action === 'session') {
    if (!empty($_SESSION['user_id'])) {
        respondJson([
            'success' => true,
            'user' => [
                'id'       => (int)$_SESSION['user_id'],
                'username' => $_SESSION['username'] ?? '',
                'email'    => $_SESSION['email'] ?? '',
            ]
        ]);
    }
    respondJson(['success' => false, 'message' => 'No active session.']);
}

// ---------- SIGN UP ----------
if ($method === 'POST' && $action === 'signup') {
    $username = trim((string)($jsonBody['username'] ?? ''));
    $email    = trim(strtolower((string)($jsonBody['email'] ?? '')));
    $password = (string)($jsonBody['password'] ?? '');

    if ($username === '' || $email === '' || $password === '') {
        respondJson(['success' => false, 'message' => 'All fields are required.']);
    }

    $users = loadUsersXml();

    // check if email already exists
    foreach ($users->user as $u) {
      if (strtolower((string)$u->email) === $email) {
        respondJson(['success' => false, 'message' => 'Email is already registered.']);
      }
    }

    $id = nextUserId($users);
    $user = $users->addChild('user');
    $user->addAttribute('id', $id);
    $user->addChild('username', htmlspecialchars($username, ENT_QUOTES, 'UTF-8'));
    $user->addChild('email',    htmlspecialchars($email,    ENT_QUOTES, 'UTF-8'));
    $user->addChild('password', password_hash($password, PASSWORD_DEFAULT));
    $user->addChild('created_at', date('c'));

    saveUsersXml($users);

    $_SESSION['user_id']  = $id;
    $_SESSION['username'] = $username;
    $_SESSION['email']    = $email;

    respondJson([
        'success' => true,
        'user' => [
            'id'       => $id,
            'username' => $username,
            'email'    => $email,
        ]
    ]);
}

// ---------- LOGIN ----------
if ($method === 'POST' && ($action === 'login' || $action === 'signin')) {
    $email    = trim(strtolower((string)($jsonBody['email'] ?? '')));
    $password = (string)($jsonBody['password'] ?? '');

    if ($email === '' || $password === '') {
        respondJson(['success' => false, 'message' => 'Email and password are required.']);
    }

    $users = loadUsersXml();
    foreach ($users->user as $u) {
        if (strtolower((string)$u->email) === $email) {
            $hash = (string)$u->password;
            if ($hash !== '' && password_verify($password, $hash)) {
                $id       = (int)$u['id'];
                $username = (string)$u->username;

                $_SESSION['user_id']  = $id;
                $_SESSION['username'] = $username;
                $_SESSION['email']    = $email;

                respondJson([
                    'success' => true,
                    'user' => [
                        'id'       => $id,
                        'username' => $username,
                        'email'    => $email,
                    ]
                ]);
            }
            respondJson(['success' => false, 'message' => 'Invalid password.']);
        }
    }

    respondJson(['success' => false, 'message' => 'Account not found.']);
}

// ---------- LOGOUT ----------
if ($method === 'POST' && $action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']
        );
    }
    session_destroy();
    respondJson(['success' => true]);
}

// ---------- SAVE PREDICTION ----------
if ($method === 'POST' && $action === 'save_prediction') {
    if (empty($_SESSION['user_id'])) {
        respondJson(['success' => false, 'message' => 'Not logged in.']);
    }
    $userId = (int)$_SESSION['user_id'];

    $prediction = $jsonBody['prediction'] ?? null;
    if (!$prediction || !is_array($prediction)) {
        respondJson(['success' => false, 'message' => 'Invalid prediction payload.']);
    }

    $league    = (string)($prediction['league'] ?? '');
    $fixtureId = (string)($prediction['fixtureId'] ?? '');
    $matchday  = (string)($prediction['matchday'] ?? '');

    $home      = $prediction['home'] ?? [];
    $away      = $prediction['away'] ?? [];

    $homeId    = (string)($home['id'] ?? '');
    $homeName  = (string)($home['name'] ?? '');
    $homeScore = $home['score'] === null ? '' : (string)($home['score'] ?? '');

    $awayId    = (string)($away['id'] ?? '');
    $awayName  = (string)($away['name'] ?? '');
    $awayScore = $away['score'] === null ? '' : (string)($away['score'] ?? '');

    $timestamp = (string)($prediction['timestamp'] ?? date('c'));

    $xml = loadPredictionsXml();

    // update existing prediction for same user+league+fixture if it exists
    $target = null;
    foreach ($xml->prediction as $node) {
        if ((int)$node->user_id === $userId &&
            (string)$node->league === $league &&
            (string)$node->fixture_id === $fixtureId) {
            $target = $node;
            break;
        }
    }

    if ($target === null) {
        $target = $xml->addChild('prediction');
    }

    $target->user_id    = $userId;
    $target->league     = $league;
    $target->fixture_id = $fixtureId;
    $target->matchday   = $matchday;

    $target->home_id    = $homeId;
    $target->home_name  = $homeName;
    $target->home_score = $homeScore;

    $target->away_id    = $awayId;
    $target->away_name  = $awayName;
    $target->away_score = $awayScore;

    $target->timestamp  = $timestamp;

    savePredictionsXml($xml);

    respondJson(['success' => true]);
}

// ---------- GET MY PREDICTIONS ----------
if ($method === 'GET' && $action === 'get_my_predictions') {
    if (empty($_SESSION['user_id'])) {
        respondJson(['success' => true, 'predictions' => []]);
    }
    $userId = (int)$_SESSION['user_id'];

    $xml = loadPredictionsXml();
    $out = [];

    foreach ($xml->prediction as $p) {
        if ((int)$p->user_id !== $userId) continue;

        $recordLeague = (string)$p->league;

        $out[] = [
            'league'    => $recordLeague,
            'fixtureId' => (string)$p->fixture_id,
            'matchday'  => (string)$p->matchday,
            'home'      => [
                'id'    => (string)$p->home_id,
                'name'  => (string)$p->home_name,
                'score' => ((string)$p->home_score === '' ? null : (int)$p->home_score),
            ],
            'away'      => [
                'id'    => (string)$p->away_id,
                'name'  => (string)$p->away_name,
                'score' => ((string)$p->away_score === '' ? null : (int)$p->away_score),
            ],
            'timestamp' => (string)$p->timestamp,
        ];
    }

    respondJson(['success' => true, 'predictions' => $out]);
}

// ---------- GOOGLE LOGIN DISABLED ----------
if ($action === 'google_login' || $action === 'google_callback') {
    respondJson([
        'success' => false,
        'message' => 'Google login is currently disabled on the server.',
    ]);
}

// ---------- DEFAULT ----------
respondJson([
    'success' => false,
    'message' => 'Unknown or unsupported action.',
    'action'  => $action,
]);


