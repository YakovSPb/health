#!/usr/bin/env python3
"""Собрать zal/data.js и скопировать картинки из каталога."""

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAT = ROOT / "docs" / "каталог"
OUT = Path(__file__).resolve().parent
IMG = OUT / "img"

META = {
    "жим-штанги-лежа": dict(kind="num", step=2.5, weight="90", note="со грифом", swap="грудь", role="жим"),
    "жим-гантелей-лежа": dict(kind="pair", step=2, weight="32+32", note="на руку", swap="грудь", role="жим", estimate=True),
    "жим-гантелей-наклон": dict(kind="pair", step=2, weight="28+28", note="на руку", swap="грудь", role="жим"),
    "жим-сидя-вверх": dict(kind="num", step=2.5, weight="50", note="со грифом или Смит", swap="грудь", role="жим", estimate=True, gears=["штанга", "Смит"]),
    "бабочка": dict(kind="num", step=1, weight="13", note="тренажёр", swap="грудь", role="сведение"),
    "разводка-лежа": dict(kind="pair", step=2, weight="14+14", note="на руку", swap="грудь", role="сведение", estimate=True),
    "кроссовер": dict(kind="num", step=1, weight="12", note="на сторону", swap="грудь", role="сведение", estimate=True, gears=["сверху", "снизу"]),
    "тяга-блока-к-груди": dict(kind="num", step=5, weight="100", note="блок", swap="спина", role="вертикаль"),
    "подтягивания": dict(kind="text", step=0, weight="резинка", note="помощь", swap="спина", role="вертикаль", estimate=True, gears=["резинка", "гравитрон", "свой вес"]),
    "тяга-сидя": dict(kind="num", step=1, weight="62", note="блок", swap="спина", role="горизонталь"),
    "тяга-гантели": dict(kind="num", step=2.5, weight="85", note="на сторону", swap="спина", role="горизонталь"),
    "тяга-рычаг-грудь": dict(kind="num", step=2.5, weight="40", note="на сторону / блины", swap="спина", role="горизонталь", estimate=True),
    "присед": dict(kind="num", step=2.5, weight="110", note="со грифом", swap="квадрицепс", role="база", gears=["штанга", "goblet", "тренажёр"]),
    "выпады-в-ходьбе": dict(kind="pair", step=2, weight="14+14", note="на руку", swap="квадрицепс", role="база", estimate=True),
    "жим-ногами": dict(kind="pair", step=5, weight="85+85", note="на сторону", swap="квадрицепс", role="база"),
    "румынская-тяга": dict(kind="num", step=2.5, weight="40", note="со грифом", swap="бицепс бедра", role="база"),
    "сгибание-ног": dict(kind="pair", step=2, weight="68+68", note="на сторону", swap="бицепс бедра", role="изоляция"),
    "икры-стоя": dict(kind="pair", step=5, weight="40+40", note="на сторону / тренажёр", swap="икры", role="изоляция", estimate=True),
    "икры-сидя": dict(kind="pair", step=5, weight="75+75", note="на сторону", swap="икры", role="изоляция"),
    "жим-от-плеч-рычаг": dict(kind="num", step=5, weight="25", note="рычаг", swap="плечи", role="жим"),
    "жим-арнольда": dict(kind="pair", step=2, weight="14+14", note="на руку", swap="плечи", role="жим", estimate=True),
    "разведения-в-стороны": dict(kind="pair", step=2, weight="10+10", note="на руку", swap="плечи", role="изоляция"),
    "задняя-дельта": dict(kind="num", step=1, weight="10", note="тренажёр или канат", swap="плечи", role="изоляция", gears=["тренажёр", "face pull"]),
    "бицепс-штанга-добивка": dict(kind="num", step=2.5, weight="22", note="со грифом", swap="бицепс", role="база"),
    "бицепс-сидя-одной": dict(kind="num", step=2, weight="14", note="гантель", swap="бицепс", role="изоляция", estimate=True),
    "молотки": dict(kind="pair", step=2, weight="19+19", note="на руку", swap="бицепс", role="изоляция"),
    "разгибания-трицепс-блок": dict(kind="num", step=1, weight="14", note="блок", swap="трицепс", role="изоляция", gears=["канат", "прямая рукоять"]),
    "скручивания": dict(kind="num", step=1, weight="12", note="на подход, скамья / пол", swap="корпус", role="изоляция", unit="раз"),
    "пресс-тренажёр": dict(kind="num", step=5, weight="45", note="тренажёр", swap="корпус", role="изоляция"),
}


