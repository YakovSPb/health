(function () {
  const KEY = "food.diary.v3";
  const UI_KEY = "food.ui.v1";
  const API = "food-api.php";
  const PASS = "132";
  const MONTHS = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  const app = document.getElementById("app");

  if (!window.FOOD) {
    app.textContent = "Не загрузился food-data.js";
    return;
  }

  const F = FOOD;
  let pickerMealId = null;
  let pickerCategory = null;
  let swapUid = null;
  let syncing = false;
  let syncTimer = null;
  let syncState = "";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isoToday() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function parseIso(iso) {
    const parts = iso.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatDate(iso) {
    const d = parseIso(iso);
    return d.getDate() + " " + MONTHS[d.getMonth()];
  }

  function shiftIso(iso, delta) {
    const d = parseIso(iso);
    d.setDate(d.getDate() + delta);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function uid() {
    return "i" + Math.random().toString(36).slice(2, 10);
  }

  function cloneMealTemplate(mealId) {
    const rows = F.defaultDay[mealId] || [];
    return rows.map((row) => ({
      uid: uid(),
      productId: row.productId,
      grams: row.grams,
    }));
  }

  function cloneDefaultDay() {
    const day = {};
    F.meals.forEach((meal) => {
      day[meal.id] = cloneMealTemplate(meal.id);
    });
    return day;
  }

  function emptyDay() {
    const day = {};
    F.meals.forEach((meal) => {
      day[meal.id] = [];
    });
    return day;
  }

  function emptyFood() {
    return { v: templateVersion(), days: {} };
  }

  function templateVersion() {
    return F.templateVersion || 1;
  }

  function loadUi() {
    try {
      const raw = JSON.parse(localStorage.getItem(UI_KEY) || "null");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { collapsed: {} };
      const collapsed =
        raw.collapsed && typeof raw.collapsed === "object" && !Array.isArray(raw.collapsed)
          ? raw.collapsed
          : {};
      return { collapsed: collapsed };
    } catch (e) {
      return { collapsed: {} };
    }
  }

  function saveUi(ui) {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  }

  function mealCollapsed(iso, mealId) {
    const dayMap = loadUi().collapsed[iso];
    return !!(dayMap && dayMap[mealId]);
  }

  function setMealCollapsed(iso, mealId, collapsed) {
    const ui = loadUi();
    if (!ui.collapsed[iso]) ui.collapsed[iso] = {};
    if (collapsed) ui.collapsed[iso][mealId] = true;
    else delete ui.collapsed[iso][mealId];
    saveUi(ui);
  }

  /** Начал заполнять приём — предыдущие сворачиваются, текущий раскрывается. */
  function activateMeal(iso, mealId) {
    const order = F.meals.map((meal) => meal.id);
    const idx = order.indexOf(mealId);
    if (idx < 0) return;
    const ui = loadUi();
    if (!ui.collapsed[iso]) ui.collapsed[iso] = {};
    for (let i = 0; i < idx; i++) ui.collapsed[iso][order[i]] = true;
    delete ui.collapsed[iso][mealId];
    saveUi(ui);
  }

  function normalizeFood(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyFood();
    if (raw.days && typeof raw.days === "object" && !Array.isArray(raw.days)) {
      return { v: Number(raw.v) || 0, days: raw.days };
    }
    // старый формат: дни в корне
    const days = {};
    Object.keys(raw).forEach((key) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) days[key] = raw[key];
    });
    return { v: Number(raw.v) || 0, days: days };
  }

  function loadFood() {
    try {
      return normalizeFood(JSON.parse(localStorage.getItem(KEY) || "null"));
    } catch (e) {
      return emptyFood();
    }
  }

  function saveFoodLocal(food) {
    localStorage.setItem(KEY, JSON.stringify(food));
  }

  function mergeSnackIntoDinner(day) {
    if (!day || !Array.isArray(day.snack) || !day.snack.length) {
      if (day && day.snack) delete day.snack;
      return false;
    }
    if (!day.dinner) day.dinner = [];
    day.snack.forEach((row) => {
      const same = day.dinner.find((item) => item.productId === row.productId);
      if (same && productOf(row.productId) && productOf(row.productId).unit !== "kcal") {
        same.grams = (Number(same.grams) || 0) + (Number(row.grams) || 0);
      } else {
        day.dinner.push({
          uid: row.uid || uid(),
          productId: row.productId,
          grams: row.grams,
        });
      }
    });
    delete day.snack;
    return true;
  }

  function applyTemplateIfNeeded(food) {
    const today = isoToday();
    let changed = false;
    if (food.v !== templateVersion()) {
      if (!food.days[today]) food.days[today] = emptyDay();
      food.v = templateVersion();
      changed = true;
    } else if (!food.days[today]) {
      food.days[today] = emptyDay();
      changed = true;
    }
    Object.keys(food.days).forEach((iso) => {
      if (mergeSnackIntoDinner(food.days[iso])) changed = true;
    });
    return changed;
  }

  function getDay(iso) {
    const food = loadFood();
    if (applyTemplateIfNeeded(food)) {
      saveFoodLocal(food);
      queuePush();
    }
    if (!food.days[iso]) {
      food.days[iso] = emptyDay();
      saveFoodLocal(food);
      queuePush();
    }
    return food.days[iso];
  }

  function setDay(iso, day) {
    const food = loadFood();
    food.days[iso] = day;
    food.v = templateVersion();
    saveFoodLocal(food);
    queuePush();
  }

  function pushFood(food) {
    syncing = true;
    syncState = "Сохраняю…";
    paintSync();
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass: PASS, food: food }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("push");
        syncState = "Синхрон";
        return true;
      })
      .catch(() => {
        syncState = "Офлайн";
        return false;
      })
      .finally(() => {
        syncing = false;
        paintSync();
      });
  }

  function pullFood() {
    return fetch(API, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("pull");
        return res.json();
      })
      .then((data) => {
        const remote = normalizeFood(data);
        const local = loadFood();
        const remoteEmpty = !Object.keys(remote.days).length;
        if (remoteEmpty && Object.keys(local.days).length) {
          applyTemplateIfNeeded(local);
          saveFoodLocal(local);
          return pushFood(local).then(() => true);
        }
        applyTemplateIfNeeded(remote);
        saveFoodLocal(remote);
        syncState = "Синхрон";
        paintSync();
        return true;
      })
      .catch(() => {
        syncState = "Офлайн";
        paintSync();
        return false;
      });
  }

  function queuePush() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      pushFood(loadFood());
    }, 350);
  }

  function paintSync() {
    const el = document.querySelector("[data-sync]");
    if (el) el.textContent = syncState;
  }

  function productOf(id) {
    return F.products[id] || null;
  }

  function macrosOf(productId, grams) {
    const p = productOf(productId);
    if (!p) return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    if (p.unit === "kcal") {
      return { kcal: Number(grams) || 0, protein: 0, fat: 0, carbs: 0 };
    }
    if (p.unit === "pcs") {
      return {
        kcal: p.kcal * grams,
        protein: p.protein * grams,
        fat: p.fat * grams,
        carbs: p.carbs * grams,
      };
    }
    // г и мл: КБЖУ в каталоге на 100 единиц
    const k = grams / 100;
    return {
      kcal: p.kcal * k,
      protein: p.protein * k,
      fat: p.fat * k,
      carbs: p.carbs * k,
    };
  }

  function dayTotals(day) {
    const total = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    F.meals.forEach((meal) => {
      (day[meal.id] || []).forEach((row) => {
        const m = macrosOf(row.productId, Number(row.grams) || 0);
        total.kcal += m.kcal;
        total.protein += m.protein;
        total.fat += m.fat;
        total.carbs += m.carbs;
      });
    });
    return total;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function round0(n) {
    return Math.round(n);
  }

  function currentIso() {
    const hash = location.hash.replace(/^#/, "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(hash)) return hash;
    return isoToday();
  }

  function setIso(iso) {
    location.hash = iso;
  }

  function kcalPerUnit(product) {
    if (!product) return 0;
    if (product.unit === "kcal") return 1;
    if (product.unit === "pcs") return product.kcal;
    return product.kcal / 100;
  }

  function gramsForKcal(product, targetKcal) {
    const per = kcalPerUnit(product);
    if (!per) return product.defaultGrams || 0;
    return Math.max(1, round0(targetKcal / per));
  }

  function gramsOfProductInDay(productId, exceptUid) {
    const day = getDay(currentIso());
    let found = null;
    F.meals.forEach((meal) => {
      (day[meal.id] || []).forEach((row) => {
        if (row.productId === productId && row.uid !== exceptUid && found == null) {
          found = Number(row.grams) || 0;
        }
      });
    });
    return found;
  }

  function linkedAddonMaps() {
    return [F.grainAddons || {}, F.proteinAddons || {}];
  }

  function linkedAddonIds() {
    const ids = [];
    linkedAddonMaps().forEach((map) => {
      Object.keys(map).forEach((key) => {
        const id = map[key].productId;
        if (ids.indexOf(id) === -1) ids.push(id);
      });
    });
    return ids;
  }

  function linkedAddonFor(productId) {
    let found = null;
    linkedAddonMaps().forEach((map) => {
      if (map[productId]) found = map[productId];
    });
    return found;
  }

  function syncLinkedAddons(day, mealId) {
    const rows = day[mealId] || [];
    const addonIds = linkedAddonIds();
    const triggers = rows.filter((row) => linkedAddonFor(row.productId));
    const withoutAddons = rows.filter((row) => addonIds.indexOf(row.productId) === -1);
    const next = withoutAddons.slice();
    // вставляем добавки сразу после своего продукта (с конца, чтобы индексы не плыли)
    for (let i = triggers.length - 1; i >= 0; i--) {
      const trigger = triggers[i];
      const addon = linkedAddonFor(trigger.productId);
      const idx = next.findIndex((row) => row.uid === trigger.uid);
      if (idx === -1) continue;
      next.splice(idx + 1, 0, {
        uid: uid(),
        productId: addon.productId,
        grams: gramsOfProductInDay(addon.productId) || addon.grams,
      });
    }
    day[mealId] = next;
  }

  function swapAlternatives(fromId, grams) {
    const from = productOf(fromId);
    if (!from || from.unit === "kcal") return [];
    const map = F.proteinSwapPer100Chicken;
    if (from.category === "protein" && map[fromId]) {
      const chickenEq = (grams * 100) / map[fromId];
      return Object.keys(map)
        .filter((id) => id !== fromId)
        .map((id) => ({
          productId: id,
          grams: Math.round((chickenEq * map[id]) / 100),
        }));
    }
    const fromKcal = macrosOf(fromId, grams).kcal;
    return Object.values(F.products)
      .filter((p) => p.category === from.category && p.id !== fromId && p.unit !== "kcal")
      .map((p) => {
        let next;
        if (from.category === "nuts" && from.defaultGrams && p.defaultGrams) {
          next = round0((grams / from.defaultGrams) * p.defaultGrams);
        } else if (from.dry && p.dry) {
          next = round0(grams);
        } else if (from.category === "salad" || from.category === "fruit" || from.category === "topping") {
          // у каждого типа своя порция; если продукт уже есть в дне — те же граммы
          next = gramsOfProductInDay(p.id) || p.defaultGrams || round0(grams);
        } else if (from.unit === "pcs" && p.unit === "pcs") {
          next = round0(grams);
        } else {
          next = gramsForKcal(p, fromKcal);
        }
        return { productId: p.id, grams: next };
      });
  }

  function unitLabel(product) {
    if (!product) return "г";
    if (product.unit === "kcal") return "ккал";
    if (product.unit === "pcs") return "шт";
    if (product.unit === "ml") return "мл";
    if (product.dry) return "г сухих";
    return "г";
  }

  function cookMulOf(product) {
    return product && product.dry && product.cookMul ? product.cookMul : 0;
  }

  function cookedGrams(dryGrams, product) {
    const mul = cookMulOf(product);
    return mul ? round0(Number(dryGrams) * mul) : 0;
  }

  function dryFromCooked(cooked, product) {
    const mul = cookMulOf(product);
    return mul ? round0(Number(cooked) / mul) : 0;
  }

  function gramsInputs(row, product) {
    if (product && product.unit === "kcal") {
      return (
        '<label class="food-grams">Ккал' +
        '<input type="number" inputmode="decimal" min="0" step="1" value="' +
        esc(row.grams) +
        '" data-grams="' +
        esc(row.uid) +
        '"><span>ккал</span></label>'
      );
    }
    if (product && product.dry && cookMulOf(product)) {
      const dry = Number(row.grams) || 0;
      const cooked = cookedGrams(dry, product);
      return (
        '<div class="food-grams-pair">' +
        '<label class="food-grams">Сухие' +
        '<input type="number" inputmode="decimal" min="0" step="1" value="' +
        esc(dry) +
        '" data-grams="' +
        esc(row.uid) +
        '"><span>г</span></label>' +
        '<label class="food-grams">Готовые' +
        '<input type="number" inputmode="decimal" min="0" step="1" value="' +
        esc(cooked) +
        '" data-cooked="' +
        esc(row.uid) +
        '"><span>г</span></label>' +
        "</div>"
      );
    }
    return (
      '<label class="food-grams">Кол-во' +
      '<input type="number" inputmode="decimal" min="0" step="1" value="' +
      esc(row.grams) +
      '" data-grams="' +
      esc(row.uid) +
      '">' +
      "<span>" +
      esc(unitLabel(product)) +
      "</span></label>"
    );
  }

  function renderRow(mealId, row) {
    const p = productOf(row.productId);
    const m = macrosOf(row.productId, Number(row.grams) || 0);
    const title = p ? p.title : row.productId;
    const dry = Number(row.grams) || 0;
    const dryHint =
      p && p.dry && cookMulOf(p)
        ? '<span class="food-dry">' +
          esc(dry) +
          " г сухих ≈ " +
          esc(cookedGrams(dry, p)) +
          " г готовых</span>"
        : "";
    const note = p && p.note ? '<span class="food-note">' + esc(p.note) + "</span>" : "";
    const canSwap = swapAlternatives(row.productId, Number(row.grams) || 0).length > 0;
    const macrosText =
      p && p.unit === "kcal"
        ? round0(m.kcal) + " ккал"
        : round0(m.kcal) + " ккал · " + round1(m.protein) + " г белка";
    return (
      '<li class="food-row" data-uid="' +
      esc(row.uid) +
      '" data-meal="' +
      esc(mealId) +
      '">' +
      '<div class="food-row-main">' +
      "<div>" +
      "<strong>" +
      esc(title) +
      "</strong>" +
      dryHint +
      note +
      '<span class="food-row-macros">' +
      macrosText +
      "</span>" +
      "</div>" +
      '<div class="food-row-actions">' +
      (canSwap
        ? '<button type="button" class="food-icon" data-swap="' +
          esc(row.uid) +
          '" aria-label="Заменить">⇄</button>'
        : "") +
      '<button type="button" class="food-icon danger" data-remove="' +
      esc(row.uid) +
      '" aria-label="Удалить">×</button>' +
      "</div>" +
      "</div>" +
      gramsInputs(row, p) +
      "</li>"
    );
  }

  function renderMeal(meal, day, iso) {
    const rows = day[meal.id] || [];
    const collapsed = mealCollapsed(iso, meal.id);
    const hasTemplate = (F.defaultDay[meal.id] || []).length > 0;
    const sub = rows.reduce(
      (acc, row) => {
        const m = macrosOf(row.productId, Number(row.grams) || 0);
        acc.kcal += m.kcal;
        acc.protein += m.protein;
        return acc;
      },
      { kcal: 0, protein: 0 }
    );
    return (
      '<section class="food-meal' +
      (collapsed ? " is-collapsed" : "") +
      '" data-meal-block="' +
      esc(meal.id) +
      '">' +
      '<button type="button" class="food-meal-head" data-toggle-meal="' +
      esc(meal.id) +
      '" aria-expanded="' +
      (collapsed ? "false" : "true") +
      '">' +
      "<div><h2>" +
      esc(meal.title) +
      '<span class="food-meal-chevron" aria-hidden="true"></span></h2>' +
      (meal.time ? '<p class="meta">' + esc(meal.time) + "</p>" : "") +
      "</div>" +
      '<p class="food-meal-sum">' +
      round0(sub.kcal) +
      " ккал · " +
      round1(sub.protein) +
      " г</p>" +
      "</button>" +
      '<div class="food-meal-body">' +
      '<ul class="food-list">' +
      rows.map((row) => renderRow(meal.id, row)).join("") +
      "</ul>" +
      (hasTemplate
        ? '<button type="button" class="food-add-template" data-template="' +
          esc(meal.id) +
          '">добавить шаблон</button>'
        : "") +
      '<button type="button" class="food-add" data-add="' +
      esc(meal.id) +
      '">+ продукт</button>' +
      '<button type="button" class="food-add-kcal" data-add-kcal="' +
      esc(meal.id) +
      '">+ свободные ккал</button>' +
      "</div>" +
      "</section>"
    );
  }

  function renderFooter(totals) {
    const eaten = totals.kcal;
    const left = F.targetKcal - eaten;
    const deficit = F.maintenanceKcal - eaten;
    const dayGrams = (deficit / F.kcalPerKg) * 1000;
    const monthKg = (deficit * 30) / F.kcalPerKg;
    const leftText =
      left >= 0
        ? "Осталось съесть <strong>" + round0(left) + " ккал</strong>"
        : "Перебор <strong>" + round0(-left) + " ккал</strong>";
    const deficitText =
      deficit >= 0
        ? "Дефицит <strong>" + round0(deficit) + " ккал</strong>"
        : "Профицит <strong>" + round0(-deficit) + " ккал</strong>";
    const weightDay =
      dayGrams >= 0
        ? "сегодня примерно −" + round0(dayGrams) + " г"
        : "сегодня примерно +" + round0(-dayGrams) + " г";
    const weightMonth =
      monthKg >= 0
        ? "за месяц ≈ −" + round1(monthKg) + " кг"
        : "за месяц ≈ +" + round1(-monthKg) + " кг";
    const tone = deficit >= 0 ? "ok" : "warn";

    return (
      '<footer class="food-footer ' +
      tone +
      '">' +
      '<p class="food-footer-main">Съедено <strong>' +
      round0(eaten) +
      "</strong> / " +
      F.targetKcal +
      " ккал · белок <strong>" +
      round0(totals.protein) +
      "</strong> / " +
      F.targetProtein +
      " г</p>" +
      "<p>" +
      leftText +
      " · " +
      deficitText +
      " (от " +
      F.maintenanceKcal +
      ")</p>" +
      '<p class="food-footer-weight">' +
      weightDay +
      " · " +
      weightMonth +
      "</p>" +
      "</footer>"
    );
  }

  function renderPicker(day) {
    if (!pickerMealId) return "";
    const cats = F.categories;
    const activeCat = pickerCategory || cats[0].id;
    const products = Object.values(F.products).filter(
      (p) => p.category === activeCat && !p.hideInPicker
    );
    return (
      '<div class="food-overlay" data-close-picker>' +
      '<div class="food-sheet" role="dialog" aria-label="Добавить продукт">' +
      '<div class="food-sheet-head"><strong>Добавить</strong>' +
      '<button type="button" class="food-icon" data-close-picker aria-label="Закрыть">×</button></div>' +
      '<nav class="chips food-cats">' +
      cats
        .map(
          (c) =>
            '<button type="button" class="' +
            (c.id === activeCat ? "on" : "") +
            '" data-cat="' +
            esc(c.id) +
            '">' +
            esc(c.title) +
            "</button>"
        )
        .join("") +
      "</nav>" +
      '<ul class="food-pick-list">' +
      products
        .map((p) => {
          const unit =
            p.unit === "kcal"
              ? "ккал"
              : p.unit === "pcs"
                ? "шт"
                : p.unit === "ml"
                  ? "мл"
                  : p.dry && p.cookMul
                    ? "г сухих ≈ " + cookedGrams(p.defaultGrams, p) + " г готовых"
                    : p.dry
                      ? "г сухих"
                      : "г";
          const pickHint =
            p.unit === "kcal"
              ? p.defaultGrams + " ккал"
              : p.defaultGrams + " " + unit + " · " + round0(macrosOf(p.id, p.defaultGrams).kcal) + " ккал";
          return (
            '<li><button type="button" data-pick="' +
            esc(p.id) +
            '"><strong>' +
            esc(p.title) +
            "</strong><span>" +
            pickHint +
            "</span></button></li>"
          );
        })
        .join("") +
      "</ul></div></div>"
    );
  }

  function renderSwap(day) {
    if (!swapUid) return "";
    let found = null;
    let mealId = null;
    F.meals.forEach((meal) => {
      (day[meal.id] || []).forEach((row) => {
        if (row.uid === swapUid) {
          found = row;
          mealId = meal.id;
        }
      });
    });
    if (!found) return "";
    const from = productOf(found.productId);
    const alts = swapAlternatives(found.productId, Number(found.grams) || 0);
    const catTitle = (F.categories.find((c) => c.id === (from && from.category)) || {}).title || "продукт";
    return (
      '<div class="food-overlay" data-close-swap>' +
      '<div class="food-sheet" role="dialog" aria-label="Заменить">' +
      '<div class="food-sheet-head"><strong>Заменить · ' +
      esc(catTitle) +
      "</strong>" +
      '<button type="button" class="food-icon" data-close-swap aria-label="Закрыть">×</button></div>' +
      '<ul class="food-pick-list">' +
      alts
        .map((alt) => {
          const p = productOf(alt.productId);
          const unit = unitLabel(p);
          return (
            '<li><button type="button" data-swap-to="' +
            esc(alt.productId) +
            '" data-swap-grams="' +
            esc(alt.grams) +
            '" data-swap-meal="' +
            esc(mealId) +
            '"><strong>' +
            esc(p.title) +
            "</strong><span>" +
            alt.grams +
            " " +
            unit +
            " · " +
            round0(macrosOf(alt.productId, alt.grams).kcal) +
            " ккал</span></button></li>"
          );
        })
        .join("") +
      "</ul></div></div>"
    );
  }

  function render() {
    const iso = currentIso();
    const day = getDay(iso);
    const totals = dayTotals(day);
    const isToday = iso === isoToday();

    app.innerHTML =
      '<header class="top food-top">' +
      '<div class="brand">' +
      "<div><h1>Питание</h1><p>" +
      (isToday ? "сегодня · " : "") +
      formatDate(iso) +
      (syncState ? ' · <span data-sync>' + esc(syncState) + "</span>" : "") +
      "</p></div>" +
      '<a class="food-zal-link" href="zal.html">Зал</a>' +
      "</div>" +
      '<div class="food-daynav">' +
      '<button type="button" data-shift="-1" aria-label="Вчера">‹</button>' +
      '<button type="button" class="food-today" data-today ' +
      (isToday ? "disabled" : "") +
      ">Сегодня</button>" +
      '<button type="button" data-shift="1" aria-label="Завтра">›</button>' +
      '<button type="button" class="food-reset" data-reset title="Сбросить день к меню">↺ меню</button>' +
      "</div>" +
      "</header>" +
      '<main class="food-main">' +
      F.meals.map((meal) => renderMeal(meal, day, iso)).join("") +
      "</main>" +
      renderFooter(totals) +
      renderPicker(day) +
      renderSwap(day);

    document.body.classList.toggle("has-food-footer", true);
  }

  function mealIdOfRow(day, uid) {
    let found = null;
    F.meals.forEach((meal) => {
      (day[meal.id] || []).forEach((row) => {
        if (row.uid === uid) found = meal.id;
      });
    });
    return found;
  }

  function updateRowGrams(uid, grams) {
    const iso = currentIso();
    const day = getDay(iso);
    let productId = null;
    const mealId = mealIdOfRow(day, uid);
    F.meals.forEach((meal) => {
      (day[meal.id] || []).forEach((row) => {
        if (row.uid === uid) {
          row.grams = grams;
          productId = row.productId;
        }
      });
    });
    if (productId) {
      F.meals.forEach((meal) => {
        (day[meal.id] || []).forEach((row) => {
          if (row.productId === productId) row.grams = grams;
        });
      });
    }
    if (mealId) activateMeal(iso, mealId);
    setDay(iso, day);
    render();
  }

  function removeRow(uid) {
    const iso = currentIso();
    const day = getDay(iso);
    F.meals.forEach((meal) => {
      day[meal.id] = (day[meal.id] || []).filter((row) => row.uid !== uid);
    });
    setDay(iso, day);
    render();
  }

  function addProduct(mealId, productId) {
    const p = productOf(productId);
    if (!p) return;
    const iso = currentIso();
    const day = getDay(iso);
    if (!day[mealId]) day[mealId] = [];
    const existing = gramsOfProductInDay(productId);
    day[mealId].push({
      uid: uid(),
      productId: productId,
      grams: existing != null ? existing : p.defaultGrams,
    });
    if (p.category === "grain" || linkedAddonFor(productId)) syncLinkedAddons(day, mealId);
    activateMeal(iso, mealId);
    setDay(iso, day);
    pickerMealId = null;
    pickerCategory = null;
    render();
  }

  function applyMealTemplate(mealId) {
    if (!(F.defaultDay[mealId] || []).length) return;
    const iso = currentIso();
    const day = getDay(iso);
    const existing = day[mealId] || [];
    if (existing.length && !window.confirm("Заменить «" + (F.meals.find((m) => m.id === mealId) || {}).title + "» шаблоном?")) {
      return;
    }
    day[mealId] = cloneMealTemplate(mealId);
    activateMeal(iso, mealId);
    setDay(iso, day);
    render();
  }

  app.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-picker]")) {
      pickerMealId = null;
      pickerCategory = null;
      render();
      return;
    }
    if (event.target.matches("[data-close-swap]")) {
      swapUid = null;
      render();
      return;
    }

    const t = event.target.closest(
      "[data-shift], [data-today], [data-reset], [data-toggle-meal], [data-template], [data-add], [data-add-kcal], [data-remove], [data-swap], [data-cat], [data-pick], [data-swap-to]"
    );
    if (!t) return;

    if (t.hasAttribute("data-shift")) {
      setIso(shiftIso(currentIso(), Number(t.getAttribute("data-shift"))));
      return;
    }
    if (t.hasAttribute("data-today")) {
      setIso(isoToday());
      return;
    }
    if (t.hasAttribute("data-reset")) {
      if (!window.confirm("Сбросить день к меню по умолчанию?")) return;
      setDay(currentIso(), cloneDefaultDay());
      render();
      return;
    }
    if (t.hasAttribute("data-toggle-meal")) {
      const mealId = t.getAttribute("data-toggle-meal");
      const iso = currentIso();
      setMealCollapsed(iso, mealId, !mealCollapsed(iso, mealId));
      render();
      return;
    }
    if (t.hasAttribute("data-template")) {
      applyMealTemplate(t.getAttribute("data-template"));
      return;
    }
    if (t.hasAttribute("data-add-kcal")) {
      addProduct(t.getAttribute("data-add-kcal"), "free_kcal");
      return;
    }
    if (t.hasAttribute("data-add")) {
      pickerMealId = t.getAttribute("data-add");
      pickerCategory = null;
      swapUid = null;
      activateMeal(currentIso(), pickerMealId);
      render();
      return;
    }
    if (t.hasAttribute("data-remove")) {
      removeRow(t.getAttribute("data-remove"));
      return;
    }
    if (t.hasAttribute("data-swap")) {
      swapUid = t.getAttribute("data-swap");
      pickerMealId = null;
      render();
      return;
    }
    if (t.hasAttribute("data-cat")) {
      pickerCategory = t.getAttribute("data-cat");
      render();
      return;
    }
    if (t.hasAttribute("data-pick")) {
      addProduct(pickerMealId, t.getAttribute("data-pick"));
      return;
    }
    if (t.hasAttribute("data-swap-to")) {
      const iso = currentIso();
      const day = getDay(iso);
      const mealId = t.getAttribute("data-swap-meal");
      const toId = t.getAttribute("data-swap-to");
      const grams = Number(t.getAttribute("data-swap-grams"));
      const fromProduct = (() => {
        let found = null;
        (day[mealId] || []).forEach((row) => {
          if (row.uid === swapUid) found = productOf(row.productId);
        });
        return found;
      })();
      (day[mealId] || []).forEach((row) => {
        if (row.uid === swapUid) {
          row.productId = toId;
          row.grams = grams;
        }
      });
      if (
        (fromProduct && (fromProduct.category === "grain" || linkedAddonFor(fromProduct.id))) ||
        linkedAddonFor(toId) ||
        (productOf(toId) && productOf(toId).category === "grain")
      ) {
        syncLinkedAddons(day, mealId);
      }
      activateMeal(iso, mealId);
      setDay(iso, day);
      swapUid = null;
      render();
    }
  });

  app.addEventListener("change", (event) => {
    const dryInput = event.target.closest("[data-grams]");
    if (dryInput) {
      const value = Number(dryInput.value);
      updateRowGrams(dryInput.getAttribute("data-grams"), Number.isFinite(value) ? value : 0);
      return;
    }
    const cookedInput = event.target.closest("[data-cooked]");
    if (!cookedInput) return;
    const uid = cookedInput.getAttribute("data-cooked");
    const iso = currentIso();
    const day = getDay(iso);
    let product = null;
    F.meals.forEach((meal) => {
      (day[meal.id] || []).forEach((row) => {
        if (row.uid === uid) product = productOf(row.productId);
      });
    });
    const cooked = Number(cookedInput.value);
    updateRowGrams(uid, dryFromCooked(Number.isFinite(cooked) ? cooked : 0, product));
  });

  window.addEventListener("hashchange", render);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pullFood().then(() => render());
    }
  });
  window.addEventListener("focus", () => {
    pullFood().then(() => render());
  });

  function boot() {
    if (!location.hash) location.replace("#" + isoToday());
    render();
  }

  pullFood().finally(boot);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "zal-updated") location.reload();
    });
  }
})();
