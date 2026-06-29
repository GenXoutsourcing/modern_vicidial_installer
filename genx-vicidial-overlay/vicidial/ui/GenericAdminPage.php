<?php
namespace ViciUI;

require_once __DIR__ . '/PageActions.php';

class GenericAdminPage
{
    public static function render($html, array $config = [])
    {
        $content = self::extractBestContent($html);

        if ($content === false) {
            return false;
        }

        $title = $config['title'] ?? self::titleFromHtml($content);
        $note = $config['note'] ?? 'VICIdial administration page';
        $actionsHtml = !empty($config['actions_key']) ? PageActions::render($config['actions_key']) : self::renderActions($html, $title);

        return '
<div class="ui-page">
    <div class="ui-card">
        <div class="ui-card-head">
            <div>
                <h2>' . htmlspecialchars($title) . '</h2>
                <p>' . htmlspecialchars($note) . '</p>
            </div>
        </div>

        ' . $actionsHtml . '

        <div class="ui-table-wrap ui-content-page ui-generic-admin-page">
            ' . $content . '
        </div>
    </div>
</div>';
    }

    private static function extractBestContent($html)
    {
        /*
         * Preserve raw VICIdial forms before DOMDocument touches old table/form HTML.
         */
        $rawForm = self::extractRawForm($html);
        if ($rawForm !== false) {
            return self::clean($rawForm);
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

        /*
         * First choice: real form with controls.
         */
        $best = null;
        $bestScore = -999999;

        foreach ($dom->getElementsByTagName('form') as $form) {
            $score = self::scoreNode($xpath, $form);

            if ($score > $bestScore) {
                $best = $form;
                $bestScore = $score;
            }
        }

        if ($best && $bestScore > 0) {
            return self::clean($dom->saveHTML($best));
        }

        /*
         * Second choice: listing/content table.
         */
        $best = null;
        $bestScore = -999999;

        foreach ($dom->getElementsByTagName('table') as $table) {
            $score = self::scoreNode($xpath, $table);

            if ($score > $bestScore) {
                $best = $table;
                $bestScore = $score;
            }
        }

        if (!$best || $bestScore < 1) {
            return false;
        }

        return self::clean($dom->saveHTML($best));
    }


    private static function extractRawForm($html)
    {
        if (!preg_match_all('/<form\b[^>]*>.*?<\/form>/is', $html, $matches)) {
            return false;
        }

        $best = false;
        $bestScore = -999999;

        foreach ($matches[0] as $form) {
            $text = strtoupper(html_entity_decode(strip_tags($form)));
            $text = preg_replace('/\s+/', ' ', $text);

            $controls = 0;
            $controls += preg_match_all('/<input\b/i', $form);
            $controls += preg_match_all('/<select\b/i', $form);
            $controls += preg_match_all('/<textarea\b/i', $form);

            if ($controls < 2) {
                continue;
            }

            $score = min($controls, 100) * 4;

            foreach ([
                'LISTINGS',
                'MODIFY',
                'ADD A NEW',
                'COPY',
                'SUBMIT',
                'SERVER ID',
                'CARRIER ID',
                'CALL TIME',
                'SHIFT ID',
                'STATUS',
                'QUEUE GROUP',
                'IP LIST',
                'CONFERENCE',
                'SYSTEM SETTINGS',
                'PHONE',
            ] as $good) {
                if (strpos($text, $good) !== false) {
                    $score += 30;
                }
            }

            foreach ([
                'HOME | TIMECLOCK',
                'LOGOUT',
                'REPORTS',
                'USERS CAMPAIGNS LISTS SCRIPTS FILTERS',
                'VICIDIAL GROUP',
                'VERSION:',
                'COPYRIGHT',
            ] as $bad) {
                if (strpos($text, $bad) !== false) {
                    $score -= 80;
                }
            }

            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $form;
            }
        }

        if ($best !== false && $bestScore > 0) {
            return $best;
        }

        return false;
    }

