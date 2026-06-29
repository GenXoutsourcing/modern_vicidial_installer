<?php
namespace ViciUI;

require_once __DIR__ . '/Layout.php';
require_once __DIR__ . '/Navigation.php';
require_once __DIR__ . '/Dashboard.php';
require_once __DIR__ . '/Users.php';
require_once __DIR__ . '/UserForm.php';
require_once __DIR__ . '/ListingPage.php';
require_once __DIR__ . '/FormPage.php';
require_once __DIR__ . '/ContentPage.php';
require_once __DIR__ . '/AdminPage.php';
require_once __DIR__ . '/GenericAdminPage.php';
require_once __DIR__ . '/PageActions.php';
require_once __DIR__ . '/ReportPage.php';

/**
 * Routes stock VICIdial admin/report HTML into the modern overlay shell.
 *
 * This class should decide "what kind of page is this?" and then delegate to
 * the smallest renderer that can safely preserve stock VICIdial behavior.
 * Be conservative: unknown POST results and background refreshes should pass
 * through raw rather than being incorrectly wrapped.
 */
class Transformer
{
    public static function handle($html)
    {
        // GENX raw help bypass: let browser JS fetch original VICIdial HTML for help text.
        if (!empty($_GET['GENX_RAW_HELP'])) {
            return $html;
        }

        // GENX early hard route: User Group form / submit result
        $genxEarlyText = strtoupper(html_entity_decode(strip_tags($html)));
        $genxEarlyText = preg_replace('/\\s+/', ' ', $genxEarlyText);

        if (
            strpos($genxEarlyText, 'FORCE TIMECLOCK LOGIN') !== false &&
            strpos($genxEarlyText, 'ALLOWED CAMPAIGNS') !== false &&
            strpos($genxEarlyText, 'GROUP SHIFTS') !== false &&
            strpos($genxEarlyText, 'AGENT STATUS VIEWABLE GROUPS') !== false
        ) {
            $content = FormPage::render($html, [
                'title'       => 'Modify User Group',
                'note'        => 'Modify VICIdial user group permissions and settings',
                'actions_key' => 'usergroups',
                'min_score'   => 1,
                'markers'     => [
                    'Group:',
                    'Description:',
                    'Force Timeclock Login',
                    'Allowed Campaigns',
                    'Group Shifts',
                    'Agent Status Viewable Groups',
                ],
            ]);

            if ($content !== false) {
                return Layout::render($content, 'usergroups', self::headAssets($html));
            }
        }

        if (!is_string($html) || trim($html) === '') {
            return $html;
        }

        // Realtime report refreshes parts of the page in-place. Those background
        // requests must stay raw; wrapping them injects a second full overlay
        // shell inside the live report and blocks the sidebar/navigation.
        if (self::isRealtimeReport() && self::isBackgroundBrowserRequest()) {
            return $html;
        }

        // Standalone report scripts do not pass through admin.php. Keep the
        // original report body and behavior, but present it in the overlay.
        if (self::isReportRequest($html)) {
            $content = ReportPage::render($html);

            if ($content !== false) {
                $page = self::isRealtimeReport() ? 'realtime' : 'reports';
                $sectionTitle = self::isRealtimeReport() ? 'Real-Time Report' : 'Reports';
                $title = ReportPage::title($html);

                return Layout::render($content, $page, self::headAssets($html), $sectionTitle, $title . ' | VICIdial');
            }
        }

        if (self::skipRequest()) {
            return $html;
        }

        $head = self::headAssets($html);
        $add  = self::requestAdd();

        // Unknown POST submits should remain stock instead of being misread as dashboard.
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && $add === '') {
            return $html;
        }

        // Content-priority route: user forms are easy to misclassify after submit.
        if (self::looksLikeUserForm($html)) {
            $content = UserForm::render($html);
            if ($content !== false) {
                return Layout::render($content, 'users', $head);
            }
        }

        // Reports index uses admin.php, but belongs to Operations.
        if ($add === '999999') {
            $content = GenericAdminPage::render($html, [
                'title' => 'Reports',
                'note'  => 'VICIdial reports and system statistics',
            ]);

            if ($content !== false) {
                return Layout::render($content, 'reports', $head, 'Reports', 'Reports | VICIdial');
            }
        }

        // Admin landing page.
        if ($add === '999998') {
            $content = AdminPage::render($html);
            if ($content !== false) {
                return Layout::render($content, 'admin', $head);
            }
        }

        // Direct routes by known ADD code: listings and add/copy pages.
        $page = self::detectPage($add);
        $direct = self::renderDirectPage($page, $html, $head);
        if ($direct !== false) {
            return $direct;
        }

