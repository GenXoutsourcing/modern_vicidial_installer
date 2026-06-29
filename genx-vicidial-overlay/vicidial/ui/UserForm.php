<?php
namespace ViciUI;

require_once __DIR__ . '/PageActions.php';

class UserForm
{
    public static function render($html)
    {
        $form = self::extractUserForm($html);

        if ($form === false) {
            return false;
        }

        $mode = self::mode();
        if ($mode === 'add') {
            $title = 'Add User';
            $note  = 'Create a new VICIdial user';
        } elseif ($mode === 'copy') {
            $title = 'Copy User';
            $note  = 'Create a new VICIdial user by copying an existing user';
        } else {
            $title = 'User Record';
            $note  = 'Modify VICIdial user settings';
        }

        return '
<div class="ui-page">
    <div class="ui-card">
        <div class="ui-card-head">
            <div>
                <h2>' . htmlspecialchars($title) . '</h2>
                <p>' . htmlspecialchars($note) . '</p>
            </div>
        </div>

        ' . PageActions::render('users') . '

        <div class="ui-form-wrap ui-user-form">
            ' . $form . '
        </div>
    </div>
</div>';
    }

    private static function mode()
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '';

        if (stripos($uri, 'ADD=1A') !== false) {
            return 'copy';
        }

        if (preg_match('/[?&]ADD=1(&|$)/', $uri)) {
            return 'add';
        }

        return 'modify';
    }

    private static function extractUserForm($html)
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

        $xpath = new \DOMXPath($dom);

        /*
         * First choice: real form containing user fields.
         * This avoids selecting the old VICIdial sidebar because the sidebar has links,
         * but it does not have the actual form inputs/selects.
         */
        $forms = $dom->getElementsByTagName('form');

        $bestForm = null;
        $bestScore = -999999;

        foreach ($forms as $form) {
            $score = self::scoreUserFormNode($xpath, $form);

            if ($score > $bestScore) {
                $bestScore = $score;
                $bestForm = $form;
            }
        }

        if ($bestForm && $bestScore >= 20) {
            return self::clean($dom->saveHTML($bestForm));
        }

        /*
         * Fallback: table containing actual user form fields.
         * Must contain inputs/selects, so the old nav cannot match.
         */
        $tables = $dom->getElementsByTagName('table');

        $bestTable = null;
        $bestTableScore = -999999;

        foreach ($tables as $table) {
            $score = self::scoreUserFormNode($xpath, $table);

            if ($score > $bestTableScore) {
                $bestTableScore = $score;
                $bestTable = $table;
            }
        }

        if ($bestTable && $bestTableScore >= 20) {
            return self::clean($dom->saveHTML($bestTable));
        }

        return false;
    }

    private static function scoreUserFormNode(\DOMXPath $xpath, \DOMNode $node)
    {
        $text = self::nodeText($node);

        $inputs  = $xpath->query('.//input', $node)->length;
        $selects = $xpath->query('.//select', $node)->length;
        $textareas = $xpath->query('.//textarea', $node)->length;
        $controls = $inputs + $selects + $textareas;

        $score = 0;

        // Must have real form controls.
        $score += min($controls, 60);

        // Strong user-form signals.
        foreach ([
            'MODIFY A USERS RECORD',
            'ADD A NEW USER',
            'User Number',
            'User ID',
            'Password',
            'Full Name',
            'User Level',
            'User Group',
            'Phone Login',
            'Phone Pass',
            'Active',
        ] as $good) {
            if (stripos($text, $good) !== false) {
                $score += 8;
            }
        }

        // Penalize old VICIdial nav/menu content.
        foreach ([
            'Reports',
            'Show Users',
            'Copy User',
            'Search For A User',
            'Campaigns',
            'Lists',
            'Scripts',
            'Filters',
            'Remote Agents',
            'VERSION:',
            'ViciDial Group',
        ] as $bad) {
            if (stripos($text, $bad) !== false) {
                $score -= 10;
            }
        }

        // Hard fail if it has no meaningful controls.
        if ($controls < 3) {
            $score -= 1000;
        }

        return $score;
    }

    private static function nodeText(\DOMNode $node)
    {
        return trim(preg_replace('/\s+/', ' ', $node->textContent ?? ''));
    }

    private static function clean($html)
    {
        // Remove old presentational attributes, quoted and unquoted.
        $html = preg_replace('/\s(bgcolor|background|border|cellpadding|cellspacing|width|height)=("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);

        // Let our CSS control fonts/colors.
        $html = preg_replace('/<font\b[^>]*>/i', '<span>', $html);
        $html = str_ireplace('</font>', '</span>', $html);

        // Remove inline colors/fonts that fight dark mode.
        $html = preg_replace('/\sstyle=("|\')[^"\']*(color|background-color|font-family|font-size)\s*:[^"\']*("|\')/i', '', $html);

        return $html;
    }
}