    private static function scoreNode(\DOMXPath $xpath, \DOMNode $node)
    {
        $text = strtoupper(trim(preg_replace('/\s+/', ' ', $node->textContent ?? '')));

        if ($text === '') {
            return -999999;
        }

        $inputs = $xpath->query('.//input', $node)->length;
        $selects = $xpath->query('.//select', $node)->length;
        $textareas = $xpath->query('.//textarea', $node)->length;
        $links = $xpath->query('.//a', $node)->length;
        $trs = $xpath->query('.//tr', $node)->length;
        $tds = $xpath->query('.//td', $node)->length;

        $score = 0;

        $score += min(strlen($text) / 25, 80);
        $score += min($inputs + $selects + $textareas, 80) * 4;
        $score += min($trs, 80);
        $score += min($tds, 120) / 2;

        foreach ([
            'LISTINGS',
            'MODIFY',
            'ADD A NEW',
            'COPY',
            'SUBMIT',
            'SERVER ID',
            'CARRIER ID',
            'CALL TIME',
            'SHIFT ID',
            'STATUS',
            'QUEUE GROUP',
            'IP LIST',
            'CONFERENCE',
            'SYSTEM SETTINGS',
        ] as $good) {
            if (strpos($text, $good) !== false) {
                $score += 30;
            }
        }

        /*
         * Penalize old nav/sidebar/header/footer chunks.
         */
        foreach ([
            'HOME | TIMECLOCK',
            'LOGOUT',
            'REPORTS',
            'USERS CAMPAIGNS LISTS SCRIPTS FILTERS',
            'VICIDIAL GROUP',
            'VERSION:',
            'COPYRIGHT',
        ] as $bad) {
            if (strpos($text, $bad) !== false) {
                $score -= 80;
            }
        }

        /*
         * The Admin landing page has many admin-card links.
         * Do not let generic fallback grab that page.
         */
        if (
            strpos($text, 'CALL TIMES') !== false &&
            strpos($text, 'SYSTEM SETTINGS') !== false &&
            strpos($text, 'SETTINGS CONTAINERS') !== false &&
            strpos($text, 'QUEUE GROUPS') !== false
        ) {
            $score -= 200;
        }

        return $score;
    }


    private static function renderActions($html, $pageTitle = '')
    {
        $actions = [
            [
                'label' => 'Back To Admin',
                'url'   => '/vicidial/admin.php?ADD=999998',
                'primary' => true,
            ],
        ];

        foreach (self::extractActionLinks($html, $pageTitle) as $link) {
            $actions[] = $link;
        }

        $out = '<div class="ui-page-actions">';

        foreach ($actions as $action) {
            $primary = !empty($action['primary']) ? ' primary' : '';

            $out .= '<a class="ui-action-pill' . $primary . '" href="' . htmlspecialchars($action['url']) . '">'
                . htmlspecialchars($action['label']) .
            '</a>';
        }

        $out .= '</div>';

        return $out;
    }

    private static function extractActionLinks($html, $pageTitle = '')
    {
        if (!class_exists('DOMDocument')) {
            return [];
        }

        $dom = new \DOMDocument('1.0', 'UTF-8');

        libxml_use_internal_errors(true);
        $loaded = $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
        libxml_clear_errors();

        if (!$loaded) {
            return [];
        }

        $links = [];

        foreach ($dom->getElementsByTagName('a') as $a) {
            $label = trim(preg_replace('/\s+/', ' ', $a->textContent));
            $href  = trim($a->getAttribute('href'));

            if ($label === '' || $href === '') {
                continue;
            }

            $upper = strtoupper($label);

            /*
             * Keep only real page actions.
             */
            $isAction =
                preg_match('/\bADD\b|\bADD NEW\b|\bADD A NEW\b|\bCOPY\b|\bSHOW\b|\bLIST\b|\bLISTINGS\b/i', $label);

            if (!$isAction) {
                continue;
            }

            if (!self::allowedActionForPage($pageTitle, $label)) {
                continue;
            }

            /*
             * Exclude nav/header/footer/sidebar junk.
             */
            if (preg_match('/^(HOME|TIMECLOCK|CHAT|LOGOUT|REPORTS|USERS|CAMPAIGNS|LISTS|SCRIPTS|FILTERS|ADMIN)$/i', $label)) {
                continue;
            }

            if (stripos($href, 'logout') !== false) {
                continue;
            }

            if (stripos($href, 'admin.php') === false) {
                continue;
            }

            if (strpos($href, 'http') !== 0 && strpos($href, '/') !== 0) {
                $href = '/vicidial/' . ltrim($href, '/');
            }

            $label = self::cleanActionLabel($label);

            $key = strtoupper($label) . '|' . $href;

            if (!isset($links[$key])) {
                $links[$key] = [
                    'label' => $label,
                    'url'   => $href,
                    'primary' => false,
                ];
            }
        }

        return array_values($links);
    }


