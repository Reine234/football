<?php
// /api/users.php
declare(strict_types=1);

// ---------- Headers / CORS ----------
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Pragma: no-cache');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Access-Control-Allow-Credentials: true);
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ---------- Optional config ----------
$cfg = __DIR__ . '/config.php';
if (file_exists($cfg)) require_once $cfg;

// Fallbacks if not defined in config.php
if (!defined('USERS_XML_PATH'))        define('USERS_XML_PATH',        __DIR__ . '/../data/users.xml');
if (!defined('PREDICTIONS_XML_PATH'))  define('PREDICTIONS_XML_PATH',  __DIR__ . '/../data/predictions.xml');
if (!defined('SESSION_SECRET'))        define('SESSION_SECRET',        'PLEASE_CHANGE_ME_TO_A_LONG_RANDOM_SECRET');
if (!defined('GOOGLE_CLIENT_ID'))      define('GOOGLE_CLIENT_ID',      'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com');

// ---------- Small helpers (only define if missing) ----------
if (!function_exists('now_iso')) {
  function now_iso(): string { return gmdate('c'); }
}
if (!function_exists('read_xml')) {
  function read_xml(string $path, string $rootTag = 'root'): SimpleXMLElement {
    if (!file_exists($path)) {
      $xml = new SimpleXMLElement("<{$rootTag}/>");
      $xml->asXML($path);
    }
    $xml = simplexml_load_file($path);
    if ($xml === false) {
      // recreate if corrupted
      $xml = new SimpleXMLElement("<{$rootTag}/>");
      $xml->asXML($path);
    }
    return $xml;
  }
}
if (!function_exists('save_xml')) {
  function save_xml(SimpleXMLElement $xml, string $path): void {
    $tmp = $path . '.tmp';
    $xml->asXML($tmp);
    rename($tmp, $path);
  }
}

