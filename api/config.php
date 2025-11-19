<?php
declare(strict_types=1);

/**
 * FansBetLiga backend config (PHP only)
 * Used by /api/users.php
 */

define('USERS_XML_PATH',       __DIR__ . '/../data/users.xml');
define('PREDICTIONS_XML_PATH', __DIR__ . '/../data/predictions.xml');

// Change this to a LONG random secret and keep it private
define('SESSION_SECRET', 'REPLACE_WITH_A_LONG_RANDOM_SECRET_6b8f0d3b9e2a4f...');

// Your Google OAuth Client ID (from Google Cloud Console)
define('GOOGLE_CLIENT_ID', '80010607738-2rv8rb19g5geecp15rd8mo0gjbs35oq2.apps.googleusercontent.com');

// Optional: ensure consistent timestamps
date_default_timezone_set('UTC');
