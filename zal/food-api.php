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

function food_rows_score($rows) {
    if (!is_array($rows) || !$rows) {
        return 0;
    }
    $score = 0;
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $score += 1 + abs((float) ($row["grams"] ?? 0));
    }
    return $score;
}

function food_prefer_rows($a, $b) {
    $left = is_array($a) ? $a : [];
    $right = is_array($b) ? $b : [];
    if (!$left) {
        return $right;
    }
    if (!$right) {
        return $left;
    }
    return food_rows_score($left) >= food_rows_score($right) ? $left : $right;
}

function food_day_updated_at($day) {
    if (!is_array($day)) {
        return 0;
    }
    return (int) ($day["updatedAt"] ?? 0);
}

function food_day_has_content($day) {
    if (!is_array($day)) {
        return false;
    }
    foreach ($day as $key => $rows) {
        if ($key === "updatedAt" || $key === "snack") {
            continue;
        }
        if (is_array($rows) && $rows) {
            return true;
        }
    }
    return false;
}

function food_clone_day($day) {
    if (!is_array($day)) {
        return [];
    }
    $out = [];
    foreach ($day as $key => $value) {
        if ($key === "snack") {
            continue;
        }
        $out[$key] = $value;
    }
    if (!empty($day["snack"]) && is_array($day["snack"])) {
        if (!isset($out["dinner"]) || !is_array($out["dinner"])) {
            $out["dinner"] = [];
        }
        foreach ($day["snack"] as $row) {
            if (is_array($row)) {
                $out["dinner"][] = $row;
            }
        }
    }
    return $out;
}

function food_merge_day($local, $remote) {
    $left = is_array($local) ? $local : null;
    $right = is_array($remote) ? $remote : null;
    if ($left === null) {
        return food_clone_day($right);
    }
    if ($right === null) {
        return food_clone_day($left);
    }

    $lt = food_day_updated_at($left);
    $rt = food_day_updated_at($right);
    if ($lt || $rt) {
        return food_clone_day($lt >= $rt ? $left : $right);
    }

    $keys = array_unique(array_merge(array_keys($left), array_keys($right)));
    $day = [];
    foreach ($keys as $key) {
        if ($key === "snack" || $key === "updatedAt") {
            continue;
        }
        $a = $left[$key] ?? null;
        $b = $right[$key] ?? null;
        if (is_array($a) || is_array($b)) {
            $day[$key] = food_prefer_rows($a, $b);
        }
    }
    foreach ([$left, $right] as $src) {
        if (empty($src["snack"]) || !is_array($src["snack"])) {
            continue;
        }
        if (!isset($day["dinner"]) || !is_array($day["dinner"])) {
            $day["dinner"] = [];
        }
        foreach ($src["snack"] as $row) {
            if (is_array($row)) {
                $day["dinner"][] = $row;
            }
        }
    }
    return $day;
}

function food_normalize($raw) {
    if (!is_array($raw)) {
        return ["v" => 0, "days" => []];
    }
    if (isset($raw["days"]) && is_array($raw["days"])) {
        return ["v" => (int) ($raw["v"] ?? 0), "days" => $raw["days"]];
    }
    $days = [];
    foreach ($raw as $key => $value) {
        if (is_string($key) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $key)) {
            $days[$key] = $value;
        }
    }
    return ["v" => (int) ($raw["v"] ?? 0), "days" => $days];
}

function food_merge($local, $remote) {
    $left = food_normalize($local);
    $right = food_normalize($remote);
    $keys = array_unique(array_merge(array_keys($left["days"]), array_keys($right["days"])));
    $days = [];
    foreach ($keys as $iso) {
        $merged = food_merge_day($left["days"][$iso] ?? null, $right["days"][$iso] ?? null);
        if (food_day_has_content($merged)) {
            $days[$iso] = $merged;
        }
    }
    return [
        "v" => max((int) $left["v"], (int) $right["v"], 1),
        "days" => $days,
    ];
}

function food_read($file) {
    if (!is_file($file)) {
        return ["v" => 0, "days" => []];
    }
    $raw = json_decode((string) file_get_contents($file), true);
    return food_normalize($raw);
}

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    echo json_encode(food_read($file), JSON_UNESCAPED_UNICODE);
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
    $incoming = $body["food"];
    if (!is_array($incoming["days"] ?? null) && !isset($incoming["days"])) {
        // допускаем старый формат без days — нормализуем в merge
    }
    $dir = dirname($file);
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        http_response_code(500);
        echo '{"error":"mkdir"}';
        exit;
    }
    $existing = food_read($file);
    $payload = food_merge($incoming, $existing);
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
