<?php
/**
 * Local VICIphone host for GENX/VICIdial.
 *
 * This is an additive local copy of the public VICIphone client assets. It
 * accepts the same base64 query parameters VICIdial already sends to
 * phone.viciphone.com and emits the JavaScript variables expected by
 * js/vici_phone.js.
 */

function genx_param_decode(string $name, string $default = ''): string
{
    $value = $_GET[$name] ?? $default;
    if (!is_string($value) || $value === '') {
        return $default;
    }
    $decoded = base64_decode($value, true);
    return ($decoded !== false) ? $decoded : $value;
}

function genx_js_string(string $value): string
{
    return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

$phone_login = genx_param_decode('phone_login');
$phone_pass = genx_param_decode('phone_pass');
$server_ip = genx_param_decode('server_ip');
$protocol = genx_param_decode('protocol', 'SIP');
$options = genx_param_decode('options');

$ws_server = '';
if (preg_match('/WEBSOCKETURL(.*?)(?:--SESSION|--SETTINGS|--[A-Z_]+_[YN]|$)/s', $options, $matches)) {
    $ws_server = trim($matches[1]);
}

$hide_dialpad = (strpos($options, 'DIALPAD_N') !== false) ? '1' : '';
$hide_dialbox = (strpos($options, 'DIALBOX_N') !== false) ? '1' : '';
$hide_mute = (strpos($options, 'MUTE_N') !== false) ? '1' : '';
$hide_volume = (strpos($options, 'VOLUME_N') !== false) ? '1' : '';
$auto_answer = (strpos($options, 'AUTOANSWER_Y') !== false) ? '1' : '';
$debug_enabled = (strpos($options, 'DEBUG_Y') !== false) ? '1' : '';

$sip_uri = $phone_login . '@' . $server_ip;
?>
<!DOCTYPE html>
<html>
	<head>
		<title>Vicidial Web Phone</title>
		<link rel="stylesheet" href="css/default.css" />
		<meta http-equiv="Pragma" content="no-cache">
		<meta http-equiv="Expires" content="-1">
		<meta http-equiv="CACHE-CONTROL" content="NO-CACHE">
	</head>
	<body>
		<div id="container">
			<div id="main">
				<audio autoplay width="0" height="0" id="audio"></audio>
				<section id="logo">
					<img id="logo_img" src="images/wp_logo.png" alt="VICIphone">
				</section>
				<section id="controls">
					<section id="registration_control">
						<input type="text" value="Unregistered" id="reg_status" readonly>
						<button class="button" id="register"><img id="reg_icon" src="images/wp_register_inactive.gif" alt="register"></button>
						<button class="button" id="unregister"><img id="unreg_icon" src="images/wp_unregister_inactive.gif" alt="unregister"></button>
					</section>
					<section id="dial_control">
						<input type="text" name="digits" value="" id="digits"/>
						<button class="button" id="dial"><img id="dial_icon" src="images/wp_dial.gif" alt="dial"></button>
					</section>
					<section id="audio_control">
						<button class="button" id="mic_mute"><img id="mute_icon" src="images/wp_mic_on.gif" alt="mute"></button>
						<button class="button" id="vol_up"><img id="vol_up_icon" src="images/wp_speaker_up.gif" alt="volume up"></button>
						<button class="button" id="vol_down"><img id="vol_down_icon" src="images/wp_speaker_down.gif" alt="volume down"></button>
					</section>
				</section>
				<section id="dialpad">
					<section id="dial_row1">
						<button class="dialpad_button" id="one">1</button>
						<button class="dialpad_button" id="two">2</button>
						<button class="dialpad_button" id="three">3</button>
					</section>
					<section id="dial_row2">
						<button class="dialpad_button" id="four">4</button>
						<button class="dialpad_button" id="five">5</button>
						<button class="dialpad_button" id="six">6</button>
					</section>
					<section id="dial_row3">
						<button class="dialpad_button" id="seven">7</button>
						<button class="dialpad_button" id="eight">8</button>
						<button class="dialpad_button" id="nine">9</button>
					</section>
					<section id="dial_row4">
						<button class="dialpad_button" id="star">*</button>
						<button class="dialpad_button" id="zero">0</button>
						<button class="dialpad_button" id="pound">#</button>
					</section>
					<section id="dial_dtmf">
						<input type="text" name="dtmf_digits" value="" id="dtmf_digits"/>
						<button class="button" id="send_dtmf">Send</button>
					</section>
				</section>
			</div>
		</div>
		<div id="debug"></div>

		<script>
		var cid_name = <?php echo genx_js_string($phone_login); ?>;
		var sip_uri = <?php echo genx_js_string($sip_uri); ?>;
		var auth_user = <?php echo genx_js_string($phone_login); ?>;
		var password = <?php echo genx_js_string($phone_pass); ?>;
		var ws_server = <?php echo genx_js_string($ws_server); ?>;
		var debug_enabled = <?php echo genx_js_string($debug_enabled); ?>;
		var hide_dialpad = <?php echo genx_js_string($hide_dialpad); ?>;
		var hide_dialbox = <?php echo genx_js_string($hide_dialbox); ?>;
		var hide_mute = <?php echo genx_js_string($hide_mute); ?>;
		var hide_volume = <?php echo genx_js_string($hide_volume); ?>;
		var auto_answer = <?php echo genx_js_string($auto_answer); ?>;
		</script>
		<script src="js/adapter-latest.js"></script>
		<script src="js/sip.js"></script>
		<script src="js/vici_phone.js"></script>
	</body>
</html>
