<?php
/**
 * ============================================================================
 * CsvExport: Generate and send CSV files from report data.
 * ============================================================================
 *
 * Usage in a route handler:
 *   if (Router::query('format') === 'csv') {
 *       CsvExport::send($rows, 'sales-summary.csv');
 *   }
 *
 * The send() method outputs HTTP headers and CSV content, then exits.
 * It bypasses the Router's JSON response.
 *
 * DunganSoft Technologies, March 2026
 * ============================================================================
 */

class CsvExport
{
    /**
     * Send CSV response and exit.
     *
     * @param array  $rows     Array of associative arrays (each row is key=>value).
     * @param string $filename Download filename (e.g., 'report.csv').
     * @param array  $columns  Optional column whitelist/rename map: ['db_col' => 'Header Label'].
     *                         If empty, uses all keys from the first row.
     */
    public static function send(array $rows, string $filename = 'export.csv', array $columns = []): never
    {
        // Override the JSON content-type set by Router::dispatch()
        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');

        $out = fopen('php://output', 'w');

        // BOM for Excel UTF-8 compatibility
        fwrite($out, "\xEF\xBB\xBF");

        if (empty($rows)) {
            fputcsv($out, ['No data']);
            fclose($out);
            exit;
        }

        // Determine columns
        if (empty($columns)) {
            $columns = array_combine(array_keys($rows[0]), array_keys($rows[0]));
        }

        // Header row
        fputcsv($out, array_values($columns));

        // Data rows
        foreach ($rows as $row) {
            $line = [];
            foreach (array_keys($columns) as $key) {
                $line[] = $row[$key] ?? '';
            }
            fputcsv($out, $line);
        }

        fclose($out);
        exit;
    }

    /**
     * Check if the current request wants CSV format.
     */
    public static function requested(): bool
    {
        return (\App\Http\Router::query('format') === 'csv');
    }
}
