<?php
namespace ViciUI;

require_once __DIR__ . '/PageActions.php';

class Users
{
    public static function render($html)
    {
        $table = self::extractUsersTable($html);

        if ($table === false) {
            return false;
        }

        return '
<div class="ui-page">
    <div class="ui-card">
        <div class="ui-card-head">
            <div>
                <h2>Users</h2>
                <p>VICIdial user listings</p>
            </div>
        </div>

        ' . PageActions::render('users') . '

        <div class="ui-table-wrap ui-users-table">
            ' . $table . '
        </div>
    </div>
</div>';
    }

    private static function extractUsersTable($html)
    {
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

        $tables = $dom->getElementsByTagName('table');

        $best = null;
        $bestLength = PHP_INT_MAX;

        foreach ($tables as $table) {
            $text = trim(preg_replace('/\s+/', ' ', $table->textContent));

            if (
                stripos($text, 'USER LISTINGS') !== false &&
                stripos($text, 'USER ID') !== false &&
                stripos($text, 'FULL NAME') !== false
            ) {
                $length = strlen($text);

                if ($length < $bestLength) {
                    $best = $table;
                    $bestLength = $length;
                }
            }
        }

        if (!$best) {
            return false;
        }

        return self::clean($dom->saveHTML($best));
    }

    private static function clean($html)
    {
        // Remove quoted and unquoted VICIdial presentational attributes.
        $html = preg_replace('/\s(bgcolor|background|border|cellpadding|cellspacing)=("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);

        // Replace old font tags with spans so CSS controls colors/fonts.
        $html = preg_replace('/<font\b[^>]*>/i', '<span>', $html);
        $html = str_ireplace('</font>', '</span>', $html);

        // Remove inline color styles that fight the new UI.
        $html = preg_replace('/\sstyle=("|\')[^"\']*(color|background-color)\s*:[^"\']*("|\')/i', '', $html);

        return $html;
    }
}
