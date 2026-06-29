<?php
namespace ViciUI;

require_once __DIR__ . '/PageActions.php';

class FormPage
{
    public static function render($html, array $config)
    {
        $form = self::extractForm($html, $config);

        if ($form === false) {
            return false;
        }

        $title = $config['title'] ?? 'Form';
        $note = $config['note'] ?? 'VICIdial form';
        $actionsKey = $config['actions_key'] ?? '';

        return '
<div class="ui-page">
    <div class="ui-card">
        <div class="ui-card-head">
            <div>
                <h2>' . htmlspecialchars($title) . '</h2>
                <p>' . htmlspecialchars($note) . '</p>
            </div>
        </div>

        ' . PageActions::render($actionsKey) . '
        ' . self::renderContextActions($html, $actionsKey) . '

        <div class="ui-form-wrap ui-generic-form">
            ' . $form . '
        </div>
    </div>
</div>';
    }


    private static function renderContextActions($html, $actionsKey)
    {
        if ($actionsKey !== 'campaigns') {
            return '';
        }

        /*
         * Confirmed VICIdial campaign map:
         *
         * Basic          ADD=34
         * Detail         ADD=31
         * Statuses       ADD=31&SUB=22
         * HotKeys        ADD=31&SUB=23
         * Lead Recycling ADD=31&SUB=25
         * Auto Alt Dial  ADD=31&SUB=26
         * List Mix       ADD=31&SUB=29
         * Survey         ADD=31&SUB=20A
         * Pause Codes    ADD=31&SUB=27
         * AC-CID         ADD=31&SUB=202
         * Real-Time      realtime_report.php?RR=4&DB=0&group=CAMPAIGN
         */

        $campaignId = self::currentCampaignId($html);

        if ($campaignId === '') {
            return '';
        }

        $add = (string)($_REQUEST['ADD'] ?? '');
        $sub = (string)($_REQUEST['SUB'] ?? '');
        $campaign = rawurlencode($campaignId);

        $basicUrl    = '/vicidial/admin.php?ADD=34&campaign_id=' . $campaign;
        $detailUrl   = '/vicidial/admin.php?ADD=31&campaign_id=' . $campaign;
        $listMixUrl  = '/vicidial/admin.php?ADD=31&SUB=29&campaign_id=' . $campaign;
        $realTimeUrl = '/vicidial/realtime_report.php?RR=4&DB=0&group=' . $campaign;

        /*
         * Basic page stock VICIdial only shows:
         * Basic View | Detail View | List Mix | Real-Time Screen
         */
        if ($add === '34' && $sub === '') {
            $buttons = [
                ['Basic View',       $basicUrl, true],
                ['Detail View',      $detailUrl, false],
                ['List Mix',         $listMixUrl, false],
                ['Real-Time Screen', $realTimeUrl, false],
            ];

            return self::renderPillRow($buttons);
        }

        /*
         * Detail and campaign subpages show the full campaign tab row.
         */
        $tabs = [
            ['Basic',          $basicUrl,    ($add === '34' && $sub === '')],
            ['Detail',         $detailUrl,   ($add === '31' && $sub === '')],
            ['Statuses',       '/vicidial/admin.php?ADD=31&SUB=22&campaign_id=' . $campaign, ($add === '31' && $sub === '22')],
            ['HotKeys',        '/vicidial/admin.php?ADD=31&SUB=23&campaign_id=' . $campaign, ($add === '31' && $sub === '23')],
            ['Lead Recycling', '/vicidial/admin.php?ADD=31&SUB=25&campaign_id=' . $campaign, ($add === '31' && $sub === '25')],
            ['Auto Alt Dial',  '/vicidial/admin.php?ADD=31&SUB=26&campaign_id=' . $campaign, ($add === '31' && $sub === '26')],
            ['List Mix',       $listMixUrl,  ($add === '31' && $sub === '29')],
            ['Survey',         '/vicidial/admin.php?ADD=31&SUB=20A&campaign_id=' . $campaign, ($add === '31' && strtoupper($sub) === '20A')],
            ['Pause Codes',    '/vicidial/admin.php?ADD=31&SUB=27&campaign_id=' . $campaign, ($add === '31' && $sub === '27')],
            ['AC-CID',         '/vicidial/admin.php?ADD=31&SUB=202&campaign_id=' . $campaign, ($add === '31' && $sub === '202')],
            ['Real-Time',      $realTimeUrl, false],
        ];

        return self::renderPillRow($tabs);
    }

