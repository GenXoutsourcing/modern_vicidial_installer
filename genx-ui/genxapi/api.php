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
 * Exposes read functions AND a reviewed set of write functions (add_lead,
 * update_lead, dnc_add) — the writes include the GMT/call-time handling
 * (resolve_gmt) that legal calling hours require. Anyone auditing or
 * firewalling this endpoint must treat it as a mutation surface, not
 * read-only. Unknown/unimplemented functions return an explicit error
 * rather than silently doing nothing.
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
$api_key  = param('api_key');
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
    // Log the path only, never the query string - it can carry api_key/pass
    // when the caller authenticates via GET, and this row persists in the DB.
    $url = strtok((string)($_SERVER['REQUEST_URI'] ?? '/genxapi/api.php'), '?');
    $web = ($_SERVER['HTTP_HOST'] ?? gethostname());
    if ($stmt = $mysqli->prepare(
        "INSERT INTO vicidial_api_log (user, api_date, api_script, function, result, result_reason, source, webserver, api_url)
         VALUES (?, NOW(), 'genxapi', ?, ?, ?, ?, ?, ?)")) {
        $stmt->bind_param('sssssss', $user, $function, $result, $reason, $source, $web, $url);
        @$stmt->execute();
        $stmt->close();
    }
}

// Resolve gmt_offset_now by reusing VICIdial's own lookup_gmt() from
// functions.php (DST-aware, DB-table driven) rather than reimplementing the
// timezone logic. Getting this wrong shifts a lead's callable window, so we
// use the exact resolver the dialer uses. Returns the offset, or the caller's
// explicit override when provided.
function resolve_gmt($mysqli, $phone_code, $phone_number, $state, $postal_code, $tz_method) {
    // Standard (non-DST) server offset from the servers table, +1 if the
    // server is currently observing DST - mirrors non_agent_api.php.
    $std = 0.0;
    if ($res = $mysqli->query("SELECT local_gmt FROM servers WHERE active='Y' LIMIT 1")) {
        if ($row = $res->fetch_row()) $std = (float)$row[0];
    }
    if (date('I')) $std += 1;

    $digits = preg_replace('/\D/', '', $phone_number);
    $USarea = ($phone_code === '1' && strlen($digits) >= 10) ? substr($digits, 0, 3) : '';
    $USprefix = ($phone_code === '1' && strlen($digits) >= 10) ? substr($digits, 3, 3) : '';

    // functions.php is a pure library (no top-level side effects) and defines
    // mysql_to_mysqli itself; lookup_gmt reads $link/$DB/$DBX/$tz_method from
    // globals. Suppress legacy deprecation noise so it can't pollute output.
    $GLOBALS['link'] = $mysqli;
    $GLOBALS['DB'] = 0; $GLOBALS['DBX'] = 0;
    $GLOBALS['tz_method'] = ($tz_method !== '') ? $tz_method : 'AREACODE';
    $prev = error_reporting(E_ERROR | E_PARSE);
    require_once('/var/www/html/vicidial/functions.php');
    $gmt = lookup_gmt($phone_code, $USarea, $state, $std,
        date('H'), date('i'), date('s'), date('n'), date('j'), date('Y'),
        '', $postal_code, '', $USprefix);
    error_reporting($prev);
    return $gmt;
}

function fail($mysqli, $user, $function, $reason, $source, $code = 403) {
    http_response_code($code);
    log_api($mysqli, $user, $function, 'ERROR', $reason, $source);
    echo "ERROR: $reason\n";
    exit;
}

/* ---- authentication + API-group gate ------------------------------------- */
// Two auth modes: an API key (preferred for integrations - no password on the
// wire, revocable per-key) or legacy-style user + pass. Either resolves to a
// vicidial_users row that must be active and in the API group.
if ($function === '') {
    fail($mysqli, $user, $function, 'function is required', $source, 400);
}

$apiGroup = api_group($mysqli);

if ($api_key !== '') {
    // Key auth: sha256(key) is stored, never the raw key. Resolve to a user.
    $key_hash = hash('sha256', $api_key);
    $stmt = $mysqli->prepare(
        "SELECT user FROM genx_api_keys WHERE key_hash = ? AND active = 'Y' LIMIT 1");
    $stmt->bind_param('s', $key_hash);
    $stmt->execute();
    $stmt->bind_result($k_user);
    $key_ok = $stmt->fetch();
    $stmt->close();
    if (!$key_ok) fail($mysqli, $user, $function, 'invalid api key', $source);
    $user = $k_user;
    @$mysqli->query("UPDATE genx_api_keys SET last_used = NOW() WHERE key_hash = '"
        . $mysqli->real_escape_string($key_hash) . "'");
} elseif ($user === '' || $pass === '') {
    fail($mysqli, $user, $function, 'api_key, or user and pass, are required', $source, 400);
}

