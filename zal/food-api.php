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

$file = "/var/lib/zal-diabal/food.json";
$pass = "132";

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    echo is_file($file) ? file_get_contents($file) : '{"v":0,"days":{}}';
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
    if (!is_array($body["food"] ?? null)) {
        http_response_code(400);
        echo '{"error":"bad"}';
        exit;
    }
    $food = $body["food"];
    if (!is_array($food["days"] ?? null)) {
        http_response_code(400);
        echo '{"error":"days"}';
        exit;
    }
    $dir = dirname($file);
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        http_response_code(500);
        echo '{"error":"mkdir"}';
        exit;
    }
    $payload = [
        "v" => (int) ($food["v"] ?? 0),
        "days" => $food["days"],
    ];
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
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