    private static function renderPillRow(array $buttons)
    {
        $out = '<div class="ui-page-actions ui-context-actions">';

        foreach ($buttons as $button) {
            $label = $button[0];
            $url = $button[1];
            $active = !empty($button[2]) ? ' primary' : '';

            $out .= '<a class="ui-action-pill' . $active . '" href="' . htmlspecialchars($url) . '">'
                . htmlspecialchars($label) .
            '</a>';
        }

        $out .= '</div>';

        return $out;
    }

    private static function currentCampaignId($html)
    {
        if (!empty($_REQUEST['campaign_id'])) {
            return (string)$_REQUEST['campaign_id'];
        }

        if (!empty($_REQUEST['group'])) {
            return (string)$_REQUEST['group'];
        }

        if (preg_match('/[?&]campaign_id=([A-Za-z0-9_-]+)/i', $_SERVER['REQUEST_URI'] ?? '', $m)) {
            return $m[1];
        }

        if (preg_match('/[?&]group=([A-Za-z0-9_-]+)/i', $_SERVER['REQUEST_URI'] ?? '', $m)) {
            return $m[1];
        }

        if (preg_match('/campaign_id=([A-Za-z0-9_-]+)/i', $html, $m)) {
            return $m[1];
        }

        $text = html_entity_decode(strip_tags($html));
        $text = preg_replace('/\s+/', ' ', $text);

        if (preg_match('/Campaign ID:\s*([A-Za-z0-9_-]+)/i', $text, $m)) {
            return $m[1];
        }

        return '';
    }

    private static function normLabel($text)
    {
        $text = strtoupper(html_entity_decode((string)$text));
        $text = preg_replace('/[^A-Z0-9]+/', '', $text);
        return $text;
    }


    private static function extractForm($html, array $config)
    {
        if (!class_exists('DOMDocument')) {
            return false;
        }

        $markers = $config['markers'] ?? [];
        $minScore = $config['min_score'] ?? 20;

        if (empty($markers)) {
            return false;
        }

        /*
         * Campaign subpages can contain many small forms on one page.
         * Example: Statuses has one form per status plus an Add New Status form.
         * If we extract only the best form, we lose the add-new area.
         */
        $campaignSubContent = self::extractCampaignSubpageContent($html);
        if ($campaignSubContent !== false) {
            return self::clean($campaignSubContent);
        }

        /*
         * Preserve VICIdial's raw form first.
         * DOMDocument can break old nested table/form HTML and lose hidden ADD fields.
         */
        $rawForm = self::extractRawForm($html, $markers, $minScore);
        if ($rawForm !== false) {
            return self::clean($rawForm);
        }

        $dom = new \DOMDocument('1.0', 'UTF-8');

        libxml_use_internal_errors(true);
        $loaded = $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
        libxml_clear_errors();

        if (!$loaded) {
            return false;
        }

        $xpath = new \DOMXPath($dom);

        /*
         * First: real forms.
         */
        $forms = $dom->getElementsByTagName('form');

        $bestForm = null;
        $bestScore = -999999;

        foreach ($forms as $form) {
            $score = self::scoreNode($xpath, $form, $markers);

            if ($score > $bestScore) {
                $bestScore = $score;
                $bestForm = $form;
            }
        }

        if ($bestForm && $bestScore >= $minScore) {
            return self::clean($dom->saveHTML($bestForm));
        }

        /*
         * Fallback: table with fields.
         */
        $tables = $dom->getElementsByTagName('table');

        $bestTable = null;
        $bestTableScore = -999999;

        foreach ($tables as $table) {
            $score = self::scoreNode($xpath, $table, $markers);

            if ($score > $bestTableScore) {
                $bestTableScore = $score;
                $bestTable = $table;
            }
        }

        if ($bestTable && $bestTableScore >= $minScore) {
            return self::clean($dom->saveHTML($bestTable));
        }

        $debugDir = __DIR__ . '/debug';
        if (is_dir($debugDir) && is_writable($debugDir)) {
            file_put_contents($debugDir . '/form_failed_' . preg_replace('/[^a-zA-Z0-9_]/', '_', $_SERVER['REQUEST_URI'] ?? 'unknown') . '.txt', strip_tags($html));
        }

        return false;
    }



