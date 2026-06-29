<?php
namespace ViciUI;

/**
 * Report wrapper for standalone VICIdial report scripts.
 *
 * Realtime and legacy reports are fragile: DOMDocument reserialization can
 * break refresh scripts and form controls. This renderer strips only the stock
 * navigation chrome and otherwise keeps report markup in original order.
 */
class ReportPage
{
    public static function render($html)
    {
        $body = self::body($html);
        if ($body === false) {
            return false;
        }

        $title = self::title($html);

        return '
<div class="ui-page ui-report-page">
    <div class="ui-card">
        <div class="ui-card-head">
            <div>
                <h2>' . htmlspecialchars($title) . '</h2>
                <p>VICIdial reporting and live operational data</p>
            </div>
        </div>
        <div class="ui-report-wrap">' . $body . '</div>
    </div>
</div>';
    }

    public static function title($html)
    {
        $title = '';
        if (preg_match('/<title\b[^>]*>(.*?)<\/title>/is', $html, $match)) {
            $title = trim(html_entity_decode(strip_tags($match[1])));
        }
        if ($title === '' || strcasecmp($title, 'VICIdial') === 0) {
            if (preg_match('/<(?:h1|h2|h3|b)\b[^>]*>(.*?)<\/(?:h1|h2|h3|b)>/is', $html, $match)) {
                $title = trim(html_entity_decode(strip_tags($match[1])));
            }
        }
        $title = preg_replace('/\s*:\s*ALL(?:-| )ACTIVE\s*$/i', '', $title);
        $title = preg_replace('/\s+/', ' ', $title);
        return $title !== '' ? $title : 'Reports';
    }

    private static function body($html)
    {
        // Preserve the stock report body exactly. DOM reserialization breaks
        // realtime refresh and control behavior in legacy VICIdial markup.
        return self::bodyByPattern($html);
    }

    private static function removeLegacyNavigation(\DOMDocument $dom)
    {
        $tables = [];
        foreach ($dom->getElementsByTagName('table') as $table) {
            $tables[] = $table;
        }

        foreach ($tables as $table) {
            $text = strtoupper(trim(preg_replace('/\s+/', ' ', $table->textContent ?? '')));
            $score = 0;
            foreach (['REPORTS', 'USERS', 'CAMPAIGNS', 'LISTS', 'SCRIPTS', 'FILTERS', 'INBOUND', 'USER GROUPS', 'REMOTE AGENTS', 'ADMIN'] as $label) {
                if (strpos($text, $label) !== false) {
                    $score++;
                }
            }
            if ($score >= 7 && strlen($text) < 600 && $table->parentNode) {
                $table->parentNode->removeChild($table);
                break;
            }
        }
    }

    private static function bodyByPattern($html)
    {
        if (!preg_match('/<body\b[^>]*>(.*?)<\/body>/is', $html, $match)) {
            if (preg_match('/<body\b[^>]*>(.*)$/is', $html, $match)) {
                $body = $match[1];
            } else {
                $body = preg_replace('/^.*?<head\b[^>]*>.*?<\/head>/is', '', $html, 1);
                $body = preg_replace('/^\s*<!doctype\b[^>]*>/is', '', $body, 1);
                $body = preg_replace('/^\s*<html\b[^>]*>/is', '', $body, 1);
            }
        } else {
            $body = $match[1];
        }

        // Remove only the stock top navigation table; leave every report
        // script and legacy element in its original byte order.
        $body = preg_replace(
            '/^\s*<table\b(?=.{0,5000}System logo).*?<\/table>/is',
            '',
            $body,
            1
        );
        $body = preg_replace(
            '/<table\b[^>]*>[\s\S]{0,2000}\bHOME\b[\s\S]{0,2000}\bLOGOUT\b[\s\S]*?<\/table>/i',
            '',
            $body,
            1
        );
        $body = self::removeLegacyNavTableByPattern($body);

        $body = preg_replace('/<\/body>\s*<\/html>\s*$/is', '', $body, 1);
        $body = preg_replace('/<\/html>\s*$/is', '', $body, 1);

        return trim($body) !== '' ? $body : false;
    }

    private static function removeLegacyNavTableByPattern($body)
    {
        $removed = 0;

        return preg_replace_callback('/<table\b.*?<\/table>/is', function ($match) use (&$removed) {
            if ($removed >= 3) {
                return $match[0];
            }

            $text = strtoupper(trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($match[0])))));
            $mainNavScore = 0;
            $topNavScore = 0;
            $userNavScore = 0;

            foreach (['REPORTS', 'USERS', 'CAMPAIGNS', 'LISTS', 'SCRIPTS', 'FILTERS', 'INBOUND', 'USER GROUPS', 'REMOTE AGENTS', 'ADMIN'] as $label) {
                if (strpos($text, $label) !== false) {
                    $mainNavScore++;
                }
            }

            foreach (['HOME', 'TIMECLOCK', 'CHAT', 'LOGOUT'] as $label) {
                if (strpos($text, $label) !== false) {
                    $topNavScore++;
                }
            }

            foreach (['USER STATS', 'USER STATUS', 'TIME SHEET', 'DAYS STATUS'] as $label) {
                if (strpos($text, $label) !== false) {
                    $userNavScore++;
                }
            }

            if (strlen($text) < 1000 && ($mainNavScore >= 7 || $topNavScore >= 3 || $userNavScore >= 3)) {
                $removed++;
                return '';
            }

            return $match[0];
        }, $body, 5);
    }
}
