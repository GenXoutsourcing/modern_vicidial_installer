<?php
/**
 * GenX API - replacement for the legacy VICIdial API files.
 *
 * The stock /agc/api.php, /vicidial/non_agent_api.php and /vicidial/qc_api.php
 * are blocked at the web server (genx-block-legacy-api.conf). This is the
 * GenX-owned replacement: same call convention (user/pass/function/source as
 * GET or POST) so existing client code adapts with only a URL change, but
 * access is gated to the configured API user group and every call is logged.
 *
 * v1 exposes read functions only. Write functions (add_lead, update_lead,
 * etc.) are deliberately not implemented yet: doing them correctly requires
 * GMT/call-time handling that has legal-calling-hour implications, so they get
 * their own reviewed pass. Unknown/unimplemented functions return an explicit
 * error rather than silently doing nothing.
 */

header('Content-Type: text/plain; charset=utf-8');

$GENX_API_VERSION = '1.0.0';
$CONF_FILE = '/etc/astguiclient.conf';

/* ---- config -------------------------------------------------------------- */
function conf_val($key) {
    static $cache = null;
    global $CONF_FILE;
    if ($cache === null) {
        $cache = array();
        if (is_readable($CONF_FILE)) {
            foreach (file($CONF_FILE) as $line) {
                if (preg_match('/^(VAR\w+)\s*=>\s*(.*?)\s*$/', $line, $m)) {
                    $cache[$m[1]] = $m[2];
                }
            }
        }
    }
    return isset($cache[$key]) ? $cache[$key] : '';
}

/* ---- request params (GET or POST) ---------------------------------------- */
function param($key, $default = '') {
    if (isset($_POST[$key])) return trim($_POST[$key]);
    if (isset($_GET[$key]))  return trim($_GET[$key]);
    return $default;
}

$user     = param('user');
$pass     = param('pass');
$function = param('function');
$source   = substr(param('source', 'genxapi'), 0, 20);

/* ---- DB connect ---------------------------------------------------------- */
$db_host = conf_val('VARDB_server')   ?: 'localhost';
$db_name = conf_val('VARDB_database') ?: 'asterisk';
$db_user = conf_val('VARDB_user')     ?: 'cron';
$db_pass = conf_val('VARDB_pass');
$db_port = (int)(conf_val('VARDB_port') ?: 3306);

$mysqli = @new mysqli($db_host, $db_user, $db_pass, $db_name, $db_port);
if ($mysqli->connect_errno) {
    http_response_code(503);
    echo "ERROR: database unavailable\n";
    exit;
}
$mysqli->set_charset('utf8mb4');

/* ---- helpers ------------------------------------------------------------- */
function password_matches($input, $stored) {
    // Mirrors the GenX Node passwordMatches(): auto-detect md5/sha1/sha256,
    // else compare plaintext. hash_equals for constant-time compare.
    if ($stored === null || $stored === '') return false;
    $input = (string)$input;
    $stored = (string)$stored;
    if (preg_match('/^[a-f0-9]{32}$/i', $stored)) return hash_equals(strtolower($stored), md5($input));
    if (preg_match('/^[a-f0-9]{40}$/i', $stored)) return hash_equals(strtolower($stored), sha1($input));
    if (preg_match('/^[a-f0-9]{64}$/i', $stored)) return hash_equals(strtolower($stored), hash('sha256', $input));
    return hash_equals($stored, $input);
}

function api_group($mysqli) {
    $g = 'APIUSERS';
    if ($stmt = $mysqli->prepare("SELECT perm_value FROM genx_group_permissions WHERE user_group='__GENX__' AND permission='api_user_group' LIMIT 1")) {
        $stmt->execute();
        $stmt->bind_result($v);
        if ($stmt->fetch() && trim((string)$v) !== '') $g = trim($v);
        $stmt->close();
    }
    return $g;
}

