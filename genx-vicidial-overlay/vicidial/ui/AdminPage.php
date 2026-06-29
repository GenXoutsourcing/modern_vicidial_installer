<?php
namespace ViciUI;

class AdminPage
{
    public static function render($html)
    {
        $links = self::extractAdminLinks($html);

        $groups = [
            'Core Administration' => [
                'Call Times',
                'Shifts',
                'Phones',
                'Templates',
                'Carriers',
                'Servers',
            ],
            'System Configuration' => [
                'Conferences',
                'System Settings',
                'Agent Screen Labels',
                'Screen Colors',
                'System Statuses',
                'Status Groups',
                'CID Groups',
            ],
            'Audio / Messaging' => [
                'Voicemail',
                'Audio Store',
                'Music On Hold',
                'VM Message Groups',
            ],
            'Containers / Queues' => [
                'Settings Containers',
                'IP Lists',
                'Queue Groups',
            ],
        ];

        $sections = '';

        foreach ($groups as $groupTitle => $labels) {
            $items = '';

            foreach ($labels as $label) {
                if (!empty($links[$label])) {
                    $items .= self::card($label, $links[$label]);
                }
            }

            if ($items !== '') {
                $sections .= '
                <section class="ui-admin-section">
                    <h3>' . htmlspecialchars($groupTitle) . '</h3>
                    <div class="ui-admin-grid">
                        ' . $items . '
                    </div>
                </section>';
            }
        }

        return '
<div class="ui-page">
    <div class="ui-card ui-admin-page">
        <div class="ui-card-head">
            <div>
                <h2>Admin</h2>
                <p>VICIdial administration tools</p>
            </div>
        </div>

        ' . $sections . '
    </div>
</div>';
    }

    private static function extractAdminLinks($html)
    {
        if (!class_exists('DOMDocument')) {
            return [];
        }

        $wanted = self::wantedLabels();

        $dom = new \DOMDocument('1.0', 'UTF-8');

        libxml_use_internal_errors(true);
        $loaded = $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
        libxml_clear_errors();

        if (!$loaded) {
            return [];
        }

        $found = [];

        foreach ($dom->getElementsByTagName('a') as $a) {
            $label = trim(preg_replace('/\s+/', ' ', $a->textContent));
            $href  = trim($a->getAttribute('href'));

            if ($label === '' || $href === '') {
                continue;
            }

            $norm = self::norm($label);

            if (!isset($wanted[$norm])) {
                continue;
            }

            $canonical = $wanted[$norm];

            if (isset($found[$canonical])) {
                continue;
            }

            if (strpos($href, 'http') !== 0 && strpos($href, '/') !== 0) {
                $href = '/vicidial/' . ltrim($href, '/');
            }

            $found[$canonical] = $href;
        }

        return $found;
    }

    private static function wantedLabels()
    {
        $labels = [
            'Call Times',
            'Shifts',
            'Phones',
            'Templates',
            'Carriers',
            'Servers',
            'Conferences',
            'System Settings',
            'Agent Screen Labels',
            'Screen Colors',
            'System Statuses',
            'Status Groups',
            'CID Groups',
            'Voicemail',
            'Audio Store',
            'Music On Hold',
            'VM Message Groups',
            'Settings Containers',
            'IP Lists',
            'Queue Groups',
        ];

        $map = [];

        foreach ($labels as $label) {
            $map[self::norm($label)] = $label;
        }

        // common VICIdial text variations
        $map[self::norm('Screen Labels')] = 'Agent Screen Labels';
        $map[self::norm('Music OnHold')] = 'Music On Hold';
        $map[self::norm('MOH')] = 'Music On Hold';
        $map[self::norm('VM Groups')] = 'VM Message Groups';

        return $map;
    }

    private static function norm($text)
    {
        $text = strtoupper(html_entity_decode($text));
        $text = preg_replace('/[^A-Z0-9]+/', '', $text);
        return $text;
    }

    private static function card($label, $url)
    {
        return '
        <a class="ui-admin-tile" href="' . htmlspecialchars($url) . '">
            <span class="ui-admin-tile-icon">' . htmlspecialchars(self::icon($label)) . '</span>
            <span class="ui-admin-tile-text">
                <strong>' . htmlspecialchars($label) . '</strong>
                <em>' . htmlspecialchars(self::description($label)) . '</em>
            </span>
        </a>';
    }

    private static function icon($label)
    {
        $map = [
            'Call Times'          => '⏱',
            'Shifts'              => '👥',
            'Phones'              => '☎',
            'Templates'           => '▣',
            'Carriers'            => '⇄',
            'Servers'             => '▤',
            'Conferences'         => '♟',
            'System Settings'     => '⚙',
            'Agent Screen Labels' => '🖥',
            'Screen Colors'       => '◈',
            'System Statuses'     => '☷',
            'Status Groups'       => '▦',
            'CID Groups'          => '#',
            'Voicemail'           => '∞',
            'Audio Store'         => '▧',
            'Music On Hold'       => '♫',
            'VM Message Groups'   => '✉',
            'Settings Containers' => '⚱',
            'IP Lists'            => '▤',
            'Queue Groups'        => '☷',
        ];

        return $map[$label] ?? '›';
    }

    private static function description($label)
    {
        $map = [
            'Call Times'          => 'Manage dialable time windows',
            'Shifts'              => 'Agent shift definitions',
            'Phones'              => 'Phone extensions and logins',
            'Templates'           => 'Reusable admin templates',
            'Carriers'            => 'Carrier and trunk settings',
            'Servers'             => 'VICIdial server records',
            'Conferences'         => 'Conference room settings',
            'System Settings'     => 'Global system configuration',
            'Agent Screen Labels' => 'Agent UI label overrides',
            'Screen Colors'       => 'Legacy color settings',
            'System Statuses'     => 'Call status definitions',
            'Status Groups'       => 'Grouped call statuses',
            'CID Groups'          => 'Caller ID group settings',
            'Voicemail'           => 'Voicemail administration',
            'Audio Store'         => 'Audio file storage',
            'Music On Hold'       => 'Music on hold files',
            'VM Message Groups'   => 'Voicemail message groups',
            'Settings Containers' => 'Reusable setting containers',
            'IP Lists'            => 'Allowed and blocked IP lists',
            'Queue Groups'        => 'Queue group administration',
        ];

        return $map[$label] ?? 'Open admin tool';
    }
}
