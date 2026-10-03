<?php
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

$file = "/var/lib/zal-diabal/weights.json";
$pass = "132";

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    echo is_file($file) ? file_get_contents($file) : "{}";
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $raw = file_get_contents("php://input");
    $body = json_decode($raw, true);
    if (!is_array($body) || ($body["pass"] ?? "") !== $pass) {
        http_response_code(403);
        echo '{"error":"forbidden"}';
        exit;
    }
    if (!is_array($body["weights"] ?? null)) {
        http_response_code(400);
        echo '{"error":"bad"}';
        exit;
    }
    $dir = dirname($file);
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        http_response_code(500);
        echo '{"error":"mkdir"}';
        exit;
    }
    $json = json_encode($body["weights"], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false || file_put_contents($file, $json . "\n", LOCK_EX) === false) {
        http_response_code(500);
        echo '{"error":"write"}';
        exit;
    }
    echo '{"ok":true}';
    exit;
}

http_response_code(405);
echo '{"error":"method"}';
