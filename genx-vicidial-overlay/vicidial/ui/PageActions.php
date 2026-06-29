<?php
namespace ViciUI;

class PageActions
{
    public static function render($key)
    {
        $actions = self::actions($key);

        if (empty($actions)) {
            return '';
        }

        $html = '<div class="ui-page-actions">';

        foreach ($actions as $action) {
            $primary = !empty($action['primary']) ? ' primary' : '';
            $target  = !empty($action['target']) ? ' target="' . htmlspecialchars($action['target']) . '"' : '';

            $html .= '<a class="ui-action-pill' . $primary . '" href="' . htmlspecialchars($action['url']) . '"' . $target . '>'
                . htmlspecialchars($action['label']) .
            '</a>';
        }

        $html .= '</div>';

        return $html;
    }

    private static function actions($key)
    {
        $map = [

            'admin_back' => [
                ['label' => 'Back To Admin', 'url' => '/vicidial/admin.php?ADD=999998', 'primary' => true],
            ],

            'users' => [
                ['label' => 'Show Users',       'url' => '/vicidial/admin.php?ADD=0A', 'primary' => true],
                ['label' => 'Add User',        'url' => '/vicidial/admin.php?ADD=1'],
                ['label' => 'Copy User',       'url' => '/vicidial/admin.php?ADD=1A'],
                ['label' => 'Search User',      'url' => '/vicidial/admin.php?ADD=550'],
                ['label' => 'User Stats',       'url' => '/vicidial/user_stats.php'],
                ['label' => 'User Status',      'url' => '/vicidial/user_status.php'],
                ['label' => 'Time Sheet',       'url' => '/vicidial/AST_agent_time_sheet.php'],
            ],

            'campaigns' => [
                ['label' => 'Show Campaigns',     'url' => '/vicidial/admin.php?ADD=10', 'primary' => true],
                ['label' => 'Add Campaign',       'url' => '/vicidial/admin.php?ADD=11'],
                ['label' => 'Copy Campaign',      'url' => '/vicidial/admin.php?ADD=12'],
                ['label' => 'Campaign Statuses',  'url' => '/vicidial/admin.php?ADD=32'],
            ],

            'lists' => [
                ['label' => 'Show Lists', 'url' => '/vicidial/admin.php?ADD=100', 'primary' => true],
                ['label' => 'Add List',   'url' => '/vicidial/admin.php?ADD=111'],
            ],

            'ingroups' => [
                ['label' => 'Show In-Groups', 'url' => '/vicidial/admin.php?ADD=1000', 'primary' => true],
                ['label' => 'Add In-Group',   'url' => '/vicidial/admin.php?ADD=1111'],
                ['label' => 'Copy In-Group',  'url' => '/vicidial/admin.php?ADD=1211'],
            ],

            'dids' => [
                ['label' => 'Show DIDs', 'url' => '/vicidial/admin.php?ADD=1300', 'primary' => true],
                ['label' => 'Add DID',   'url' => '/vicidial/admin.php?ADD=1311'],
                ['label' => 'Copy DID',  'url' => '/vicidial/admin.php?ADD=1411'],
            ],

            'scripts' => [
                ['label' => 'Show Scripts', 'url' => '/vicidial/admin.php?ADD=1000000', 'primary' => true],
                ['label' => 'Add Script',   'url' => '/vicidial/admin.php?ADD=1111111'],
            ],

            'remoteagents' => [
                ['label' => 'Show Remote Agents', 'url' => '/vicidial/admin.php?ADD=10000', 'primary' => true],
                ['label' => 'Add Remote Agents',  'url' => '/vicidial/admin.php?ADD=11111'],
            ],

            'phones' => [
                ['label' => 'Show Phones',       'url' => '/vicidial/admin.php?ADD=10000000000', 'primary' => true],
                ['label' => 'Add Phone',         'url' => '/vicidial/admin.php?ADD=11111111111'],
                ['label' => 'Copy Phone',        'url' => '/vicidial/admin.php?ADD=12222222222'],
                ['label' => 'Phone Alias List',  'url' => '/vicidial/admin.php?ADD=12000000000'],
                ['label' => 'Add Phone Alias',  'url' => '/vicidial/admin.php?ADD=12111111111'],
                ['label' => 'Group Alias List',  'url' => '/vicidial/admin.php?ADD=13000000000'],
                ['label' => 'Add Group Alias',  'url' => '/vicidial/admin.php?ADD=13111111111'],
            ],

            'usergroups' => [
                ['label' => 'Show User Groups', 'url' => '/vicidial/admin.php?ADD=100000', 'primary' => true],
                ['label' => 'Add User Group',   'url' => '/vicidial/admin.php?ADD=111111'],
                ['label' => 'Group Hourly',     'url' => '/vicidial/AST_user_group_hourly_detail.php'],
                ['label' => 'Group Hourly v2',  'url' => '/vicidial/AST_user_group_hourly_detail_v2.php'],
            ],
        ];

        return $map[$key] ?? [];
    }
}
