<?php
namespace ViciUI;

require_once __DIR__ . '/Navigation.php';

class Layout
{
    /**
     * Render the modern admin/report shell around stock VICIdial content.
     *
     * Page-specific renderers prepare $content before it reaches this method.
     * Keep this class focused on shared chrome only: sidebar, topbar, assets
     * and the content slot. Stock VICIdial files are not edited.
     */
    public static function render($content, $page, $headAssets = '', $sectionTitle = 'Administration', $documentTitle = 'VICIdial')
    {
        if ($page === 'realtime') {
            $sectionTitle = 'Real-Time Report';
        }

        return '<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>' . htmlspecialchars($documentTitle) . '</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
' . $headAssets . '
<link rel="stylesheet" href="/vicidial/ui/assets/css/ui.css?v=12">
<link rel="stylesheet" href="/vicidial/ui/assets/css/theme.css?v=33">

<style id="genx-critical-paint">
html,
body {
  background: #08111f !important;
  color-scheme: dark;
}
</style>

</head>
<body data-ui-page="' . htmlspecialchars($page) . '">
<div class="ui-app">

    <aside class="ui-sidebar">
        <div class="ui-brand-row">
            <div class="ui-brand">VICIdial</div>
            <button type="button" class="ui-sidebar-toggle" id="uiSidebarToggle">☰</button>
        </div>

        ' . Navigation::render($page) . '
    </aside>

    <main class="ui-main">
        <header class="ui-topbar">
            <div>
                <div class="ui-title">' . htmlspecialchars($sectionTitle) . '</div>
            </div>

            <div class="ui-toplinks">
                <a href="/vicidial/admin.php?ADD=0">Home</a>
                <a href="/agc/timeclock.php">Timeclock</a>
                <a href="/vicidial/admin.php?force_logout=1">Logout</a>
            </div>
        </header>

        <section class="ui-content">
            ' . $content . '
        </section>
    </main>

</div>

<script src="/vicidial/help.js?v=genx1"></script>
    <script src="/vicidial/ui/assets/js/ui.js?v=21"></script>

<!-- Stock VICIdial help.js target -->
<div id="HelpDisplayDiv" style="display:none; position:absolute; z-index:1000001;"></div>

</body>
</html>';
    }
}