    private static function extractCampaignSubpageContent($html)
    {
        $add = (string)($_REQUEST['ADD'] ?? '');
        $sub = (string)($_REQUEST['SUB'] ?? '');

        if ($add !== '31' || $sub === '') {
            return false;
        }

        /*
         * Strict campaign subpage markers.
         * Do NOT use short labels like HOTKEYS, LIST MIX, PAUSE CODES.
         * Those appear in the old VICIdial navigation and cause the wrong table to be extracted.
         */
        $strictMarkers = [
            'CUSTOM STATUSES WITHIN THIS CAMPAIGN',
            'ADD NEW CUSTOM CAMPAIGN STATUS',

            'HOTKEYS FOR THIS CAMPAIGN',
            'HOT KEYS FOR THIS CAMPAIGN',
            'ADD NEW HOTKEY',
            'ADD NEW HOT KEY',

            'LEAD RECYCLING WITHIN THIS CAMPAIGN',
            'LEAD RECYCLING FOR THIS CAMPAIGN',
            'ADD NEW LEAD RECYCLING',

            'AUTO ALT NUMBER DIALING FOR THIS CAMPAIGN',
            'ADD NEW AUTO ALT NUMBER DIALING STATUS',

            'LIST MIXES FOR THIS CAMPAIGN',
            'LIST MIX FOR THIS CAMPAIGN',
            'ADD NEW LIST MIX',

            'SURVEY FOR THIS CAMPAIGN',
            'SURVEY QUESTIONS FOR THIS CAMPAIGN',

            'AGENT PAUSE CODES FOR THIS CAMPAIGN',
            'ADD NEW AGENT PAUSE CODE',

            'AC-CID FOR THIS CAMPAIGN',
            'AC-CID LISTINGS FOR THIS CAMPAIGN',
            'ADD NEW AC-CID',
        ];

        $plain = strtoupper(html_entity_decode(strip_tags($html)));
        $plain = preg_replace('/\s+/', ' ', $plain);

        $pageHasStrictMarker = false;
        foreach ($strictMarkers as $marker) {
            if (strpos($plain, $marker) !== false) {
                $pageHasStrictMarker = true;
                break;
            }
        }

        if (!$pageHasStrictMarker) {
            return false;
        }

        if (!class_exists('DOMDocument')) {
            return false;
        }

        $dom = new \DOMDocument('1.0', 'UTF-8');

        libxml_use_internal_errors(true);
        $loaded = $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
        libxml_clear_errors();

        if (!$loaded) {
            return false;
        }

        $xpath = new \DOMXPath($dom);

        $best = null;
        $bestScore = -999999;

        foreach ($dom->getElementsByTagName('table') as $table) {
            $text = strtoupper(trim(preg_replace('/\s+/', ' ', $table->textContent ?? '')));

            if ($text === '') {
                continue;
            }

            /*
             * Critical: table itself must contain a real subpage content marker.
             * This prevents old navigation tables from matching.
             */
            $containsStrictMarker = false;
            foreach ($strictMarkers as $marker) {
                if (strpos($text, $marker) !== false) {
                    $containsStrictMarker = true;
                    break;
                }
            }

            if (!$containsStrictMarker) {
                continue;
            }

            $inputs  = $xpath->query('.//input', $table)->length;
            $selects = $xpath->query('.//select', $table)->length;
            $forms   = $xpath->query('.//form', $table)->length;
            $rows    = $xpath->query('.//tr', $table)->length;
            $links   = $xpath->query('.//a', $table)->length;

            $score = 1000;
            $score += min($inputs, 300) * 3;
            $score += min($selects, 300) * 3;
            $score += min($forms, 100) * 10;
            $score += min($rows, 300);
            $score += min(strlen($text) / 20, 300);

            /*
             * Strongly reject old VICIdial admin navigation/sidebar content.
             */
            foreach ([
                'REPORTS USERS CAMPAIGNS',
                'CAMPAIGNS MAIN STATUSES HOTKEYS',
                'LISTS SCRIPTS FILTERS INBOUND USER GROUPS',
                'ADMIN USER GROUPS REMOTE AGENTS PHONES',
                'SHOW CAMPAIGNS ADD A NEW CAMPAIGN COPY CAMPAIGN',
                'HOME | TIMECLOCK',
                'LOGOUT',
                'VERSION:',
            ] as $bad) {
                if (strpos($text, $bad) !== false) {
                    $score -= 5000;
                }
            }

            /*
             * Old nav tables usually have many links and no useful form controls.
             */
            if ($links > 20 && ($inputs + $selects + $forms) < 3) {
                $score -= 5000;
            }

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $table;
            }
        }

        if (!$best || $bestScore < 500) {
            return false;
        }

