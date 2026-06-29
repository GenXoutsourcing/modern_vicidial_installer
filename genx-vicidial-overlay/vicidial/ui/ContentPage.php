<?php
namespace ViciUI;

require_once __DIR__ . '/PageActions.php';

class ContentPage
{
    public static function render($html, array $config)
    {
        $content = self::extractContent($html, $config);

        if ($content === false) {
            return false;
        }

        $title = $config['title'] ?? 'Page';
        $note = $config['note'] ?? '';
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

        <div class="ui-table-wrap ui-content-page">
            ' . $content . '
        </div>
    </div>
</div>';
    }

    private static function extractContent($html, array $config)
    {
        if (!class_exists('DOMDocument')) {
            return false;
        }

        $markers = $config['markers'] ?? [];

        $dom = new \DOMDocument('1.0', 'UTF-8');

        libxml_use_internal_errors(true);
        $loaded = $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
        libxml_clear_errors();

        if (!$loaded) {
            return false;
        }

        $tables = $dom->getElementsByTagName('table');

        $best = null;
        $bestScore = -999999;
        $bestLength = 0;

        foreach ($tables as $table) {
            $text = trim(preg_replace('/\s+/', ' ', $table->textContent));

            if ($text === '') {
                continue;
            }

            $score = 0;

            foreach ($markers as $marker) {
                if (stripos($text, $marker) !== false) {
                    $score += 20;
                }
            }

            foreach ([
                'Reports',
                'Users',
                'Campaigns',
                'Lists',
                'Scripts',
                'Filters',
                'VERSION:',
                'Timeclock',
                'Logout',
            ] as $bad) {
                if (stripos($text, $bad) !== false) {
                    $score -= 10;
                }
            }

            $length = strlen($text);

            if ($score > $bestScore || ($score === $bestScore && $length > $bestLength)) {
                $best = $table;
                $bestScore = $score;
                $bestLength = $length;
            }
        }

        if (!$best || $bestScore < 1) {
            return false;
        }

        return self::clean($dom->saveHTML($best));
    }

    private static function clean($html)
    {
        $html = preg_replace('/\s(bgcolor|background|border|cellpadding|cellspacing|width|height)=("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);

        $html = preg_replace('/<font\b[^>]*>/i', '<span>', $html);
        $html = str_ireplace('</font>', '</span>', $html);

        $html = preg_replace('/\sstyle=("|\')[^"\']*(color|background-color|font-family|font-size)\s*:[^"\']*("|\')/i', '', $html);

        return $html;
    }
}