function log_api($mysqli, $user, $function, $result, $reason, $source) {
    $url = ($_SERVER['REQUEST_URI'] ?? '/genxapi/api.php');
    $web = ($_SERVER['HTTP_HOST'] ?? gethostname());
    if ($stmt = $mysqli->prepare(
        "INSERT INTO vicidial_api_log (user, api_date, api_script, function, result, result_reason, source, webserver, api_url)
         VALUES (?, NOW(), 'genxapi', ?, ?, ?, ?, ?, ?)")) {
        $stmt->bind_param('sssssss', $user, $function, $result, $reason, $source, $web, $url);
        @$stmt->execute();
        $stmt->close();
    }
}

function fail($mysqli, $user, $function, $reason, $source, $code = 403) {
    http_response_code($code);
    log_api($mysqli, $user, $function, 'ERROR', $reason, $source);
    echo "ERROR: $reason\n";
    exit;
}

/* ---- authentication + API-group gate ------------------------------------- */
if ($user === '' || $pass === '' || $function === '') {
    fail($mysqli, $user, $function, 'user, pass and function are required', $source, 400);
}

$apiGroup = api_group($mysqli);

$stmt = $mysqli->prepare(
    "SELECT user_group, active, `pass`, pass_hash, user_level, api_allowed_functions
       FROM vicidial_users WHERE user = ? LIMIT 1");
$stmt->bind_param('s', $user);
$stmt->execute();
$stmt->bind_result($u_group, $u_active, $u_pass, $u_pass_hash, $u_level, $u_allowed);
$found = $stmt->fetch();
$stmt->close();

if (!$found)                       fail($mysqli, $user, $function, 'invalid credentials', $source);
if ($u_active !== 'Y')             fail($mysqli, $user, $function, 'user not active', $source);
if ($u_group !== $apiGroup)        fail($mysqli, $user, $function, 'user not in API group', $source);

$pw_ok = password_matches($pass, $u_pass);
if (!$pw_ok && $u_pass_hash)       $pw_ok = password_matches($pass, $u_pass_hash);
if (!$pw_ok)                       fail($mysqli, $user, $function, 'invalid credentials', $source);

// api_allowed_functions gate: '' = blocked, 'ALL_FUNCTIONS' = any, else CSV.
$allowed = trim((string)$u_allowed);
if ($allowed === '')               fail($mysqli, $user, $function, 'API access disabled for this user', $source);
if (strtoupper($allowed) !== 'ALL_FUNCTIONS') {
    $list = array_map('trim', explode(',', strtolower($allowed)));
    if (!in_array(strtolower($function), $list, true)) {
        fail($mysqli, $user, $function, 'function not permitted for this user', $source);
    }
}

/* ---- function dispatch (read-only in v1) --------------------------------- */
function ok($mysqli, $user, $function, $source, $body) {
    log_api($mysqli, $user, $function, 'SUCCESS', '', $source);
    echo "SUCCESS: $function\n";
    echo $body;
    exit;
}

switch (strtolower($function)) {

    case 'version':
        global $GENX_API_VERSION;
        ok($mysqli, $user, $function, $source, "genx_api_version|$GENX_API_VERSION\n");
        break;

    case 'agent_status': {
        // Live agents with status, campaign and current call seconds.
        $rows = "";
        $res = $mysqli->query(
            "SELECT user, campaign_id, status, calls_today, server_ip
               FROM vicidial_live_agents ORDER BY user ASC LIMIT 2000");
        $n = 0;
        while ($res && ($r = $res->fetch_assoc())) {
            $rows .= sprintf("%s|%s|%s|%s|%s\n",
                $r['user'], $r['campaign_id'], $r['status'], $r['calls_today'], $r['server_ip']);
            $n++;
        }
        ok($mysqli, $user, $function, $source, "count|$n\nuser|campaign|status|calls_today|server_ip\n$rows");
        break;
    }

    case 'campaigns_list': {
        $rows = "";
        $res = $mysqli->query(
            "SELECT campaign_id, campaign_name, active, dial_method
               FROM vicidial_campaigns ORDER BY active DESC, campaign_id ASC LIMIT 1000");
        $n = 0;
        while ($res && ($r = $res->fetch_assoc())) {
            $rows .= sprintf("%s|%s|%s|%s\n",
                $r['campaign_id'], $r['campaign_name'], $r['active'], $r['dial_method']);
            $n++;
        }
        ok($mysqli, $user, $function, $source, "count|$n\ncampaign_id|campaign_name|active|dial_method\n$rows");
        break;
    }

    case 'lists_list': {
        $rows = "";
        $res = $mysqli->query(
            "SELECT list_id, list_name, campaign_id, active
               FROM vicidial_lists ORDER BY list_id ASC LIMIT 2000");
        $n = 0;
        while ($res && ($r = $res->fetch_assoc())) {
            $rows .= sprintf("%s|%s|%s|%s\n",
                $r['list_id'], $r['list_name'], $r['campaign_id'], $r['active']);
            $n++;
        }
        ok($mysqli, $user, $function, $source, "count|$n\nlist_id|list_name|campaign_id|active\n$rows");
        break;
    }

    case 'lead_status_count': {
        // Optional list_id filter; otherwise system-wide status rollup.
        $listId = preg_replace('/[^0-9]/', '', param('list_id'));
        $rows = "";
        if ($listId !== '') {
            $stmt = $mysqli->prepare(
                "SELECT status, COUNT(*) c FROM vicidial_list WHERE list_id = ? GROUP BY status ORDER BY c DESC");
            $stmt->bind_param('s', $listId);
            $stmt->execute();
            $res = $stmt->get_result();
        } else {
            $res = $mysqli->query(
                "SELECT status, COUNT(*) c FROM vicidial_list GROUP BY status ORDER BY c DESC LIMIT 200");
        }
        $n = 0;
        while ($res && ($r = $res->fetch_assoc())) {
            $rows .= sprintf("%s|%s\n", $r['status'], $r['c']);
            $n++;
        }
        ok($mysqli, $user, $function, $source, "count|$n\nstatus|leads\n$rows");
        break;
    }

    default:
        fail($mysqli, $user, $function, 'function not implemented in GenX API v1', $source, 400);
}