        return $dom->saveHTML($best);
    }


    private static function extractRawForm($html, array $markers, $minScore)
    {
        if (!preg_match_all('/<form\b[^>]*>.*?<\/form>/is', $html, $matches)) {
            return false;
        }

        $best = false;
        $bestScore = -999999;

        foreach ($matches[0] as $form) {
            $text = strtoupper(html_entity_decode(strip_tags($form)));
            $text = preg_replace('/\s+/', ' ', $text);

            $score = 0;

            $controls = 0;
            $controls += preg_match_all('/<input\b/i', $form);
            $controls += preg_match_all('/<select\b/i', $form);
            $controls += preg_match_all('/<textarea\b/i', $form);

            $score += min($controls, 80);

            foreach ($markers as $marker) {
                if (strpos($text, strtoupper($marker)) !== false) {
                    $score += 15;
                }
            }

            foreach ([
                'REPORTS',
                'SHOW USERS',
                'CAMPAIGNS',
                'LISTS',
                'SCRIPTS',
                'FILTERS',
                'VERSION:',
                'VICIDIAL GROUP',
                'TIMECLOCK',
                'LOGOUT',
            ] as $bad) {
                if (strpos($text, $bad) !== false) {
                    $score -= 10;
                }
            }

            if ($controls < 2) {
                $score -= 1000;
            }

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $form;
            }
        }

        if ($best !== false && $bestScore >= $minScore) {
            return $best;
        }

        return false;
    }

    private static function scoreNode(\DOMXPath $xpath, \DOMNode $node, array $markers)
    {
        $text = trim(preg_replace('/\s+/', ' ', $node->textContent ?? ''));

        $inputs = $xpath->query('.//input', $node)->length;
        $selects = $xpath->query('.//select', $node)->length;
        $textareas = $xpath->query('.//textarea', $node)->length;
        $controls = $inputs + $selects + $textareas;

        $score = min($controls, 80);

        foreach ($markers as $marker) {
            if (stripos($text, $marker) !== false) {
                $score += 15;
            }
        }

        foreach ([
            'Reports',
            'Show Users',
            'Campaigns',
            'Lists',
            'Scripts',
            'Filters',
            'VERSION:',
            'ViciDial Group',
            'Timeclock',
            'Logout',
        ] as $bad) {
            if (stripos($text, $bad) !== false) {
                $score -= 10;
            }
        }

        if ($controls < 2) {
            $score -= 1000;
        }

        return $score;
    }



    private static function preserveCampaignSubPageParams($html)
    {
        /*
         * Campaign subpages like:
         *   admin.php?ADD=31&SUB=26&campaign_id=TESTCAMP
         *
         * often contain small add/modify forms that post to plain admin.php.
         * Without hidden ADD/SUB/campaign_id values, VICIdial falls back to Admin/Dashboard.
         *
         * Keep this targeted to campaign subpages only.
         */
        $add = (string)($_REQUEST['ADD'] ?? '');
        $sub = (string)($_REQUEST['SUB'] ?? '');
        $campaignId = self::currentCampaignId($html);

        if ($add !== '31' || $sub === '' || $campaignId === '') {
            return $html;
        }

        $needed = [
            'ADD' => $add,
            'SUB' => $sub,
            'campaign_id' => $campaignId,
        ];

        return preg_replace_callback('/<form\b([^>]*)>(.*?)<\/form>/is', function ($m) use ($needed) {
            $attrs = $m[1];
            $body  = $m[2];

            $hidden = '';

            foreach ($needed as $name => $value) {
                if (preg_match('/\sname\s*=\s*(["\']?)' . preg_quote($name, '/') . '\1/i', $body)) {
                    continue;
                }

                $hidden .= '<input type="hidden" name="' . htmlspecialchars($name, ENT_QUOTES) . '" value="' . htmlspecialchars($value, ENT_QUOTES) . '">' . "\n";
            }

            return '<form' . $attrs . '>' . "\n" . $hidden . $body . '</form>';
        }, $html);
    }


    private static function fixFormActions($html)
    {
        /*
         * Do not touch VICIdial forms.
         * VICIdial uses specific hidden fields, submit names, methods, and ADD values.
         * Rewriting or injecting fields can make submit fall back to dashboard.
         */
        return $html;
    }

    private static function clean($html)
    {
        $html = self::fixFormActions($html);
        $html = self::preserveCampaignSubPageParams($html);
        $html = preg_replace('/\s(bgcolor|background|border|cellpadding|cellspacing|width|height)=("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);

        $html = preg_replace('/<font\b[^>]*>/i', '<span>', $html);
        $html = str_ireplace('</font>', '</span>', $html);

        $html = preg_replace('/\sstyle=("|\')[^"\']*(color|background-color|font-family|font-size)\s*:[^"\']*("|\')/i', '', $html);

        return $html;
    }
}