def clean_line(line):
    line = line.strip()
    if not line or line.startswith("|") or line.startswith("#"):
        return ""
    line = re.sub(r"^[-*]\s+", "", line)
    line = re.sub(r"^\d+\.\s+", "", line)
    line = line.replace("**", "")
    return line.strip()


def section_body(text, start_pat):
    match = re.search(start_pat, text)
    if not match:
        return ""
    rest = text[match.end() :]
    nxt = re.search(r"\n## ", rest)
    body = rest[: nxt.start()] if nxt else rest
    return body.strip()


def lines_of(body):
    out = []
    for raw in body.splitlines():
        line = clean_line(raw)
        if line:
            out.append(line)
    return out


def parse_card(path):
    text = path.read_text(encoding="utf-8")
    title = text.splitlines()[0].lstrip("# ").strip()
    img = re.search(r"!\[[^\]]*\]\(\.\./_img/([^)]+)\)", text)
    how = section_body(text, r"## Как делать[^\n]*\n")
    extra_title = None
    extra = []
    extra_match = re.search(r"\n## (Добивка[^\n]*)\n", text)
    if extra_match:
        extra_title = extra_match.group(1).strip()
        extra = lines_of(section_body(text, r"## Добивка[^\n]*\n"))
    mistakes = lines_of(section_body(text, r"## Ошибки\n"))
    return {
        "title": title,
        "image": f"img/{img.group(1)}" if img else "",
        "steps": lines_of(how),
        "extraTitle": extra_title,
        "extra": extra,
        "mistakes": mistakes,
    }