        // Content-priority routes: submit/update results should stay in their section.
        $contentRoute = self::contentRouteConfig($html);
        if ($contentRoute !== false) {
            $content = FormPage::render($html, $contentRoute);
            if ($content !== false) {
                return Layout::render($content, $contentRoute['nav'] ?? 'dashboard', $head);
            }

            // Fallback for result pages that are not normal forms.
            $content = GenericAdminPage::render($html, [
                'title'       => $contentRoute['title'],
                'note'        => $contentRoute['note'],
                'actions_key' => $contentRoute['actions_key'],
            ]);
            if ($content !== false) {
                return Layout::render($content, $contentRoute['nav'] ?? 'dashboard', $head);
            }
        }

        // Older modify pages without stable ADD mappings.
        $autoForm = self::autoFormConfig($html);
        if ($autoForm !== false) {
            $content = FormPage::render($html, $autoForm);
            if ($content !== false) {
                return Layout::render($content, $autoForm['nav'] ?? 'dashboard', $head);
            }
        }

        // Admin subpages: keep inside shell with Back to Admin and action pills.
        $adminConfig = self::adminSubpageConfig($html);
        if ($adminConfig !== false) {
            $content = GenericAdminPage::render($html, $adminConfig);
            if ($content !== false) {
                return Layout::render($content, 'admin', $head);
            }
        }

        // Final safety net: any remaining admin.php ADD page stays inside shell.
        if ($add !== '' && $add !== '999998') {
            $content = GenericAdminPage::render($html);
            if ($content !== false) {
                return Layout::render($content, 'admin', $head);
            }
        }