$stmt = $mysqli->prepare(
    "SELECT user_group, active, `pass`, pass_hash, user_level, api_allowed_functions
       FROM vicidial_users WHERE user = ? LIMIT 1");
$stmt->bind_param('s', $user);
$stmt->execute();
$stmt->bind_result($u_group, $u_active, $u_pass, $u_pass_hash, $u_level, $u_allowed);
$found = $stmt->fetch();
$stmt->close();

if (!$found)                       fail($mysqli, $user, $function, 'invalid credentials', $source);

// In user/pass mode the password is verified BEFORE any account-state error
// is returned: distinct 'not active' / 'not in API group' messages ahead of
// the password check let an unauthenticated caller map which usernames exist
// and are API-enabled. Key auth already proved identity above.
if ($api_key === '') {
    $pw_ok = password_matches($pass, $u_pass);
    if (!$pw_ok && $u_pass_hash)   $pw_ok = password_matches($pass, $u_pass_hash);
    if (!$pw_ok)                   fail($mysqli, $user, $function, 'invalid credentials', $source);
}
if ($u_active !== 'Y')             fail($mysqli, $user, $function, 'user not active', $source);
if ($u_group !== $apiGroup)        fail($mysqli, $user, $function, 'user not in API group', $source);

// api_allowed_functions gate: '' = blocked, 'ALL_FUNCTIONS' = any, else CSV.
$allowed = trim((string)$u_allowed);
if ($allowed === '')               fail($mysqli, $user, $function, 'API access disabled for this user', $source);
if (strtoupper($allowed) !== 'ALL_FUNCTIONS') {
    $list = array_map('trim', explode(',', strtolower($allowed)));
    if (!in_array(strtolower($function), $list, true)) {
        fail($mysqli, $user, $function, 'function not permitted for this user', $source);
    }
}

/* ---- function dispatch (reads + reviewed writes) -------------------------- */
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

    case 'add_lead': {
        // Required.
        $phone_number = preg_replace('/\D/', '', param('phone_number'));
        $list_id      = preg_replace('/\D/', '', param('list_id'));
        if ($phone_number === '' || strlen($phone_number) < 6) fail($mysqli, $user, $function, 'phone_number required', $source, 400);
        if ($list_id === '') fail($mysqli, $user, $function, 'list_id required', $source, 400);

        // List must exist; grab its campaign for duplicate scoping.
        $stmt = $mysqli->prepare("SELECT campaign_id FROM vicidial_lists WHERE list_id = ? LIMIT 1");
        $stmt->bind_param('s', $list_id);
        $stmt->execute();
        $stmt->bind_result($campaign_id);
        if (!$stmt->fetch()) { $stmt->close(); fail($mysqli, $user, $function, 'list_id does not exist', $source, 400); }
        $stmt->close();

        // Optional fields.
        $phone_code   = preg_replace('/\D/', '', param('phone_code')) ?: '1';
        $vendor       = param('vendor_lead_code');
        $source_id    = param('source_id');
        $title        = param('title');
        $first_name   = param('first_name');
        $mi           = param('middle_initial');
        $last_name    = param('last_name');
        $address1     = param('address1');
        $address2     = param('address2');
        $address3     = param('address3');
        $city         = param('city');
        $state        = strtoupper(substr(param('state'), 0, 2));
        $province     = param('province');
        $postal_code  = param('postal_code');
        $country_code = param('country_code');
        $gender       = param('gender');
        $dob          = param('date_of_birth');
        $alt_phone    = preg_replace('/\D/', '', param('alt_phone'));
        $email        = param('email');
        $security     = param('security_phrase');
        $comments     = param('comments');
        $rank         = preg_replace('/\D/', '', param('rank')) ?: '0';
        $owner        = param('owner');
        $entry_list   = preg_replace('/\D/', '', param('entry_list_id'));
        $dup_check    = strtoupper(param('duplicate_check'));

        // Duplicate check (default: none, matching legacy). DUPLIST = same
        // list, DUPCAMP = same campaign, DUPSYS = entire system.
        if (in_array($dup_check, array('DUPLIST', 'DUPCAMP', 'DUPSYS'), true)) {
            if ($dup_check === 'DUPLIST') {
                $q = $mysqli->prepare("SELECT lead_id FROM vicidial_list WHERE phone_number = ? AND list_id = ? LIMIT 1");
                $q->bind_param('ss', $phone_number, $list_id);
            } elseif ($dup_check === 'DUPCAMP') {
                $q = $mysqli->prepare("SELECT vl.lead_id FROM vicidial_list vl JOIN vicidial_lists vls ON vl.list_id = vls.list_id WHERE vl.phone_number = ? AND vls.campaign_id = ? LIMIT 1");
                $q->bind_param('ss', $phone_number, $campaign_id);
            } else {
                $q = $mysqli->prepare("SELECT lead_id FROM vicidial_list WHERE phone_number = ? LIMIT 1");
                $q->bind_param('s', $phone_number);
            }
            $q->execute();
            $q->bind_result($dup_lead);
            $is_dup = $q->fetch();
            $q->close();
            if ($is_dup) fail($mysqli, $user, $function, "duplicate phone_number ($dup_check) lead_id $dup_lead", $source, 409);
        }

        // gmt_offset_now: explicit override, else VICIdial's resolver.
        $gmt_param = param('gmt_offset_now');
        $gmt = ($gmt_param !== '' && is_numeric($gmt_param))
            ? (float)$gmt_param
            : resolve_gmt($mysqli, $phone_code, $phone_number, $state, $postal_code, param('tz_method'));

        // Only valid DOB is written; otherwise the column keeps its default
        // (avoids 0000-00-00 under strict SQL mode).
        $dob_sql = preg_match('/^\d{4}-\d{2}-\d{2}$/', $dob) ? "date_of_birth='" . $mysqli->real_escape_string($dob) . "'," : '';
        $entry_sql = ($entry_list !== '') ? "entry_list_id='" . $mysqli->real_escape_string($entry_list) . "'," : "entry_list_id='0',";
        $e = function ($v) use ($mysqli) { return $mysqli->real_escape_string($v); };

        $sql = "INSERT INTO vicidial_list SET "
            . "phone_code='" . $e($phone_code) . "',"
            . "phone_number='" . $e($phone_number) . "',"
            . "list_id='" . $e($list_id) . "',"
            . "status='NEW',"
            . "user='" . $e($user) . "',"
            . "vendor_lead_code='" . $e($vendor) . "',"
            . "source_id='" . $e($source_id) . "',"
            . "gmt_offset_now='" . $e((string)$gmt) . "',"
            . "title='" . $e($title) . "',"
            . "first_name='" . $e($first_name) . "',"
            . "middle_initial='" . $e($mi) . "',"
            . "last_name='" . $e($last_name) . "',"
            . "address1='" . $e($address1) . "',"
            . "address2='" . $e($address2) . "',"
            . "address3='" . $e($address3) . "',"
            . "city='" . $e($city) . "',"
            . "state='" . $e($state) . "',"
            . "province='" . $e($province) . "',"
            . "postal_code='" . $e($postal_code) . "',"
            . "country_code='" . $e($country_code) . "',"
            . "gender='" . $e($gender) . "',"
            . $dob_sql
            . "alt_phone='" . $e($alt_phone) . "',"
            . "email='" . $e($email) . "',"
            . "security_phrase='" . $e($security) . "',"
            . "comments='" . $e($comments) . "',"
            . "called_since_last_reset='N',"
            . "entry_date=NOW(),"
            . "rank='" . $e($rank) . "',"
            . "owner='" . $e($owner) . "',"
            . $entry_sql
            . "called_count='0'";

        if (!$mysqli->query($sql)) {
            fail($mysqli, $user, $function, 'lead insert failed', $source, 500);
        }
        $lead_id = $mysqli->insert_id;
        ok($mysqli, $user, $function, $source,
            "lead_id|$lead_id\nphone_number|$phone_number\nlist_id|$list_id\ngmt_offset_now|$gmt\nstatus|NEW\n");
        break;
    }

    case 'update_lead': {
        // Locate the lead: lead_id preferred, else phone_number (+ optional
        // list_id when the number exists in several lists).
        $lead_id = preg_replace('/\D/', '', param('lead_id'));
        $lookup_phone = preg_replace('/\D/', '', param('phone_number_lookup'));
        if ($lead_id === '' && $lookup_phone === '') {
            fail($mysqli, $user, $function, 'lead_id or phone_number_lookup required', $source, 400);
        }
        if ($lead_id === '') {
            $list_filter = preg_replace('/\D/', '', param('list_id_lookup'));
            $sql = "SELECT lead_id FROM vicidial_list WHERE phone_number = '" . $mysqli->real_escape_string($lookup_phone) . "'";
            if ($list_filter !== '') $sql .= " AND list_id = '" . $mysqli->real_escape_string($list_filter) . "'";
            $sql .= ' ORDER BY lead_id DESC';
            $res = $mysqli->query($sql);
            $matches = array();
            while ($res && ($r = $res->fetch_row())) $matches[] = $r[0];
            if (!count($matches)) fail($mysqli, $user, $function, 'lead not found', $source, 404);
            if (count($matches) > 1) fail($mysqli, $user, $function, 'multiple leads match (' . count($matches) . ') - use lead_id or list_id_lookup', $source, 409);
            $lead_id = $matches[0];
        }

        $stmt = $mysqli->prepare('SELECT lead_id, phone_code, phone_number, state, postal_code FROM vicidial_list WHERE lead_id = ? LIMIT 1');
        $stmt->bind_param('s', $lead_id);
        $stmt->execute();
        $stmt->bind_result($cur_id, $cur_code, $cur_phone, $cur_state, $cur_postal);
        if (!$stmt->fetch()) { $stmt->close(); fail($mysqli, $user, $function, 'lead not found', $source, 404); }
        $stmt->close();

        // Whitelisted updatable fields; only params actually sent are written.
        $updatable = array('phone_code', 'phone_number', 'title', 'first_name', 'middle_initial',
            'last_name', 'address1', 'address2', 'address3', 'city', 'state', 'province',
            'postal_code', 'country_code', 'gender', 'alt_phone', 'email', 'security_phrase',
            'comments', 'vendor_lead_code', 'source_id', 'rank', 'owner', 'status', 'list_id');
        $sets = array();
        $sent = array();
        foreach ($updatable as $field) {
            if (!isset($_POST[$field]) && !isset($_GET[$field])) continue;
            $value = param($field);
            if ($field === 'phone_number' || $field === 'alt_phone') $value = preg_replace('/\D/', '', $value);
            if ($field === 'phone_code' || $field === 'list_id' || $field === 'rank') $value = preg_replace('/\D/', '', $value);
            if ($field === 'state') $value = strtoupper(substr($value, 0, 2));
            if ($field === 'status') $value = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $value), 0, 6));
            if ($field === 'list_id') {
                $chk = $mysqli->query("SELECT list_id FROM vicidial_lists WHERE list_id = '" . $mysqli->real_escape_string($value) . "' LIMIT 1");
                if (!$chk || !$chk->num_rows) fail($mysqli, $user, $function, 'list_id does not exist', $source, 400);
            }
            $sets[] = "`$field` = '" . $mysqli->real_escape_string($value) . "'";
            $sent[$field] = $value;
        }
        if (!count($sets)) fail($mysqli, $user, $function, 'no updatable fields sent', $source, 400);

        // Re-resolve gmt_offset_now when anything location-relevant changed,
        // using the same VICIdial resolver as add_lead. Explicit override wins.
        $gmt_param = param('gmt_offset_now');
        $touch_gmt = ($gmt_param !== '' && is_numeric($gmt_param));
        $loc_changed = array_intersect(array_keys($sent), array('phone_code', 'phone_number', 'state', 'postal_code'));
        $gmt = null;
        if ($touch_gmt) {
            $gmt = (float)$gmt_param;
        } elseif (count($loc_changed)) {
            $gmt = resolve_gmt(
                $mysqli,
                isset($sent['phone_code']) ? $sent['phone_code'] : ($cur_code ?: '1'),
                isset($sent['phone_number']) ? $sent['phone_number'] : $cur_phone,
                isset($sent['state']) ? $sent['state'] : $cur_state,
                isset($sent['postal_code']) ? $sent['postal_code'] : $cur_postal,
                param('tz_method'),
            );
        }
        if ($gmt !== null) $sets[] = "gmt_offset_now = '" . $mysqli->real_escape_string((string)$gmt) . "'";

        $sql = 'UPDATE vicidial_list SET ' . implode(', ', $sets)
             . " WHERE lead_id = '" . $mysqli->real_escape_string($lead_id) . "' LIMIT 1";
        if (!$mysqli->query($sql)) fail($mysqli, $user, $function, 'lead update failed', $source, 500);

        $out = "lead_id|$lead_id\nfields_updated|" . implode(',', array_keys($sent)) . "\n";
        if ($gmt !== null) $out .= "gmt_offset_now|$gmt\n";
        ok($mysqli, $user, $function, $source, $out);
        break;
    }

    case 'lead_info': {
        $lead_id = preg_replace('/\D/', '', param('lead_id'));
        $phone   = preg_replace('/\D/', '', param('phone_number'));
        if ($lead_id === '' && $phone === '') {
            fail($mysqli, $user, $function, 'lead_id or phone_number required', $source, 400);
        }
        $where = ($lead_id !== '')
            ? "lead_id = '" . $mysqli->real_escape_string($lead_id) . "'"
            : "phone_number = '" . $mysqli->real_escape_string($phone) . "'";
        $res = $mysqli->query(
            "SELECT lead_id, list_id, status, phone_code, phone_number, gmt_offset_now, title,
                    first_name, middle_initial, last_name, address1, city, state, postal_code,
                    vendor_lead_code, source_id, called_count, last_local_call_time, entry_date, owner, `user`
               FROM vicidial_list WHERE $where ORDER BY lead_id DESC LIMIT 20");
        $rows_out = '';
        $n = 0;
        while ($res && ($r = $res->fetch_row())) {
            $rows_out .= implode('|', array_map(function ($v) { return str_replace(array("|", "\n"), array('', ' '), (string)$v); }, $r)) . "\n";
            $n++;
        }
        if (!$n) fail($mysqli, $user, $function, 'lead not found', $source, 404);
        ok($mysqli, $user, $function, $source,
            "count|$n\nlead_id|list_id|status|phone_code|phone_number|gmt_offset_now|title|first_name|middle_initial|last_name|address1|city|state|postal_code|vendor_lead_code|source_id|called_count|last_local_call_time|entry_date|owner|user\n$rows_out");
        break;
    }

    case 'dnc_add': {
        $phone = preg_replace('/\D/', '', param('phone_number'));
        if ($phone === '' || strlen($phone) < 6) fail($mysqli, $user, $function, 'phone_number required', $source, 400);
        $campaign = strtoupper(preg_replace('/[^a-zA-Z0-9_-]/', '', param('campaign_id')));
        if ($campaign !== '') {
            $chk = $mysqli->query("SELECT campaign_id FROM vicidial_campaigns WHERE campaign_id = '" . $mysqli->real_escape_string($campaign) . "' LIMIT 1");
            if (!$chk || !$chk->num_rows) fail($mysqli, $user, $function, 'campaign_id does not exist', $source, 400);
            $stmt = $mysqli->prepare('INSERT IGNORE INTO vicidial_campaign_dnc (phone_number, campaign_id) VALUES (?, ?)');
            $stmt->bind_param('ss', $phone, $campaign);
        } else {
            $stmt = $mysqli->prepare('INSERT IGNORE INTO vicidial_dnc (phone_number) VALUES (?)');
            $stmt->bind_param('s', $phone);
        }
        $stmt->execute();
        $added = $stmt->affected_rows > 0 ? 'Y' : 'N';
        $stmt->close();
        $scope = $campaign !== '' ? $campaign : 'SYSTEM';
        ok($mysqli, $user, $function, $source, "phone_number|$phone\nscope|$scope\nadded|$added\n");
        break;
    }

    case 'dnc_check': {
        $phone = preg_replace('/\D/', '', param('phone_number'));
        if ($phone === '') fail($mysqli, $user, $function, 'phone_number required', $source, 400);
        $campaign = strtoupper(preg_replace('/[^a-zA-Z0-9_-]/', '', param('campaign_id')));
        $stmt = $mysqli->prepare('SELECT COUNT(*) FROM vicidial_dnc WHERE phone_number = ?');
        $stmt->bind_param('s', $phone);
        $stmt->execute();
        $stmt->bind_result($sys_count);
        $stmt->fetch();
        $stmt->close();
        $camp_count = 0;
        if ($campaign !== '') {
            $stmt = $mysqli->prepare('SELECT COUNT(*) FROM vicidial_campaign_dnc WHERE phone_number = ? AND campaign_id = ?');
            $stmt->bind_param('ss', $phone, $campaign);
            $stmt->execute();
            $stmt->bind_result($camp_count);
            $stmt->fetch();
            $stmt->close();
        }
        $in_dnc = ($sys_count > 0 || $camp_count > 0) ? 'Y' : 'N';
        ok($mysqli, $user, $function, $source,
            "phone_number|$phone\nin_dnc|$in_dnc\nsystem_dnc|" . ($sys_count > 0 ? 'Y' : 'N')
            . "\ncampaign_dnc|" . ($camp_count > 0 ? 'Y' : 'N') . "\n");
        break;
    }

    default:
        fail($mysqli, $user, $function, 'function not implemented in GenX API v1', $source, 400);
}
