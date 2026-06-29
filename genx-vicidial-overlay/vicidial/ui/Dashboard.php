<?php
namespace ViciUI;

class Dashboard
{
    public static function render($html)
    {
        $live = self::liveCounters($html);
        $summary = self::systemSummary($html);

        return '
<div class="ui-dashboard">

    <div class="ui-metric-grid">
        ' . self::metric('Agents Logged In', $live[0], 'Current logged-in agents') . '
        ' . self::metric('Agents In Calls',  $live[1], 'Agents currently on calls') . '
        ' . self::metric('Active Calls',     $live[2], 'Live active calls') . '
        ' . self::metric('Calls Ringing',    $live[3], 'Calls currently ringing') . '
    </div>

    <div class="ui-card">
        <div class="ui-card-head">
            <div>
                <h2>System Summary</h2>
                <p>Current VICIdial records</p>
            </div>
        </div>

        <div class="ui-summary-grid">
            ' . self::summaryCard('Users',      $summary['Users']) . '
            ' . self::summaryCard('Campaigns',  $summary['Campaigns']) . '
            ' . self::summaryCard('Lists',      $summary['Lists']) . '
            ' . self::summaryCard('In-Groups',  $summary['In-Groups']) . '
            ' . self::summaryCard('DIDs',       $summary['DIDs']) . '
        </div>
    </div>

</div>';
    }

    private static function liveCounters($html)
    {
        if (preg_match('/Agents Logged In.*?<\/tr>\s*<tr[^>]*>(.*?)<\/tr>/is', $html, $m)) {
            preg_match_all('/font[^>]*font-size:18[^>]*>\s*([0-9]+)\s*<\/font>/is', $m[1], $nums);

            if (count($nums[1]) >= 4) {
                return [$nums[1][0], $nums[1][1], $nums[1][2], $nums[1][3]];
            }
        }

        return ['0', '0', '0', '0'];
    }

    private static function systemSummary($html)
    {
        $labels = ['Users', 'Campaigns', 'Lists', 'In-Groups', 'DIDs'];

        $out = [];
        foreach ($labels as $label) {
            $out[$label] = ['active' => '0', 'inactive' => '0', 'total' => '0'];
        }

        foreach ($labels as $label) {
            $pattern = '/' . preg_quote($label, '/') . ':\s*.*?<\/td>\s*<td[^>]*>\s*<b>\s*([0-9]+)\s*<\/b>\s*<\/td>\s*<td[^>]*>\s*<b>\s*([0-9]+)\s*<\/b>\s*<\/td>\s*<td[^>]*>\s*<b>\s*([0-9]+)\s*<\/b>/is';

            if (preg_match($pattern, $html, $m)) {
                $out[$label] = [
                    'active'   => $m[1],
                    'inactive' => $m[2],
                    'total'    => $m[3],
                ];
            }
        }

        return $out;
    }

    private static function metric($label, $value, $note)
    {
        return '<div class="ui-metric">
            <div class="ui-metric-label">' . htmlspecialchars($label) . '</div>
            <div class="ui-metric-value" data-count="' . htmlspecialchars($value) . '">' . htmlspecialchars($value) . '</div>
            <div class="ui-metric-note">' . htmlspecialchars($note) . '</div>
        </div>';
    }

    private static function summaryCard($label, array $values)
    {
        return '<div class="ui-summary-card">
            <div class="ui-summary-title">' . htmlspecialchars($label) . '</div>
            <div class="ui-summary-total">' . htmlspecialchars($values['total']) . '</div>
            <div class="ui-summary-split">
                <span>Active: <b>' . htmlspecialchars($values['active']) . '</b></span>
                <span>Inactive: <b>' . htmlspecialchars($values['inactive']) . '</b></span>
            </div>
        </div>';
    }
}