def main():
    IMG.mkdir(exist_ok=True)
    exercises = {}
    for path in sorted(CAT.rglob("*.md")):
        if path.name == "README.md":
            continue
        eid = path.stem
        if eid not in META:
            raise SystemExit(f"нет META для {eid}")
        card = parse_card(path)
        src = CAT / "_img" / Path(card["image"]).name
        if not src.exists():
            raise SystemExit(f"нет картинки {src}")
        shutil.copy2(src, IMG / src.name)
        exercises[eid] = {**card, **META[eid]}
        if not exercises[eid]["steps"]:
            raise SystemExit(f"пустые шаги: {eid}")

    days = [
        {
            "id": "tue",
            "weekday": 2,
            "short": "Вт",
            "title": "Вторник",
            "kind": "Жим",
            "hint": "Грудь, плечи, трицепс.",
            "A": [
                {"id": "жим-штанги-лежа", "sets": "4×8–10"},
                {"id": "жим-гантелей-наклон", "sets": "3×8–10"},
                {"id": "разводка-лежа", "sets": "3×10–12"},
                {"id": "бабочка", "sets": "3×10–12"},
                {"id": "жим-от-плеч-рычаг", "sets": "3×8–10"},
                {"id": "разведения-в-стороны", "sets": "3×12–15"},
                {"id": "разгибания-трицепс-блок", "sets": "3×10–12"},
            ],
            "B": [
                {"id": "жим-гантелей-лежа", "sets": "4×8–10"},
                {"id": "жим-сидя-вверх", "sets": "3×8–10"},
                {"id": "разводка-лежа", "sets": "3×10–12"},
                {"id": "кроссовер", "sets": "3×10–12"},
                {"id": "жим-арнольда", "sets": "3×8–10"},
                {"id": "разведения-в-стороны", "sets": "3×12–15"},
                {"id": "разгибания-трицепс-блок", "sets": "3×10–12", "cue": "брусья можно, если плечи спокойны"},
            ],
        },
        {
            "id": "thu",
            "weekday": 4,
            "short": "Чт",
            "title": "Четверг",
            "kind": "Ноги",
            "hint": "Квадрицепс, задняя цепь, икры, корпус.",
            "A": [
                {"id": "присед", "sets": "4×8–10"},
                {"id": "румынская-тяга", "sets": "3×8–10"},
                {"id": "жим-ногами", "sets": "3×10–12"},
                {"id": "сгибание-ног", "sets": "3×10–12"},
                {"id": "икры-сидя", "sets": "3×12–15"},
                {"id": "скручивания", "sets": "3×12–15"},
            ],
            "B": [
                {"id": "выпады-в-ходьбе", "sets": "3×10–12 шагов на ногу"},
                {"id": "румынская-тяга", "sets": "3×8–10"},
                {"id": "присед", "sets": "3×10–12"},
                {"id": "сгибание-ног", "sets": "3×10–12"},
                {"id": "икры-стоя", "sets": "3×12–15"},
                {"id": "пресс-тренажёр", "sets": "3×12–15"},
            ],
        },
        {
            "id": "sat",
            "weekday": 6,
            "short": "Сб",
            "title": "Суббота",
            "kind": "Тяга",
            "hint": "Спина, задняя дельта, бицепс.",
            "A": [
                {"id": "тяга-блока-к-груди", "sets": "4×8–10"},
                {"id": "тяга-сидя", "sets": "3×8–10"},
                {"id": "тяга-гантели", "sets": "3×8–10"},
                {"id": "задняя-дельта", "sets": "3×12–15"},
                {"id": "бицепс-штанга-добивка", "sets": "3×8–10 + добивка"},
                {"id": "молотки", "sets": "3×10–12"},
            ],
            "B": [
                {"id": "подтягивания", "sets": "4×8–10"},
                {"id": "тяга-рычаг-грудь", "sets": "3×8–10"},
                {"id": "тяга-сидя", "sets": "3×8–10"},
                {"id": "задняя-дельта", "sets": "3×12–15"},
                {"id": "бицепс-сидя-одной", "sets": "3×8–10"},
                {"id": "молотки", "sets": "3×10–12", "cue": "можно пропустить, если руки уже горят"},
            ],
        },
    ]

    focus = [
        {
            "id": "focus-chest",
            "short": "Грудь",
            "title": "Фокус: Грудь",
            "kind": "вместо вторника",
            "hint": "Плечи и трицепс не добивать. Веса с запасом 2–3 повтора.",
            "A": [
                {"id": "жим-штанги-лежа", "sets": "3×10–12"},
                {"id": "жим-гантелей-наклон", "sets": "3×10–12"},
                {"id": "жим-сидя-вверх", "sets": "3×10–12"},
                {"id": "бабочка", "sets": "3×12–15"},
                {"id": "кроссовер", "sets": "3×12–15", "cue": "рукояти снизу"},
            ],
            "B": [
                {"id": "жим-гантелей-лежа", "sets": "3×10–12"},
                {"id": "жим-сидя-вверх", "sets": "3×10–12"},
                {"id": "жим-гантелей-наклон", "sets": "3×10–12"},
                {"id": "кроссовер", "sets": "3×12–15", "cue": "верёвки сверху"},
                {"id": "бабочка", "sets": "3×12–15"},
            ],
        },
        {
            "id": "focus-back",
            "short": "Спина",
            "title": "Фокус: Спина",
            "kind": "вместо субботы",
            "hint": "Бицепс сегодня пропусти.",
            "A": [
                {"id": "тяга-блока-к-груди", "sets": "3×10–12"},
                {"id": "тяга-сидя", "sets": "3×10–12"},
                {"id": "тяга-гантели", "sets": "3×10–12"},
                {"id": "подтягивания", "sets": "3×8–12"},
                {"id": "задняя-дельта", "sets": "3×12–15"},
            ],
            "B": [
                {"id": "подтягивания", "sets": "3×10–12"},
                {"id": "тяга-рычаг-грудь", "sets": "3×10–12"},
                {"id": "тяга-сидя", "sets": "3×10–12"},
                {"id": "тяга-блока-к-груди", "sets": "3×8–12"},
                {"id": "задняя-дельта", "sets": "3×12–15", "cue": "другой снаряд: тренажёр или face pull"},
            ],
        },
        {
            "id": "focus-legs",
            "short": "Ноги",
            "title": "Фокус: Ноги",
            "kind": "вместо четверга",
            "hint": "Веса с запасом 2–3 повтора, не отказ на каждом подходе.",
            "A": [
                {"id": "присед", "sets": "3×10–12"},
                {"id": "жим-ногами", "sets": "3×10–12"},
                {"id": "румынская-тяга", "sets": "3×10–12"},
                {"id": "выпады-в-ходьбе", "sets": "3×10–12 шагов на ногу"},
                {"id": "сгибание-ног", "sets": "3×12–15"},
                {"id": "икры-сидя", "sets": "3×12–15"},
            ],
            "B": [
                {"id": "жим-ногами", "sets": "3×10–12"},
                {"id": "выпады-в-ходьбе", "sets": "3×10–12"},
                {"id": "сгибание-ног", "sets": "3×10–12"},
                {"id": "присед", "sets": "3×10–12", "cue": "легче: goblet или тренажёр"},
                {"id": "румынская-тяга", "sets": "3×10–12"},
                {"id": "икры-стоя", "sets": "3×12–15"},
            ],
        },
        {
            "id": "focus-shoulders",
            "short": "Плечи",
            "title": "Фокус: Плечи",
            "kind": "вместо вторника",
            "hint": "Грудь не жимать. В субботу заднюю дельту не дублировать тяжело.",
            "A": [
                {"id": "жим-от-плеч-рычаг", "sets": "3×10–12"},
                {"id": "жим-арнольда", "sets": "3×10–12", "cue": "легче первого жима"},
                {"id": "разведения-в-стороны", "sets": "3×12–15"},
                {"id": "задняя-дельта", "sets": "3×12–15", "cue": "тренажёр"},
                {"id": "задняя-дельта", "sets": "3×12–15", "cue": "face pull"},
            ],
            "B": [
                {"id": "жим-арнольда", "sets": "3×10–12"},
                {"id": "жим-от-плеч-рычаг", "sets": "3×10–12", "cue": "легче"},
                {"id": "разведения-в-стороны", "sets": "3×12–15"},
                {"id": "задняя-дельта", "sets": "3×12–15", "cue": "face pull"},
                {"id": "задняя-дельта", "sets": "3×12–15", "cue": "тренажёр"},
            ],
        },
        {
            "id": "focus-arms",
            "short": "Руки",
            "title": "Фокус: Руки",
            "kind": "45–60 мин, вместо вторника",
            "hint": "Грудь и плечи не жимать. В субботу бицепс лёгкий или пропуск.",
            "A": [
                {"id": "бицепс-штанга-добивка", "sets": "3×10–12"},
                {"id": "разгибания-трицепс-блок", "sets": "3×10–12", "cue": "канат"},
                {"id": "молотки", "sets": "3×10–12"},
                {"id": "разгибания-трицепс-блок", "sets": "3×12–15", "cue": "прямая рукоять"},
                {"id": "бицепс-сидя-одной", "sets": "3×10–12"},
            ],
            "B": [
                {"id": "бицепс-сидя-одной", "sets": "3×10–12"},
                {"id": "разгибания-трицепс-блок", "sets": "3×10–12", "cue": "прямая рукоять"},
                {"id": "бицепс-штанга-добивка", "sets": "3×10–12", "cue": "без тяжёлой добивки"},
                {"id": "разгибания-трицепс-блок", "sets": "3×12–15", "cue": "канат"},
                {"id": "молотки", "sets": "3×10–12"},
            ],
        },
    ]

    used = set()
    for group in days + focus:
        for scheme in ("A", "B"):
            for slot in group[scheme]:
                used.add(slot["id"])
                if slot["id"] not in exercises:
                    raise SystemExit(f"слот без карточки: {slot['id']}")
                alt = slot.get("rotate")
                if alt:
                    used.add(alt)
                    if alt not in exercises:
                        raise SystemExit(f"rotate без карточки: {alt}")
    missing = set(exercises) - used
    if missing:
        raise SystemExit(f"упражнения нигде не стоят: {missing}")

    payload = {"exercises": exercises, "days": days, "focus": focus}
    js = "window.ZAL = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    (OUT / "data.js").write_text(js, encoding="utf-8")
    print(f"exercises {len(exercises)}, images {len(list(IMG.glob('*.png')))}")


if __name__ == "__main__":
    main()
