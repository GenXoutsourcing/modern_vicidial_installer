<?php
/**
 * GENX VICIdial Agent UI clean overlay bootstrap.
 *
 * This file is loaded by /var/www/html/agc/.user.ini and injects a stylesheet
 * into stock /agc/vicidial.php output without editing VICIdial itself.
 *
 * Important safety rule:
 * Do not intercept call-control clicks here. Hangup, manual dial, disposition,
 * transfer, webphone and all call state transitions must remain stock VICIdial
 * behavior. Styling belongs in assets/css/agent-clean.css.
 */

$uri = $_SERVER['REQUEST_URI'] ?? '';
$script = $_SERVER['SCRIPT_NAME'] ?? '';

if (stripos($script, '/agc/vicidial.php') === false && stripos($uri, '/agc/vicidial.php') === false) {
    return;
}

if (PHP_SAPI === 'cli') {
    return;
}

ob_start(static function ($html) {
    if (!is_string($html) || $html === '') {
        return $html;
    }

    if (stripos($html, 'genx-agent-clean-css') !== false) {
        return $html;
    }

    $asset = '<link id="genx-agent-clean-css" rel="stylesheet" type="text/css" href="/agc/ui/assets/css/agent-clean.css?v=20">' . "\n" .
        '<script id="genx-agent-clean-js">' . "\n" .
        '(function(){' .
        'function ready(fn){if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",fn);}else{fn();}}' .
        'ready(function(){' .
        'function visible(e){if(!e){return false;}var s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)!==0&&r.width>0&&r.height>0;}' .
        'function mark(){var b=document.body;if(!b){return;}var t=(b.textContent||"").replace(/\s+/g," ");var login=!!document.getElementById("login_sub");var logout=/LOGOUT PROCESS COMPLETE|CLICK HERE TO LOG IN AGAIN|YOU MAY NOW CLOSE YOUR BROWSER/i.test(t);var loading=visible(document.getElementById("LoadingBox"));b.classList.toggle("genx-agent-login",login);b.classList.toggle("genx-agent-loading",!login&&!logout&&loading);b.classList.toggle("genx-agent-logout",logout);b.classList.toggle("genx-agent-active",!login&&!logout&&!loading);}' .
        'mark();window.setInterval(mark,1000);' .
        '});' .
        '})();' . "\n" .
        '</script>' . "\n";

    if (stripos($html, '</head>') !== false) {
        return preg_replace('/<\/head>/i', $asset . '</head>', $html, 1);
    }

    if (stripos($html, '<body') !== false) {
        return preg_replace('/<body\b/i', $asset . '<body', $html, 1);
    }

    return $asset . $html;
});