        return $html;
    }

    private static function renderDirectPage($page, $html, $head)
    {
        if ($page === 'dashboard') {
            return Layout::render(Dashboard::render($html), 'dashboard', $head);
        }

        if ($page === 'users') {
            $content = Users::render($html);
            return $content === false ? false : Layout::render($content, 'users', $head);
        }

        if ($page === 'user_form') {
            $content = UserForm::render($html);
            return $content === false ? false : Layout::render($content, 'users', $head);
        }

        $listingConfigs = self::listingConfigs();
        if (isset($listingConfigs[$page])) {
            $content = ListingPage::render($html, $listingConfigs[$page]);
            return $content === false ? false : Layout::render($content, $listingConfigs[$page]['nav'], $head);
        }

        $formConfigs = self::formConfigs();
        if (isset($formConfigs[$page])) {
            $content = FormPage::render($html, $formConfigs[$page]);
            return $content === false ? false : Layout::render($content, $formConfigs[$page]['nav'], $head);
        }

        return false;
    }

    private static function listingConfigs()
    {
        return [
            'campaigns' => [
                'nav' => 'campaigns', 'title' => 'Campaigns', 'actions_key' => 'campaigns',
                'note' => 'VICIdial campaign listings', 'refresh_url' => '/vicidial/admin.php?ADD=10',
                'markers' => ['CAMPAIGN LISTINGS', 'CAMPAIGN ID', 'CAMPAIGN NAME'],
            ],
            'lists' => [
                'nav' => 'lists', 'title' => 'Lists', 'actions_key' => 'lists',
                'note' => 'VICIdial list listings', 'refresh_url' => '/vicidial/admin.php?ADD=100',
                'markers' => ['LIST LISTINGS', 'LIST ID', 'LIST NAME'],
            ],
            'usergroups' => [
                'nav' => 'usergroups', 'title' => 'User Groups', 'actions_key' => 'usergroups',
                'note' => 'VICIdial user group listings', 'refresh_url' => '/vicidial/admin.php?ADD=100000',
                'markers' => ['USER GROUPS LISTINGS', 'USER GROUP', 'GROUP NAME', 'FORCE TIMECLOCK'],
            ],
            'scripts' => [
                'nav' => 'scripts', 'title' => 'Scripts', 'actions_key' => 'scripts',
                'note' => 'VICIdial script listings', 'refresh_url' => '/vicidial/admin.php?ADD=1000000',
                'markers' => ['SCRIPT LISTINGS', 'SCRIPT ID', 'SCRIPT NAME'],
            ],
            'phones' => [
                'nav' => 'phones', 'title' => 'Phones', 'actions_key' => 'phones',
                'note' => 'VICIdial phone listings', 'refresh_url' => '/vicidial/admin.php?ADD=10000000000',
                'markers' => ['PHONE LISTINGS', 'EXTEN', 'PROTO', 'DIAL PLAN', 'VMAIL', 'LINKS'],
            ],
            'ingroups' => [
                'nav' => 'ingroups', 'title' => 'In-Groups', 'actions_key' => 'ingroups',
                'note' => 'VICIdial inbound group listings', 'refresh_url' => '/vicidial/admin.php?ADD=1000',
                'markers' => ['IN-GROUP LISTINGS', 'IN-GROUPS LISTINGS', 'INBOUND GROUP LISTINGS', 'INBOUND GROUPS LISTINGS', 'GROUP ID', 'GROUP NAME', 'ACTIVE'],
            ],
            'dids' => [
                'nav' => 'dids', 'title' => 'Inbound DIDs', 'actions_key' => 'dids',
                'note' => 'VICIdial inbound DID listings', 'refresh_url' => '/vicidial/admin.php?ADD=1300',
                'markers' => ['DID LISTINGS', 'DIDS LISTINGS', 'DID', 'DID DESCRIPTION', 'DID ROUTE', 'ACTIVE'],
            ],
            'carriers' => [
                'nav' => 'carriers', 'title' => 'Carriers', 'actions_key' => '',
                'note' => 'VICIdial carrier and trunk listings', 'refresh_url' => '/vicidial/admin.php?ADD=140000000000',
                'markers' => ['CARRIER LISTINGS', 'CARRIER ID', 'CARRIER NAME', 'SERVER IP', 'PROTOCOL', 'REGISTRATION', 'ACTIVE'],
            ],
            'remoteagents' => [
                'nav' => 'remoteagents', 'title' => 'Remote Agents', 'actions_key' => 'remoteagents',
                'note' => 'VICIdial remote agent listings', 'refresh_url' => '/vicidial/admin.php?ADD=10000',
                'markers' => ['REMOTE AGENTS LISTINGS', 'USER', 'LINES', 'SERVER', 'CONF-EXTEN', 'GROUP', 'STATUS', 'CAMPAIGN'],
            ],
            'phonealias_listing' => [
                'nav' => 'phones', 'title' => 'Phone Alias List', 'actions_key' => 'phones',
                'note' => 'Manage phone alias groups',
                'markers' => ['PHONE ALIAS LISTINGS', 'ALIAS ID', 'ALIAS NAME', 'PHONE LOGINS LIST', 'GROUP', 'MODIFY'],
            ],
            'groupalias_listing' => [
                'nav' => 'phones', 'title' => 'Group Alias List', 'actions_key' => 'phones',
                'note' => 'Manage group alias records',
                'markers' => ['GROUP ALIAS LISTINGS', 'GROUP ALIAS ID', 'GROUP ALIAS NAME', 'GROUP', 'MODIFY'],
            ],
        ];
    }

    private static function formConfigs()
    {
        return [
            'search_user' => [
                'nav' => 'users', 'title' => 'Search User', 'note' => 'Search VICIdial users',
                'actions_key' => 'users', 'min_score' => 1,
                'markers' => ['SEARCH FOR A USER', 'SEARCH USERS', 'USER ID', 'FULL NAME', 'USER GROUP', 'ACTIVE', 'USER LEVEL'],
            ],
            'usergroup_add_form' => [
                'nav' => 'usergroups', 'title' => 'Add User Group', 'note' => 'Create a new VICIdial user group',
                'actions_key' => 'usergroups', 'min_score' => 1,
                'markers' => ['ADD A NEW USER GROUP', 'USER GROUP', 'GROUP NAME', 'ADMIN VIEWABLE GROUPS', 'ALLOWED CAMPAIGNS', 'FORCED TIME CLOCK', 'GROUP SHIFTS', 'API ONLY USER', 'AGENT STATUS VIEW'],
            ],
            'usergroup_modify_form' => [
                'nav' => 'usergroups', 'title' => 'Modify User Group', 'note' => 'Modify VICIdial user group permissions and settings',
                'actions_key' => 'usergroups', 'min_score' => 1,
                'markers' => ['USER GROUP', 'GROUP NAME', 'ADMIN VIEWABLE GROUPS', 'ALLOWED CAMPAIGNS', 'FORCED TIME CLOCK', 'GROUP SHIFTS', 'API ONLY USER', 'AGENT STATUS VIEW'],
            ],
            'remoteagents_form' => [
                'nav' => 'remoteagents', 'title' => 'Add Remote Agents', 'note' => 'Create VICIdial remote agent entries',
                'actions_key' => 'remoteagents',
                'markers' => ['ADD NEW REMOTE AGENTS', 'User Start', 'Number of Lines', 'Server IP', 'External Extension', 'Campaign'],
            ],
            'did_add_form' => [
                'nav' => 'dids', 'title' => 'Add DID', 'note' => 'Create a new inbound DID', 'actions_key' => 'dids',
                'markers' => ['ADD A NEW DID', 'DID Extension', 'DID Description', 'Admin User Group'],
            ],
            'did_copy_form' => [
                'nav' => 'dids', 'title' => 'Copy DID', 'note' => 'Create a new inbound DID by copying an existing DID', 'actions_key' => 'dids',
                'markers' => ['COPY DID', 'DID Extension', 'DID Description', 'Copy From', 'Source DID'],
            ],
            'ingroup_add_form' => [
                'nav' => 'ingroups', 'title' => 'Add In-Group', 'note' => 'Create a new inbound group', 'actions_key' => 'ingroups',
                'markers' => ['ADD A NEW IN-GROUP', 'Group ID', 'Group Name', 'Active'],
            ],
            'ingroup_copy_form' => [
                'nav' => 'ingroups', 'title' => 'Copy In-Group', 'note' => 'Create a new inbound group by copying an existing in-group', 'actions_key' => 'ingroups',
                'markers' => ['COPY IN-GROUP', 'Group ID', 'Group Name', 'Source In-Group', 'Copy From'],
            ],
            'campaign_add_form' => [
                'nav' => 'campaigns', 'title' => 'Add Campaign', 'note' => 'Create a new VICIdial campaign', 'actions_key' => 'campaigns',
                'markers' => ['ADD A NEW CAMPAIGN', 'Campaign ID', 'Campaign Name', 'Campaign Description', 'Active'],
            ],
            'campaign_copy_form' => [
                'nav' => 'campaigns', 'title' => 'Copy Campaign', 'note' => 'Create a new campaign by copying an existing campaign', 'actions_key' => 'campaigns',
                'markers' => ['COPY CAMPAIGN', 'Campaign ID', 'Campaign Name', 'Source Campaign', 'Copy From'],
            ],
            'list_add_form' => [
                'nav' => 'lists', 'title' => 'Add List', 'note' => 'Create a new VICIdial list', 'actions_key' => 'lists',
                'markers' => ['ADD A NEW LIST', 'List ID', 'List Name', 'Campaign', 'Active'],
            ],
            'script_add_form' => [
                'nav' => 'scripts', 'title' => 'Add Script', 'note' => 'Create a new VICIdial script', 'actions_key' => 'scripts',
                'markers' => ['ADD A NEW SCRIPT', 'Script ID', 'Script Name', 'Script Comments', 'Script Text', 'Active'],
            ],
            'phone_add_form' => [
                'nav' => 'phones', 'title' => 'Add Phone', 'note' => 'Create a new phone login / extension', 'actions_key' => 'phones',
                'markers' => ['ADD A NEW PHONE', 'Extension', 'Dial Plan Number', 'Server IP', 'Protocol', 'Registration Password', 'Active'],
            ],
            'phone_copy_form' => [
                'nav' => 'phones', 'title' => 'Copy Phone', 'note' => 'Create a new phone by copying an existing phone', 'actions_key' => 'phones',
                'markers' => ['COPY PHONE', 'Extension', 'Dial Plan Number', 'Server IP', 'Source Phone', 'Copy From'],
            ],
            'phonealias_add_form' => [
                'nav' => 'phones', 'title' => 'Add Phone Alias', 'note' => 'Create a new phone alias record', 'actions_key' => 'phones',
                'markers' => ['ADD A NEW PHONE ALIAS', 'Alias ID', 'Alias Name', 'Phone Logins List', 'User Group'],
            ],
            'groupalias_add_form' => [
                'nav' => 'phones', 'title' => 'Add Group Alias', 'note' => 'Create a new group alias record', 'actions_key' => 'phones',
                'markers' => ['ADD A NEW GROUP ALIAS', 'Group Alias ID', 'Group Alias Name', 'User Group', 'Campaign'],
            ],
        ];
    }

    private static function contentRouteConfig($html)
    {
        $text = self::normalizedText($html);
        $routes = [
            ['actions_key' => 'usergroups', 'nav' => 'usergroups', 'title' => 'Modify User Group', 'note' => 'Modify VICIdial user group permissions and settings', 'must' => ['USER GROUP', 'GROUP NAME'], 'any' => ['ADMIN VIEWABLE GROUPS', 'ALLOWED CAMPAIGNS', 'GROUP SHIFTS', 'FORCED TIME CLOCK'], 'markers' => ['USER GROUP', 'GROUP NAME', 'ADMIN VIEWABLE GROUPS', 'ALLOWED CAMPAIGNS', 'GROUP SHIFTS', 'FORCED TIME CLOCK']],
            ['actions_key' => 'campaigns', 'nav' => 'campaigns', 'title' => 'Campaign', 'note' => 'Modify VICIdial campaign settings', 'must' => ['CAMPAIGN ID', 'CAMPAIGN NAME'], 'any' => ['CAMPAIGN DESCRIPTION', 'DIAL METHOD', 'ACTIVE', 'HOPPER LEVEL'], 'markers' => ['CAMPAIGN ID', 'CAMPAIGN NAME', 'CAMPAIGN DESCRIPTION', 'DIAL METHOD', 'ACTIVE']],
            ['actions_key' => 'lists', 'nav' => 'lists', 'title' => 'List', 'note' => 'Modify VICIdial list settings', 'must' => ['LIST ID', 'LIST NAME'], 'any' => ['CAMPAIGN', 'ACTIVE', 'LIST DESCRIPTION'], 'markers' => ['LIST ID', 'LIST NAME', 'CAMPAIGN', 'ACTIVE']],
            ['actions_key' => 'ingroups', 'nav' => 'ingroups', 'title' => 'In-Group', 'note' => 'Modify inbound group settings', 'must' => ['GROUP ID', 'GROUP NAME'], 'any' => ['CALL TIME', 'ACTIVE', 'WEB FORM', 'NEXT AGENT CALL'], 'markers' => ['GROUP ID', 'GROUP NAME', 'CALL TIME', 'ACTIVE']],
            ['actions_key' => 'dids', 'nav' => 'dids', 'title' => 'DID', 'note' => 'Modify inbound DID settings', 'must' => ['DID EXTENSION'], 'any' => ['DID DESCRIPTION', 'DID ROUTE', 'ADMIN USER GROUP', 'ACTIVE'], 'markers' => ['DID EXTENSION', 'DID DESCRIPTION', 'DID ROUTE', 'ACTIVE']],
            ['actions_key' => 'scripts', 'nav' => 'scripts', 'title' => 'Script', 'note' => 'Modify VICIdial script settings', 'must' => ['SCRIPT ID', 'SCRIPT NAME'], 'any' => ['SCRIPT TEXT', 'SCRIPT COMMENTS', 'ACTIVE'], 'markers' => ['SCRIPT ID', 'SCRIPT NAME', 'SCRIPT TEXT', 'ACTIVE']],
            ['actions_key' => 'remoteagents', 'nav' => 'remoteagents', 'title' => 'Remote Agent', 'note' => 'Modify remote agent settings', 'must' => ['NUMBER OF LINES'], 'any' => ['USER START', 'SERVER IP', 'EXTERNAL EXTENSION', 'CAMPAIGN'], 'markers' => ['USER START', 'NUMBER OF LINES', 'SERVER IP', 'EXTERNAL EXTENSION', 'CAMPAIGN']],
            ['actions_key' => 'phones', 'nav' => 'phones', 'title' => 'Phone Alias', 'note' => 'Modify phone alias settings', 'must' => ['ALIAS ID'], 'any' => ['ALIAS NAME', 'PHONE LOGINS LIST', 'USER GROUP'], 'markers' => ['ALIAS ID', 'ALIAS NAME', 'PHONE LOGINS LIST', 'USER GROUP']],
            ['actions_key' => 'phones', 'nav' => 'phones', 'title' => 'Group Alias', 'note' => 'Modify group alias settings', 'must' => ['GROUP ALIAS ID'], 'any' => ['GROUP ALIAS NAME', 'USER GROUP', 'CAMPAIGN'], 'markers' => ['GROUP ALIAS ID', 'GROUP ALIAS NAME', 'USER GROUP', 'CAMPAIGN']],
            ['actions_key' => 'phones', 'nav' => 'phones', 'title' => 'Phone', 'note' => 'Modify phone login / extension settings', 'must' => ['EXTENSION', 'DIAL PLAN NUMBER'], 'any' => ['SERVER IP', 'PROTOCOL', 'REGISTRATION PASSWORD', 'ACTIVE'], 'markers' => ['EXTENSION', 'DIAL PLAN NUMBER', 'SERVER IP', 'PROTOCOL', 'ACTIVE']],
        ];

        foreach ($routes as $route) {
            if (self::textMatches($text, $route['must'], $route['any'])) {
                $route['min_score'] = 1;
                return $route;
            }
        }

        return false;
    }

    private static function autoFormConfig($html)
    {
        $text = self::normalizedText($html);
        $cases = [
            ['need_any' => ['MODIFY PHONE ALIAS', 'MODIFY A PHONE ALIAS'], 'title' => 'Modify Phone Alias', 'note' => 'Modify phone alias settings', 'actions_key' => 'phones', 'nav' => 'phones', 'markers' => ['MODIFY PHONE ALIAS', 'Alias ID', 'Alias Name', 'Phone Logins List', 'User Group']],
            ['need_any' => ['MODIFY GROUP ALIAS', 'MODIFY A GROUP ALIAS'], 'title' => 'Modify Group Alias', 'note' => 'Modify group alias settings', 'actions_key' => 'phones', 'nav' => 'phones', 'markers' => ['MODIFY GROUP ALIAS', 'Group Alias ID', 'Group Alias Name', 'User Group', 'Campaign']],
            ['need_any' => ['MODIFY A CAMPAIGN', 'MODIFY CAMPAIGN'], 'title' => 'Modify Campaign', 'note' => 'Modify VICIdial campaign settings', 'actions_key' => 'campaigns', 'nav' => 'campaigns', 'markers' => ['MODIFY A CAMPAIGN', 'Campaign ID', 'Campaign Name', 'Campaign Description', 'Active']],
            ['need_any' => ['MODIFY A LIST', 'MODIFY LIST'], 'title' => 'Modify List', 'note' => 'Modify VICIdial list settings', 'actions_key' => 'lists', 'nav' => 'lists', 'markers' => ['MODIFY A LIST', 'List ID', 'List Name', 'Campaign', 'Active']],
            ['need_any' => ['MODIFY AN IN-GROUP', 'MODIFY A IN-GROUP', 'MODIFY IN-GROUP'], 'title' => 'Modify In-Group', 'note' => 'Modify inbound group settings', 'actions_key' => 'ingroups', 'nav' => 'ingroups', 'markers' => ['MODIFY IN-GROUP', 'Group ID', 'Group Name', 'Active']],
            ['need_any' => ['MODIFY A DID', 'MODIFY DID'], 'title' => 'Modify DID', 'note' => 'Modify inbound DID settings', 'actions_key' => 'dids', 'nav' => 'dids', 'markers' => ['MODIFY DID', 'DID Extension', 'DID Description', 'DID Route', 'Active']],
            ['need_any' => ['MODIFY A SCRIPT', 'MODIFY SCRIPT'], 'title' => 'Modify Script', 'note' => 'Modify VICIdial script settings', 'actions_key' => 'scripts', 'nav' => 'scripts', 'markers' => ['MODIFY SCRIPT', 'Script ID', 'Script Name', 'Script Text', 'Active']],
            ['need_any' => ['MODIFY A PHONE', 'MODIFY PHONE'], 'title' => 'Modify Phone', 'note' => 'Modify phone login / extension settings', 'actions_key' => 'phones', 'nav' => 'phones', 'markers' => ['MODIFY PHONE', 'Extension', 'Dial Plan Number', 'Server IP', 'Protocol', 'Active']],
            ['need_any' => ['MODIFY REMOTE AGENT', 'MODIFY A REMOTE AGENT'], 'title' => 'Modify Remote Agent', 'note' => 'Modify remote agent settings', 'actions_key' => 'remoteagents', 'nav' => 'remoteagents', 'markers' => ['MODIFY REMOTE AGENT', 'User', 'Number of Lines', 'Server IP', 'External Extension', 'Campaign']],
            ['need_any' => ['MODIFY USER GROUP', 'MODIFY A USER GROUP'], 'title' => 'Modify User Group', 'note' => 'Modify user group settings', 'actions_key' => 'usergroups', 'nav' => 'usergroups', 'markers' => ['MODIFY USER GROUP', 'User Group', 'Group Name', 'Allowed Campaigns', 'Admin Viewable Groups']],
        ];

        foreach ($cases as $case) {
            foreach ($case['need_any'] as $needle) {
                if (strpos($text, strtoupper($needle)) !== false) {
                    unset($case['need_any']);
                    $case['min_score'] = 1;
                    return $case;
                }
            }
        }

        return false;
    }

    private static function adminSubpageConfig($html)
    {
        $text = self::normalizedText($html);
        $cases = [
            ['need_any' => ['SERVER LISTINGS:', 'SERVERS LISTINGS:', 'SERVER LISTINGS'], 'title' => 'Servers', 'note' => 'Manage VICIdial server records'],
            ['need_any' => ['CALL TIME LISTINGS:', 'CALL TIMES LISTINGS:', 'CALL TIME LISTINGS'], 'title' => 'Call Times', 'note' => 'Manage dialable time windows'],
            ['need_any' => ['SHIFT LISTINGS:', 'SHIFTS LISTINGS:', 'SHIFT LISTINGS'], 'title' => 'Shifts', 'note' => 'Manage agent shift definitions'],
            ['need_any' => ['CARRIER LISTINGS:', 'CARRIERS LISTINGS:', 'CARRIER LISTINGS'], 'title' => 'Carriers', 'note' => 'Manage carrier and trunk records'],
            ['need_any' => ['CONFERENCE LISTINGS:', 'CONFERENCES LISTINGS:', 'CONFERENCE LISTINGS'], 'title' => 'Conferences', 'note' => 'Manage conference room settings'],
            ['need_any' => ['SYSTEM SETTINGS:', 'MODIFY SYSTEM SETTINGS', 'SVN VERSION DB SCHEMA VERSION'], 'title' => 'System Settings', 'note' => 'Global VICIdial system configuration'],
            ['need_any' => ['SYSTEM STATUS LISTINGS:', 'SYSTEM STATUSES LISTINGS:', 'STATUS LISTINGS:'], 'title' => 'System Statuses', 'note' => 'Manage call status definitions'],
            ['need_any' => ['STATUS GROUP LISTINGS:', 'STATUS GROUPS LISTINGS:'], 'title' => 'Status Groups', 'note' => 'Manage grouped call statuses'],
            ['need_any' => ['CID GROUP LISTINGS:', 'CID GROUPS LISTINGS:'], 'title' => 'CID Groups', 'note' => 'Manage caller ID groups'],
            ['need_any' => ['QUEUE GROUP LISTINGS:', 'QUEUE GROUPS LISTINGS:'], 'title' => 'Queue Groups', 'note' => 'Manage queue group settings'],
            ['need_any' => ['IP LISTINGS:', 'IP LISTS LISTINGS:', 'IP LIST LISTINGS:'], 'title' => 'IP Lists', 'note' => 'Manage allowed and blocked IP lists'],
            ['need_any' => ['AUDIO STORE LISTINGS:', 'AUDIO STORE LISTING:'], 'title' => 'Audio Store', 'note' => 'Manage uploaded audio files'],
            ['need_any' => ['MUSIC ON HOLD LISTINGS:', 'MUSIC ON HOLD LISTING:'], 'title' => 'Music On Hold', 'note' => 'Manage music on hold entries'],
            ['need_any' => ['VOICEMAIL LISTINGS:', 'VOICEMAIL LISTING:'], 'title' => 'Voicemail', 'note' => 'Manage voicemail boxes'],
            ['need_any' => ['VM MESSAGE GROUP LISTINGS:', 'VM MESSAGE GROUPS LISTINGS:'], 'title' => 'VM Message Groups', 'note' => 'Manage voicemail message groups'],
            ['need_any' => ['SETTINGS CONTAINER LISTINGS:', 'SETTINGS CONTAINERS LISTINGS:'], 'title' => 'Settings Containers', 'note' => 'Manage reusable settings containers'],
            ['need_any' => ['TEMPLATE LISTINGS:', 'TEMPLATES LISTINGS:', 'TEMPLATE LISTINGS'], 'title' => 'Templates', 'note' => 'Manage admin templates'],
            ['need_any' => ['SCREEN COLOR LISTINGS:', 'SCREEN COLORS LISTINGS:'], 'title' => 'Screen Colors', 'note' => 'Manage legacy screen color settings'],
            ['need_any' => ['AGENT SCREEN LABEL LISTINGS:', 'SCREEN LABEL LISTINGS:'], 'title' => 'Agent Screen Labels', 'note' => 'Manage agent screen labels'],
        ];

        foreach ($cases as $case) {
            foreach ($case['need_any'] as $needle) {
                if (strpos($text, strtoupper($needle)) !== false) {
                    return [
                        'title' => $case['title'],
                        'note'  => $case['note'],
                        // Leave actions_key empty so GenericAdminPage extracts exact add/copy/list actions from the stock page.
                        'actions_key' => '',
                    ];
                }
            }
        }

        return false;
    }

    private static function detectPage($add)
    {
        if ($add === '' || $add === '0') return 'dashboard';

        $map = [
            '0A' => 'users', '1' => 'user_form', '1A' => 'user_form', '3' => 'user_form',
            '550' => 'search_user',
            '10' => 'campaigns', '11' => 'campaign_add_form', '12' => 'campaign_copy_form',
            '100' => 'lists', '111' => 'list_add_form',
            '100000' => 'usergroups', '111111' => 'usergroup_add_form', '311111' => 'usergroup_modify_form',
            '1000000' => 'scripts', '1111111' => 'script_add_form',
            '10000000000' => 'phones', '11111111111' => 'phone_add_form', '12222222222' => 'phone_copy_form',
            '12000000000' => 'phonealias_listing', '12111111111' => 'phonealias_add_form',
            '13000000000' => 'groupalias_listing', '13111111111' => 'groupalias_add_form',
            '1000' => 'ingroups', '1111' => 'ingroup_add_form', '1211' => 'ingroup_copy_form',
            '1300' => 'dids', '1311' => 'did_add_form', '1411' => 'did_copy_form',
            '140000000000' => 'carriers',
            '10000' => 'remoteagents', '11111' => 'remoteagents_form',
        ];

        return $map[$add] ?? 'default';
    }

    private static function looksLikeUserForm($html)
    {
        $text = self::normalizedText($html);
        return strpos($text, 'USER NUMBER') !== false
            && strpos($text, 'USER LEVEL') !== false
            && strpos($text, 'USER GROUP') !== false
            && strpos($text, 'PHONE LOGIN') !== false;
    }

    private static function textMatches($text, array $must, array $any)
    {
        foreach ($must as $needle) {
            if (strpos($text, strtoupper($needle)) === false) {
                return false;
            }
        }

        foreach ($any as $needle) {
            if (strpos($text, strtoupper($needle)) !== false) {
                return true;
            }
        }

        return false;
    }

    private static function normalizedText($html)
    {
        $text = strtoupper(html_entity_decode(strip_tags($html)));
        return preg_replace('/\s+/', ' ', $text);
    }

    private static function requestAdd()
    {
        if (isset($_REQUEST['ADD']) && $_REQUEST['ADD'] !== '') {
            return (string)$_REQUEST['ADD'];
        }

        $query = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY);
        if (!$query) {
            return '';
        }

        $params = [];
        parse_str($query, $params);
        return isset($params['ADD']) ? (string)$params['ADD'] : '';
    }

    private static function skipRequest()
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '';

        if (stripos($uri, '/vicidial/admin.php') === false) {
            return true;
        }

        foreach (['non_agent_api', 'AST_VD', 'csv', 'xls', 'xlsx', 'download', 'recording', 'audio', 'export', 'logout'] as $skip) {
            if (stripos($uri, $skip) !== false) {
                return true;
            }
        }

        return false;
    }

    private static function isReportRequest($html)
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        $path = parse_url($uri, PHP_URL_PATH) ?: '';
        $file = basename($path);

        if (stripos($path, '/vicidial/') === false || !preg_match('/\.php$/i', $file)) {
            return false;
        }

        if (strcasecmp($file, 'admin.php') === 0) {
            return false;
        }

        foreach (['export', 'download', 'recording', 'audio', '.csv', '.xls', '.xlsx'] as $skip) {
            if (stripos($uri, $skip) !== false || stripos($file, $skip) !== false) {
                return false;
            }
        }

        if (!preg_match('/(report|rpt|stats|detail|summary|status|performance|forecast|service_level|days_time|timeonvdad|time_sheet|timeclock)/i', $file)) {
            return false;
        }

        return stripos($html, '<body') !== false || stripos($html, '<html') !== false;
    }

    private static function isRealtimeReport()
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
        return stripos(basename($path), 'realtime_report') !== false;
    }

    private static function isBackgroundBrowserRequest()
    {
        $requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
        if (strcasecmp($requestedWith, 'XMLHttpRequest') === 0) {
            return true;
        }

        $fetchDest = strtolower($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '');
        if ($fetchDest !== '' && !in_array($fetchDest, ['document', 'iframe'], true)) {
            return true;
        }

        $accept = strtolower($_SERVER['HTTP_ACCEPT'] ?? '');
        if ($accept !== '' && strpos($accept, 'text/html') === false) {
            return true;
        }

        return false;
    }

    private static function headAssets($html)
    {
        $assets = '';

        if (preg_match('/<head[^>]*>(.*?)<\/head>/is', $html, $m)) {
            preg_match_all('/<script\b[^>]*>.*?<\/script>|<link\b[^>]*>|<style\b[^>]*>.*?<\/style>/is', $m[1], $matches);

            foreach ($matches[0] ?? [] as $tag) {
                if (stripos($tag, '/ui/') === false) {
                    $assets .= $tag . "\n";
                }
            }
        }

        return $assets;
    }
}
