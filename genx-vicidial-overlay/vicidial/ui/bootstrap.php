<?php
/*
 * VICIdial UI overlay.
 * No core file edits. Loaded only through .user.ini auto_prepend_file.
 */

if (PHP_SAPI === 'cli') {
    return;
}

// Default the realtime report to HTML display for normal browser page loads.
// This runs before stock VICIdial renders, while still leaving background
// refreshes/API-like requests alone.
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
$isRealtimeReport = (strcasecmp(basename($uriPath), 'realtime_report.php') === 0);
$isGet = (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET');
$accept = strtolower($_SERVER['HTTP_ACCEPT'] ?? '');
$requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
$fetchDest = strtolower($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '');
$isDocumentRequest = (
    $accept === '' ||
    strpos($accept, 'text/html') !== false
) && (
    $fetchDest === '' ||
    $fetchDest === 'document' ||
    $fetchDest === 'iframe'
) && strcasecmp($requestedWith, 'XMLHttpRequest') !== 0;

if ($isRealtimeReport && $isGet && $isDocumentRequest && empty($_GET['report_display_type'])) {
    $query = $_GET;
    $query['report_display_type'] = 'HTML';
    $target = $uriPath . '?' . http_build_query($query);
    header('Location: ' . $target, true, 302);
    exit;
}

require_once __DIR__ . '/Transformer.php';

ob_start(function ($html) {
    return ViciUI\Transformer::handle($html);
});
