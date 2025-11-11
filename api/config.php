<?php


window.FBL_CFG = window.FBL_CFG || {};
window.FBL_CFG.API_BASE = "http://localhost:8080";  // PHP/Apache


// OR: if PHP runs on a different port, e.g. 8000:
window.FBL_API_BASE = "";
window.FBL_GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

// api/config.php
// --- change these ---
const SESSION_SECRET     = 'replace-with-a-long-random-secret';
const GOOGLE_CLIENT_ID   = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com' ;

// Where to store your data
const USERS_XML_PATH       = __DIR__ . '/../data/users.xml';
const PREDICTIONS_XML_PATH = __DIR__ . '/../data/predictions.xml';

// Helpers
function now_iso() { return gmdate('c'); }

function read_xml($path, $rootTag) {
  if (!file_exists($path)) {
    $xml = new SimpleXMLElement("<{$rootTag}></{$rootTag}>");
    $xml->asXML($path);
    return $xml;
  }
  return simplexml_load_file($path);
}

function save_xml($xml, $path) {
  $tmp = $path . '.tmp';
  $xml->asXML($tmp);
  rename($tmp, $path);
}
?>