    private static function allowedActionForPage($pageTitle, $label)
    {
        $labelNorm = self::norm($label);
        $titleNorm = self::norm($pageTitle);

        if ($titleNorm === '') {
            return true;
        }

        $keywords = [
            'CALLTIMES' => ['CALLTIME'],
            'SHIFTS' => ['SHIFT'],
            'PHONES' => ['PHONE'],
            'TEMPLATES' => ['TEMPLATE'],
            'CARRIERS' => ['CARRIER'],
            'SERVERS' => ['SERVER'],
            'CONFERENCES' => ['CONFERENCE', 'CONF'],
            'SYSTEMSETTINGS' => ['SYSTEMSETTING'],
            'SYSTEMSTATUSES' => ['STATUS'],
            'STATUSGROUPS' => ['STATUSGROUP'],
            'CIDGROUPS' => ['CIDGROUP'],
            'QUEUEGROUPS' => ['QUEUEGROUP'],
            'IPLISTS' => ['IPLIST'],
            'AUDIOSTORE' => ['AUDIO', 'AUDIOSTORE'],
            'MUSICONHOLD' => ['MUSIC', 'MOH'],
            'VOICEMAIL' => ['VOICEMAIL'],
            'VMMESSAGEGROUPS' => ['VMMESSAGE', 'VMGROUP'],
            'SETTINGSCONTAINERS' => ['SETTINGSCONTAINER'],
            'SCREENCOLORS' => ['SCREENCOLOR'],
            'AGENTSCREENLABELS' => ['SCREENLABEL', 'AGENTSCREENLABEL'],
        ];

        if (!isset($keywords[$titleNorm])) {
            return true;
        }

        foreach ($keywords[$titleNorm] as $keyword) {
            if (strpos($labelNorm, $keyword) !== false) {
                return true;
            }
        }

        /*
         * Always allow generic list/show links if the stock page exposes them,
         * but still avoid unrelated sidebar/admin landing links.
         */
        if (preg_match('/^(SHOW|LIST|LISTINGS)/i', trim($label))) {
            return true;
        }

        return false;
    }


    private static function norm($text)
    {
        $text = strtoupper(html_entity_decode((string)$text));
        $text = preg_replace('/[^A-Z0-9]+/', '', $text);
        return $text;
    }

    private static function cleanActionLabel($label)
    {
        $label = trim(preg_replace('/\s+/', ' ', html_entity_decode($label)));

        $label = preg_replace('/^ADD A NEW /i', 'Add ', $label);
        $label = preg_replace('/^ADD NEW /i', 'Add ', $label);
        $label = preg_replace('/^ADD /i', 'Add ', $label);

        $label = preg_replace('/ LISTINGS$/i', ' List', $label);
        $label = preg_replace('/ LISTING$/i', ' List', $label);

        return $label;
    }


    private static function titleFromHtml($html)
    {
        $text = strtoupper(html_entity_decode(strip_tags($html)));
        $text = preg_replace('/\s+/', ' ', $text);

        if (
            strpos($text, 'SVN VERSION') !== false &&
            strpos($text, 'DB SCHEMA VERSION') !== false &&
            strpos($text, 'AUTO USER-ADD VALUE') !== false
        ) {
            return 'System Settings';
        }

        if (strpos($text, 'SYSTEM SETTINGS') !== false) {
            return 'System Settings';
        }

        if (preg_match('/([A-Z0-9][A-Z0-9 \/_-]{2,60} LISTINGS):?/', $text, $m)) {
            return self::prettyTitle($m[1]);
        }

        if (preg_match('/(MODIFY [A-Z0-9][A-Z0-9 \/_-]{2,60})/', $text, $m)) {
            return self::prettyTitle($m[1]);
        }

        if (preg_match('/(ADD A NEW [A-Z0-9][A-Z0-9 \/_-]{2,60})/', $text, $m)) {
            return self::prettyTitle($m[1]);
        }

        if (preg_match('/(COPY [A-Z0-9][A-Z0-9 \/_-]{2,60})/', $text, $m)) {
            return self::prettyTitle($m[1]);
        }

        return 'Admin Page';
    }

    private static function prettyTitle($text)
    {
        $text = strtolower(trim($text));
        $text = str_replace(['_', '/'], [' ', ' / '], $text);
        $text = preg_replace('/\s+/', ' ', $text);

        $small = ['a', 'an', 'and', 'or', 'of', 'the', 'to'];

        $words = explode(' ', $text);
        foreach ($words as $i => $word) {
            if ($i > 0 && in_array($word, $small, true)) {
                continue;
            }

            $words[$i] = strtoupper(substr($word, 0, 1)) . substr($word, 1);
        }

        return implode(' ', $words);
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
        $html = preg_replace('/\s(bgcolor|background|border|cellpadding|cellspacing|width|height)=("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);

        $html = preg_replace('/<font\b[^>]*>/i', '<span>', $html);
        $html = str_ireplace('</font>', '</span>', $html);

        $html = preg_replace('/\sstyle=("|\')[^"\']*(color|background-color|font-family|font-size)\s*:[^"\']*("|\')/i', '', $html);

        return $html;
    }
}
