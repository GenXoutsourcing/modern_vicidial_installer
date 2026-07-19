<?php
// GenX load-test URL sink (TEMPORARY). Deployed to /var/www/html/genxapi/sink.php
// by tools/loadtest setup; removed by teardown.sh.
//
// Receives the LOADTEST campaign's start_call_url / dispo_call_url (fired by
// the genx-ui server) and na_call_url (fired by the dialer's AST_send_URL.pl
// from the telephony boxes), and appends one JSON line per hit so fired-vs-
// expected counts can be reconciled after a run.
$dir = '/var/log/genx-loadtest';
if (!is_dir($dir)) { @mkdir($dir, 0775, true); }
$line = json_encode([
    'ts'   => date('Y-m-d H:i:s'),
    'type' => isset($_GET['type']) ? $_GET['type'] : '',
    'q'    => $_GET,
    'ip'   => isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '',
]);
@file_put_contents($dir . '/sink.log', $line . "\n", FILE_APPEND | LOCK_EX);
header('Content-Type: text/plain');
echo "OK";
