<?php
namespace ViciUI;

/**
 * Modern overlay navigation for VICIdial admin/report pages.
 *
 * Keep this file simple and data-driven:
 * - label: visible menu text
 * - url: stock VICIdial route to open
 * - page: internal active-state key used by Layout/Transformer
 * - icon: short ASCII-safe label; avoid special characters so future shell
 *   editing does not corrupt the file encoding.
 */
class Navigation
{
    public static function items()
    {
        return [
            [
                'label' => 'Dashboard',
                'url'   => '/vicidial/admin.php?ADD=0',
                'page'  => 'dashboard',
                'icon'  => 'DB',
            ],
            [
                'label' => 'Operations',
                'icon'  => 'OP',
                'items' => [
                    ['label' => 'Realtime', 'url' => '/vicidial/realtime_report.php?report_display_type=HTML', 'page' => 'realtime', 'icon' => 'RT'],
                    ['label' => 'Reports',  'url' => '/vicidial/admin.php?ADD=999999', 'page' => 'reports', 'icon' => 'RP'],
                ],
            ],
            [
                'label' => 'Call Center',
                'icon'  => 'CC',
                'items' => [
                    ['label' => 'Campaigns', 'url' => '/vicidial/admin.php?ADD=10', 'page' => 'campaigns', 'icon' => 'CP'],
                    ['label' => 'Lists',     'url' => '/vicidial/admin.php?ADD=100', 'page' => 'lists', 'icon' => 'LI'],
                    ['label' => 'In-Groups', 'url' => '/vicidial/admin.php?ADD=1000', 'page' => 'ingroups', 'icon' => 'IG'],
                    ['label' => 'DIDs',      'url' => '/vicidial/admin.php?ADD=1300', 'page' => 'dids', 'icon' => 'DI'],
                    ['label' => 'Scripts',   'url' => '/vicidial/admin.php?ADD=1000000', 'page' => 'scripts', 'icon' => 'SC'],
                    ['label' => 'Carriers',  'url' => '/vicidial/admin.php?ADD=140000000000', 'page' => 'carriers', 'icon' => 'CA'],
                ],
            ],
            [
                'label' => 'Administration',
                'icon'  => 'AD',
                'items' => [
                    ['label' => 'Users',         'url' => '/vicidial/admin.php?ADD=0A', 'page' => 'users', 'icon' => 'US'],
                    ['label' => 'User Groups',   'url' => '/vicidial/admin.php?ADD=100000', 'page' => 'usergroups', 'icon' => 'UG'],
                    ['label' => 'Remote Agents', 'url' => '/vicidial/admin.php?ADD=10000', 'page' => 'remoteagents', 'icon' => 'RA'],
                    ['label' => 'Phones',        'url' => '/vicidial/admin.php?ADD=10000000000', 'page' => 'phones', 'icon' => 'PH'],
                    ['label' => 'Admin',         'url' => '/vicidial/admin.php?ADD=999998', 'page' => 'admin', 'icon' => 'AD'],
                ],
            ],
        ];
    }

    public static function render($activePage)
    {
        $html = '<nav class="ui-nav">';

        foreach (self::items() as $item) {
            $html .= isset($item['items'])
                ? self::group($item, $activePage)
                : self::link($item, $activePage);
        }

        return $html . '</nav>';
    }

    private static function group(array $group, $activePage)
    {
        $open = self::groupHasActive($group, $activePage) ? ' open' : '';

        $html = '<div class="ui-nav-group' . $open . '">
            <button type="button" class="ui-nav-group-title">
                <span class="ui-nav-icon">' . htmlspecialchars($group['icon']) . '</span>
                <span class="ui-nav-text">' . htmlspecialchars($group['label']) . '</span>
                <span class="ui-nav-arrow">&gt;</span>
            </button>
            <div class="ui-nav-sub">';

        foreach ($group['items'] as $item) {
            $html .= self::link($item, $activePage, true);
        }

        return $html . '</div></div>';
    }

    private static function link(array $item, $activePage, $child = false)
    {
        $active = (($item['page'] ?? '') === $activePage) ? ' active' : '';
        $childClass = $child ? ' child' : '';

        return '<a class="ui-nav-item' . $childClass . $active . '" href="' . htmlspecialchars($item['url']) . '">
            <span class="ui-nav-icon">' . htmlspecialchars($item['icon']) . '</span>
            <span class="ui-nav-text">' . htmlspecialchars($item['label']) . '</span>
        </a>';
    }

    private static function groupHasActive(array $group, $activePage)
    {
        foreach ($group['items'] as $item) {
            if (($item['page'] ?? '') === $activePage) {
                return true;
            }
        }

        return false;
    }
}