// ---------- Session (cookie) ----------
function b64(string $s){ return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64d(string $s){ return base64_decode(strtr($s, '-_', '+/')); }

function sign_session(string $userId, int $ttlSec = 2592000): string { // 30 days
  $payload = json_encode(['uid'=>$userId,'exp'=>time()+$ttlSec], JSON_UNESCAPED_SLASHES);
  $sig = hash_hmac('sha256', $payload, SESSION_SECRET, true);
  return b64($payload) . '.' . b64($sig);
}
function verify_session(?string $cookie): ?string {
  if (!$cookie || strpos($cookie, '.') === false) return null;
  [$p64,$s64] = explode('.', $cookie, 2);
  $payload = b64d($p64); $sig = b64d($s64);
  $calc = hash_hmac('sha256', $payload, SESSION_SECRET, true);
  if (!hash_equals($calc, $sig)) return null;
  $data = json_decode($payload, true);
  if (!$data || empty($data['uid']) || empty($data['exp']) || $data['exp'] < time()) return null;
  return $data['uid'];
}
function set_session_cookie(string $userId): void {
  $tok = sign_session($userId);
  setcookie('fbl_sid', $tok, [
    'expires'  => time()+60*60*24*30,
    'path'     => '/',
    'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on'),
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
}
function clear_session_cookie(): void {
  setcookie('fbl_sid', '', [
    'expires'  => time()-3600,
    'path'     => '/',
    'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on'),
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
}

// ---------- Users.xml helpers ----------
function find_user_by_email(SimpleXMLElement $xml, string $email): ?SimpleXMLElement {
  foreach ($xml->user as $u) {
    if (strcasecmp((string)$u->email, $email) === 0) return $u;
  }
  return null;
}
function find_user_by_name(SimpleXMLElement $xml, string $name): ?SimpleXMLElement {
  foreach ($xml->user as $u) {
    if (strcasecmp((string)$u->name, $name) === 0) return $u;
  }
  return null;
}
function find_user_by_google_sub(SimpleXMLElement $xml, string $sub): ?SimpleXMLElement {
  foreach ($xml->user as $u) {
    if ((string)$u->googleSub === $sub) return $u;
  }
  return null;
}
function add_user(SimpleXMLElement $xml, array $data): SimpleXMLElement {
  $u = $xml->addChild('user');
  $u->addAttribute('id', $data['id']);
  $u->addChild('email', $data['email']);
  $u->addChild('name',  $data['name']);
  $u->addChild('passwordHash', $data['passwordHash'] ?? '');
  $u->addChild('provider', $data['provider'] ?? 'local');
  $u->addChild('googleSub', $data['googleSub'] ?? '');
  $u->addChild('createdAt', now_iso());
  return $u;
}

// ---------- Predictions.xml helpers ----------
function save_prediction_xml(string $userId, array $pred): void {
  $xml = read_xml(PREDICTIONS_XML_PATH, 'predictions');
  $p = $xml->addChild('prediction');
  $p->addAttribute('userId', $userId);
  $p->addChild('league', htmlspecialchars((string)($pred['league'] ?? ''), ENT_QUOTES));
  $p->addChild('fixtureId', (string)($pred['fixtureId'] ?? ''));
  $p->addChild('matchday', htmlspecialchars((string)($pred['matchday'] ?? ''), ENT_QUOTES));
  $home = $p->addChild('home');
  $home->addChild('id', (string)($pred['home']['id'] ?? ''));
  $home->addChild('name', htmlspecialchars((string)($pred['home']['name'] ?? ''), ENT_QUOTES));
  $home->addChild('score', (string)($pred['home']['score'] ?? ''));
  $away = $p->addChild('away');
  $away->addChild('id', (string)($pred['away']['id'] ?? ''));
  $away->addChild('name', htmlspecialchars((string)($pred['away']['name'] ?? ''), ENT_QUOTES));
  $away->addChild('score', (string)($pred['away']['score'] ?? ''));
  $p->addChild('timestamp', now_iso());
  save_xml($xml, PREDICTIONS_XML_PATH);
}
function load_my_predictions_xml(string $userId): array {
  $xml = read_xml(PREDICTIONS_XML_PATH, 'predictions');
  $out = [];
  foreach ($xml->prediction as $p) {
    if ((string)$p['userId'] !== $userId) continue;
    $out[] = [
      'league'   => (string)$p->league,
      'fixtureId'=> (string)$p->fixtureId,
      'matchday' => (string)$p->matchday,
      'home'     => ['id'=>(string)$p->home->id, 'name'=>(string)$p->home->name, 'score'=>(int)$p->home->score],
      'away'     => ['id'=>(string)$p->away->id, 'name'=>(string)$p->away->name, 'score'=>(int)$p->away->score],
      'timestamp'=> (string)$p->timestamp,
    ];
  }
  return $out;
}

// ---------- Input / Session ----------
$raw = file_get_contents('php://input');
$body = json_decode($raw, true) ?: [];
$action = $_GET['action'] ?? ($body['action'] ?? '');
$sessionUserId = verify_session($_COOKIE['fbl_sid'] ?? null);

// ---------- Actions ----------
try {
  // Check current session
  if ($action === 'session') {
    if (!$sessionUserId) { echo json_encode(['success'=>false]); exit; }
    $uxml = read_xml(USERS_XML_PATH, 'users');
    $me = null;
    foreach ($uxml->user as $u) if ((string)$u['id'] === $sessionUserId) { $me = $u; break; }
    if (!$me) { echo json_encode(['success'=>false]); exit; }
    echo json_encode(['success'=>true,'user'=>[
      'id'=>(string)$me['id'],
      'email'=>(string)$me->email,
      'name'=>(string)$me->name,
      'provider'=>(string)$me->provider
    ]]); exit;
  }

  // Logout
  if ($action === 'logout') {
    clear_session_cookie();
    echo json_encode(['success'=>true]); exit;
  }

  // Signup (accepts name or username)
  if ($action === 'signup') {
    $name  = trim((string)($body['name'] ?? $body['username'] ?? ''));
    $email = trim((string)($body['email'] ?? ''));
    $pass  = (string)($body['password'] ?? '');
    if (!$name || !$email || !$pass) throw new Exception('Missing fields');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new Exception('Invalid email');

    $uxml = read_xml(USERS_XML_PATH, 'users');
    if (find_user_by_email($uxml, $email)) throw new Exception('Email already exists');

    $userId = 'u-'.bin2hex(random_bytes(8));
    $hash   = password_hash($pass, PASSWORD_DEFAULT);
    add_user($uxml, [
      'id'=>$userId, 'email'=>strtolower($email), 'name'=>$name,
      'passwordHash'=>$hash, 'provider'=>'local'
    ]);
    save_xml($uxml, USERS_XML_PATH);

    set_session_cookie($userId);
    echo json_encode(['success'=>true, 'userId'=>$userId]); exit;
  }

  // Signin/Login (accepts 'signin' or 'login'; username can be email or name)
  if ($action === 'signin' || $action === 'login') {
    $username = trim((string)($body['username'] ?? $body['email'] ?? ''));
    $pass     = (string)($body['password'] ?? '');
    if (!$username || !$pass) throw new Exception('Missing fields');

    $uxml = read_xml(USERS_XML_PATH, 'users');
    $u = (strpos($username,'@') !== false)
      ? find_user_by_email($uxml, strtolower($username))
      : find_user_by_name($uxml, $username);

    if (!$u) throw new Exception('User not found');
    if ((string)$u->provider !== 'local') throw new Exception('Use Google sign-in for this account');

    $hash = (string)$u->passwordHash;
    if (!password_verify($pass, $hash)) throw new Exception('Wrong password');

    set_session_cookie((string)$u['id']);
    echo json_encode(['success'=>true]); exit;
  }

  // Google sign-in (accepts 'google_signin' or 'google_login'; param 'id_token' or 'credential')
  if ($action === 'google_signin' || $action === 'google_login') {
    $idToken = (string)($body['id_token'] ?? $body['credential'] ?? '');
    if (!$idToken) throw new Exception('Missing id_token');

    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken);
    $resp = @file_get_contents($url);
    if (!$resp) throw new Exception('Google verify failed');
    $data = json_decode($resp, true) ?: [];

    if (($data['aud'] ?? '') !== GOOGLE_CLIENT_ID) throw new Exception('Audience mismatch');
    if (($data['exp'] ?? 0) < time()) throw new Exception('Token expired');
    if (($data['email_verified'] ?? 'true') !== 'true' && ($data['email_verified'] ?? true) !== true) {
      throw new Exception('Email not verified');
    }

    $email = strtolower((string)($data['email'] ?? ''));
    $name  = (string)($data['name']  ?? ($data['given_name'] ?? 'User'));
    $sub   = (string)($data['sub']   ?? '');

    if (!$email || !$sub) throw new Exception('Invalid Google payload');

    $uxml = read_xml(USERS_XML_PATH, 'users');
    $u = find_user_by_google_sub($uxml, $sub);
    if (!$u) {
      $existing = find_user_by_email($uxml, $email);
      if ($existing) {
        $existing->provider  = 'google';
        $existing->googleSub = $sub;
        $u = $existing;
      } else {
        $userId = 'u-'.bin2hex(random_bytes(8));
        $u = add_user($uxml, [
          'id'=>$userId, 'email'=>$email, 'name'=>$name,
          'passwordHash'=>'', 'provider'=>'google', 'googleSub'=>$sub
        ]);
      }
      save_xml($uxml, USERS_XML_PATH);
    }

    set_session_cookie((string)$u['id']);
    echo json_encode(['success'=>true]); exit;
  }

  // Save prediction (requires session)
  if ($action === 'save_prediction') {
    if (!$sessionUserId) { http_response_code(401); echo json_encode(['success'=>false,'message'=>'unauthorized']); exit; }
    $pred = $body['prediction'] ?? null;
    if (!$pred) throw new Exception('Missing prediction');
    save_prediction_xml($sessionUserId, $pred);
    echo json_encode(['success'=>true]); exit;
  }

  // Get my predictions (requires session)
  if ($action === 'get_my_predictions') {
    if (!$sessionUserId) { http_response_code(401); echo json_encode(['success'=>false,'message'=>'unauthorized']); exit; }
    $preds = load_my_predictions_xml($sessionUserId);
    echo json_encode(['success'=>true,'predictions'=>$preds]); exit;
  }

  throw new Exception('Unknown action');
} catch (Exception $e) {
  http_response_code(400);
  echo json_encode(['success'=>false,'message'=>$e->getMessage()]);
}
?>