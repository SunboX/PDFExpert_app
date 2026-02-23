<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_SLASHES);
    exit;
}

$packagePath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'package.json';
$fallbackVersionPath = __DIR__ . DIRECTORY_SEPARATOR . 'app-version.json';
$version = readVersionFromJsonFile($packagePath);
if ($version === '') {
    $version = readVersionFromJsonFile($fallbackVersionPath);
}

echo json_encode(['version' => $version], JSON_UNESCAPED_SLASHES);

/**
 * Reads and normalizes a version string from a JSON file that contains a "version" key.
 *
 * @param string $path
 * @return string
 */
function readVersionFromJsonFile(string $path): string
{
    if (!is_file($path) || !is_readable($path)) {
        return '';
    }
    $raw = file_get_contents($path);
    if (!is_string($raw) || $raw === '') {
        return '';
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !array_key_exists('version', $decoded)) {
        return '';
    }
    return trim((string)$decoded['version']);
}
