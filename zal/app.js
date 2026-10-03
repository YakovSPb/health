(function () {
  const KEY = "zal.weights.v1";
  const GEAR_KEY = "zal.gear.v1";
  const SCHEME_KEY = "zal.scheme";
  const AUTH_KEY = "zal.auth.v1";
  const PASS = "132";
  const API = "weights-api.php";
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const app = document.getElementById("app");
  const zoom = document.getElementById("zoom");
  const savebar = document.getElementById("savebar");
  const draft = Object.create(null);
  let syncing = false;

  if (!window.ZAL) {
    app.textContent = "Не загрузился data.js";
    return;
  }

  const plans = ZAL.days.concat(ZAL.focus);

  function unlocked() {
    return localStorage.getItem(AUTH_KEY) === "1";
  }

  function lockBar() {
    if (unlocked()) return "";
    return (
      '<form class="lockbar" data-unlock-form>' +
        '<label>Пароль <input type="password" name="pass" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="•••" aria-label="Пароль для смены весов"></label>' +
        '<button type="submit">Открыть</button>' +
        '<p class="lock-msg" data-lock-msg hidden></p>' +
      "</form>"
    );
  }

  function hasDraft() {
    return Object.keys(draft).length > 0;
  }

  function updateSaveBar() {
    const show = unlocked() && (hasDraft() || syncing);
    savebar.hidden = !show;
    document.body.classList.toggle("has-savebar", show);
    const btn = savebar.querySelector("[data-save]");
    if (!btn) return;
    btn.disabled = syncing;
    btn.textContent = syncing ? "Сохраняю…" : "Сохранить";
  }

  function setDraft(id, value) {
    draft[id] = value;
    updateSaveBar();
  }

  function pullWeights() {
    return fetch(API, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("pull");
        return res.json();
      })
      .then((data) => {
        if (!data || typeof data !== "object" || Array.isArray(data)) return false;
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      })
      .catch(() => false);
  }

  function pushWeights(saved) {
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pass: PASS, weights: saved }),
    }).then((res) => {
      if (!res.ok) throw new Error("push");
      return true;
    });
  }

  function commitDraft() {
    if (!hasDraft() || syncing) return;
    const saved = weights();
    const ids = Object.keys(draft);
    ids.forEach((id) => {
      saved[id] = draft[id];
      delete draft[id];
    });
    localStorage.setItem(KEY, JSON.stringify(saved));
    syncing = true;
    updateSaveBar();
    pushWeights(saved)
      .then(() => {
        ids.forEach(markStatus);
        if (navigator.vibrate) navigator.vibrate(12);
      })
      .catch(() => {
        ids.forEach((id) => {
          document.querySelectorAll('[data-status-for="' + CSS.escape(id) + '"]').forEach((node) => {
            node.textContent = "только тут, сервер недоступен";
          });
        });
      })
      .finally(() => {
        syncing = false;
        updateSaveBar();
      });
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function loadJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch (err) {
      return {};
    }
  }

  function weights() {
    return loadJSON(KEY);
  }

  function gears() {
    return loadJSON(GEAR_KEY);
  }

  function planById(id) {
    return plans.find((plan) => plan.id === id) || null;
  }

  function strip(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function blockInfo(date) {
    const start = new Date(2026, 8, 29);
    const diff = Math.floor((strip(date) - start) / 86400000);
    const index = Math.max(0, Math.floor(diff / 28));
    const from = new Date(start.getTime() + index * 28 * 86400000);
    const to = new Date(from.getTime() + 27 * 86400000);
    return { scheme: index % 2 === 0 ? "A" : "B", to: to };
  }

  function weekIndex(date) {
    const start = new Date(2026, 8, 29);
    return Math.max(0, Math.floor((strip(date) - start) / 86400000 / 7));
  }

  function resolveSlot(slot, date) {
    if (!slot || !slot.rotate) return slot;
    if (weekIndex(date || new Date()) % 2 === 0) {
      return { id: slot.id, sets: slot.sets, cue: slot.cue };
    }
    return {
      id: slot.rotate,
      sets: slot.rotateSets || slot.sets,
      cue: slot.cue,
    };
  }

  function chosenScheme() {
    const saved = localStorage.getItem(SCHEME_KEY);
    if (saved === "A" || saved === "B") return saved;
    return blockInfo(new Date()).scheme;
  }

  function fmt(date) {
    return date.getDate() + " " + MONTHS[date.getMonth()];
  }

  function stepLabel(step) {
    return String(step).replace(".", ",");
  }

  function parseNum(value) {
    const match = String(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }

  function formatNum(value) {
    const rounded = Math.round(value * 10) / 10;
    if (Object.is(rounded, -0)) return "0";
    const text = String(rounded);
    return text.replace(".", ",");
  }

  function getWeight(id) {
    if (Object.prototype.hasOwnProperty.call(draft, id)) return draft[id];
    const saved = weights();
    if (Object.prototype.hasOwnProperty.call(saved, id)) return saved[id];
    return ZAL.exercises[id].weight;
  }

  function isCustom(id) {
    return Object.prototype.hasOwnProperty.call(draft, id)
      || Object.prototype.hasOwnProperty.call(weights(), id);
  }

  function weightStatus(id) {
    if (Object.prototype.hasOwnProperty.call(draft, id)) return "не сохранено";
    if (Object.prototype.hasOwnProperty.call(weights(), id)) return "мой вес";
    return "из трекера";
  }

  function bump(value, kind, step, dir) {
    const current = parseNum(value);
    const base = current == null ? 0 : current;
    const next = Math.max(0, base + dir * step);
    const text = formatNum(next);
    if (kind === "pair") return text + "+" + text;
    return text;
  }

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!parts.length || parts[0] === "home") return { name: "home" };
    const plan = planById(decodeURIComponent(parts[0]));
    const scheme = parts[1] === "B" ? "B" : "A";
    if (!plan) return { name: "home" };
    if (parts[2] === "s") {
      const index = Number(parts[3]);
      const raw = plan[scheme][index];
      if (!raw) return { name: "list", plan, scheme };
      const slot = resolveSlot(raw);
      return { name: "detail", plan, scheme, exercise: ZAL.exercises[slot.id], id: slot.id, slot, back: "#/" + plan.id + "/" + scheme };
    }
    if (parts[2] === "x") {
      const id = decodeURIComponent(parts.slice(3).join("/"));
      const exercise = ZAL.exercises[id];
      if (!exercise) return { name: "list", plan, scheme };
      return { name: "detail", plan, scheme, exercise, id, slot: null, back: "#/" + plan.id + "/" + scheme };
    }
    return { name: "list", plan, scheme };
  }

  function todayDay() {
    const weekday = new Date().getDay();
    return ZAL.days.find((day) => day.weekday === weekday) || null;
  }

  function href(plan, scheme, tail) {
    return "#/" + plan.id + "/" + scheme + (tail || "");
  }

  function chips(current, scheme) {
    const active = scheme || chosenScheme();
    const days = ZAL.days.map((day) => {
      const on = current && current.id === day.id ? " on" : "";
      return '<a class="' + on.trim() + '" href="' + href(day, active) + '">' + esc(day.short) + "</a>";
    }).join("");
    const focusOn = current && ZAL.focus.some((day) => day.id === current.id);
    const focus = ZAL.focus.map((day) => {
      const on = current && current.id === day.id ? " on" : "";
      return '<a class="' + on.trim() + '" href="' + href(day, active) + '">' + esc(day.short) + "</a>";
    }).join("");
    return (
      '<nav class="chips" aria-label="Дни">' + days +
      '<a class="' + (focusOn ? "on" : "") + '" href="' + href(ZAL.focus[0], active) + '">Фокус</a></nav>' +
      (focusOn ? '<nav class="chips" aria-label="Фокус">' + focus + "</nav>" : "")
    );
  }

  function stepper(id) {
    const exercise = ZAL.exercises[id];
    const value = getWeight(id);
    const custom = isCustom(id);
    const canEdit = unlocked();
    const disabled = canEdit ? "" : " disabled";
    const status = weightStatus(id);
    const badge = exercise.estimate && !custom ? '<span class="badge" data-estimate-for="' + esc(id) + '">оценка</span>' : '<span data-estimate-for="' + esc(id) + '"></span>';
    const lockNote = canEdit ? "" : " · только просмотр";
    if (exercise.kind === "text") {
      return (
        '<div class="stepper text' + (canEdit ? "" : " locked") + '" data-stop>' +
          '<label class="weight"><input data-weight-for="' + esc(id) + '" value="' + esc(value) + '" inputmode="text" autocomplete="off" aria-label="Вес или помощь"' + disabled + "></label>" +
        "</div>" +
        '<p class="weight-meta"><span>' + esc(exercise.note) + lockNote + '</span><span data-status-for="' + esc(id) + '">' + esc(status) + "</span></p>"
      );
    }
    const delta = stepLabel(exercise.step);
    return (
      '<div class="stepper' + (canEdit ? "" : " locked") + '" data-stop>' +
        '<button type="button" class="step" data-step="-1" data-id="' + esc(id) + '" aria-label="Убавить ' + delta + '"' + disabled + '><span class="sign">−</span><span class="delta">' + delta + "</span></button>" +
        '<label class="weight"><input data-weight-for="' + esc(id) + '" value="' + esc(value) + '" inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-label="Вес"' + disabled + '><span class="unit">кг</span></label>' +
        '<button type="button" class="step" data-step="1" data-id="' + esc(id) + '" aria-label="Прибавить ' + delta + '"' + disabled + '><span class="sign">+</span><span class="delta">' + delta + "</span></button>" +
      "</div>" +
      '<p class="weight-meta"><span>' + esc(exercise.note) + " " + badge + lockNote + '</span><span data-status-for="' + esc(id) + '">' + esc(status) + "</span></p>"
    );
  }

  function backup() {
    const canEdit = unlocked();
    return (
      '<details class="backup"><summary>Веса и синхронизация</summary>' +
      "<p>После «Сохранить» веса уходят на сервер и появляются на других устройствах.</p>" +
      (canEdit
        ? '<div class="row"><button type="button" id="export">Скачать веса</button>' +
          '<label class="file">Загрузить<input id="import" type="file" accept="application/json"></label></div>' +
          '<p id="import-msg"></p>'
        : "<p>Скачать и загрузить файл можно после пароля сверху.</p>") +
      "</details>"
    );
  }

  function renderHome() {
    const note = "Сегодня не силовой день. Открой тренировку, на которую идёшь.";
    const cards = ZAL.days.map((day) =>
      '<a href="' + href(day, chosenScheme()) + '"><strong>' + esc(day.title) + "</strong><span>" + esc(day.kind) + " · вариант " + esc(chosenScheme()) + "</span></a>"
    ).join("");
    const focus = ZAL.focus.map((day) =>
      '<a href="' + href(day, chosenScheme()) + '"><strong>' + esc(day.title) + "</strong><span>" + esc(day.kind) + "</span></a>"
    ).join("");
    app.innerHTML =
      '<header class="top"><div class="brand"><h1>Зал</h1></div></header>' +
      lockBar() +
      '<p class="hint">' + esc(note) + "</p>" +
      '<div class="home-list">' + cards + focus + "</div>" +
      backup();
  }

  function renderList(plan, scheme) {
    const block = blockInfo(new Date());
    const mismatch = scheme !== block.scheme
      ? " Открыт вариант " + scheme + ", в блоке до " + fmt(block.to) + " — " + block.scheme + "."
      : "";
    const rows = plan[scheme].map((slot, index) => {
      const shown = resolveSlot(slot);
      const exercise = ZAL.exercises[shown.id];
      const open = href(plan, scheme, "/s/" + index);
      const cue = shown.cue ? '<p class="cue">' + esc(shown.cue) + "</p>" : "";
      return (
        '<article class="ex">' +
          '<a class="ex-open" href="' + open + '">' +
            '<img class="thumb" alt="" src="' + esc(exercise.image) + '">' +
            "<div><h2>" + (index + 1) + ". " + esc(exercise.title) + "</h2>" +
            '<p class="sets">' + esc(shown.sets) + "</p>" + cue +
            "</div>" +
          "</a>" +
          stepper(shown.id) +
        "</article>"
      );
    }).join("");
    app.innerHTML =
      '<header class="top"><div class="brand"><h1>Зал</h1><p>блок до ' + esc(fmt(block.to)) + "</p></div>" +
      lockBar() +
      chips(plan, scheme) +
      '<div class="dayline"><h2>' + esc(plan.title) + "</h2>" +
      '<div class="scheme" role="group" aria-label="Вариант">' +
      '<button type="button" data-scheme="A" class="' + (scheme === "A" ? "on" : "") + '">A</button>' +
      '<button type="button" data-scheme="B" class="' + (scheme === "B" ? "on" : "") + '">B</button>' +
      "</div></div>" +
      '<p class="hint">' + esc(plan.kind) + ". " + esc(plan.hint) + mismatch + "</p></header>" +
      rows + backup();
  }

  function renderDetail(route) {
    const exercise = route.exercise;
    const gear = gears()[route.id] || "";
    const gearHtml = (exercise.gears || []).map((item) =>
      '<button type="button" data-gear="' + esc(item) + '" data-id="' + esc(route.id) + '" class="' + (gear === item ? "on" : "") + '">' + esc(item) + "</button>"
    ).join("");
    const steps = exercise.steps.map((line) => "<li>" + esc(line) + "</li>").join("");
    const extra = exercise.extra && exercise.extra.length
      ? "<h3>" + esc(exercise.extraTitle || "Ещё") + "</h3><ul>" + exercise.extra.map((line) => "<li>" + esc(line) + "</li>").join("") + "</ul>"
      : "";
    const mistakes = exercise.mistakes.map((line) => "<li>" + esc(line) + "</li>").join("");
    const subs = Object.keys(ZAL.exercises)
      .filter((id) => id !== route.id && ZAL.exercises[id].swap === exercise.swap)
      .sort((a, b) => {
        const left = ZAL.exercises[a].role === exercise.role ? 0 : 1;
        const right = ZAL.exercises[b].role === exercise.role ? 0 : 1;
        if (left !== right) return left - right;
        return ZAL.exercises[a].title.localeCompare(ZAL.exercises[b].title, "ru");
      });
    const inPlan = new Set(route.plan[route.scheme].map((slot) => slot.id));
    const subHtml = subs.length
      ? subs.map((id) => {
          const item = ZAL.exercises[id];
          const mark = inPlan.has(id) ? " · уже в этой тренировке" : "";
          return (
            '<a class="sub" href="' + href(route.plan, route.scheme, "/x/" + encodeURIComponent(id)) + '">' +
              '<img alt="" src="' + esc(item.image) + '">' +
              "<div><strong>" + esc(item.title) + "</strong><span>" + esc(getWeight(id)) + (item.kind === "text" ? "" : " кг") + " · " + esc(item.swap) + mark + "</span></div>" +
            "</a>"
          );
        }).join("")
      : '<p class="empty">Других упражнений на эту мышцу в каталоге нет. Смени снаряд кнопками выше, если они есть.</p>';
    const cue = route.slot && route.slot.cue ? '<p class="cue">' + esc(route.slot.cue) + "</p>" : "";
    const sets = route.slot ? route.slot.sets : "";
    app.innerHTML =
      '<article class="detail">' +
        '<div class="backrow"><button type="button" data-back>Назад</button><a href="' + href(route.plan, route.scheme) + '">К тренировке</a></div>' +
        lockBar() +
        "<h2>" + esc(exercise.title) + "</h2>" +
        (sets ? '<p class="sets">' + esc(sets) + "</p>" : "") +
        cue +
        stepper(route.id) +
        '<button type="button" class="photo" data-zoom data-src="' + esc(exercise.image) + '" data-alt="' + esc(exercise.title) + '">' +
          '<img alt="' + esc(exercise.title) + '" src="' + esc(exercise.image) + '">' +
        "</button>" +
        (gearHtml ? '<h3>Другой снаряд</h3><div class="gear" data-gear-group="' + esc(route.id) + '">' + gearHtml + "</div>" : "") +
        "<h3>Как делать</h3><ol>" + steps + "</ol>" +
        extra +
        "<h3>Ошибки</h3><ul>" + mistakes + "</ul>" +
        "<h3>Если занято — " + esc(exercise.swap) + "</h3>" +
        subHtml +
      "</article>";
    window.scrollTo(0, 0);
  }

  function render() {
    const route = parseRoute();
    if (route.name === "home") renderHome();
    else if (route.name === "detail") renderDetail(route);
    else renderList(route.plan, route.scheme);
    updateSaveBar();
  }

  function markDirty(id) {
    document.querySelectorAll('[data-status-for="' + CSS.escape(id) + '"]').forEach((node) => {
      node.textContent = "не сохранено";
    });
    document.querySelectorAll('[data-estimate-for="' + CSS.escape(id) + '"]').forEach((node) => {
      node.textContent = "";
    });
  }

  function markStatus(id) {
    document.querySelectorAll('[data-status-for="' + CSS.escape(id) + '"]').forEach((node) => {
      node.textContent = "сохранено";
    });
    document.querySelectorAll('[data-estimate-for="' + CSS.escape(id) + '"]').forEach((node) => {
      node.textContent = "";
    });
  }

  app.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-unlock-form]");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector('input[name="pass"]');
    const msg = form.querySelector("[data-lock-msg]");
    const value = input ? String(input.value).trim() : "";
    if (value === PASS) {
      localStorage.setItem(AUTH_KEY, "1");
      render();
      return;
    }
    if (msg) {
      msg.hidden = false;
      msg.textContent = "Неверный пароль";
    }
    if (input) {
      input.value = "";
      input.focus();
    }
  });

  savebar.addEventListener("click", (event) => {
    if (!event.target.closest("[data-save]")) return;
    commitDraft();
  });

  app.addEventListener("click", (event) => {
    const stepBtn = event.target.closest("[data-step]");
    if (stepBtn) {
      if (!unlocked()) return;
      const id = stepBtn.dataset.id;
      const exercise = ZAL.exercises[id];
      const next = bump(getWeight(id), exercise.kind, exercise.step, Number(stepBtn.dataset.step));
      setDraft(id, next);
      document.querySelectorAll('[data-weight-for="' + CSS.escape(id) + '"]').forEach((input) => {
        input.value = next;
      });
      markDirty(id);
      if (navigator.vibrate) navigator.vibrate(8);
      return;
    }
    const gearBtn = event.target.closest("[data-gear]");
    if (gearBtn) {
      const saved = gears();
      const id = gearBtn.dataset.id;
      saved[id] = saved[id] === gearBtn.dataset.gear ? "" : gearBtn.dataset.gear;
      localStorage.setItem(GEAR_KEY, JSON.stringify(saved));
      const group = gearBtn.parentElement;
      group.querySelectorAll("[data-gear]").forEach((btn) => btn.classList.toggle("on", btn.dataset.gear === saved[id]));
      return;
    }
    const schemeBtn = event.target.closest("[data-scheme]");
    if (schemeBtn) {
      localStorage.setItem(SCHEME_KEY, schemeBtn.dataset.scheme);
      const route = parseRoute();
      location.hash = href(route.plan, schemeBtn.dataset.scheme);
      return;
    }
    if (event.target.closest("[data-back]")) {
      if (history.length > 1) history.back();
      else location.hash = "#/home";
      return;
    }
    const photo = event.target.closest("[data-zoom]");
    if (photo) {
      const image = zoom.querySelector("img");
      image.src = photo.dataset.src;
      image.alt = photo.dataset.alt || "";
      zoom.hidden = false;
      return;
    }
    if (event.target.id === "export") {
      const blob = new Blob([localStorage.getItem(KEY) || "{}"], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "zal-weights.json";
      link.click();
    }
  });

  app.addEventListener("input", (event) => {
    const input = event.target.closest("[data-weight-for]");
    if (!input || !unlocked()) return;
    setDraft(input.dataset.weightFor, input.value);
    markDirty(input.dataset.weightFor);
  });

  app.addEventListener("change", (event) => {
    if (event.target.id !== "import") return;
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const msg = document.getElementById("import-msg");
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("format");
        localStorage.setItem(KEY, JSON.stringify(data));
        Object.keys(draft).forEach((id) => delete draft[id]);
        render();
      } catch (err) {
        if (msg) msg.textContent = "Файл не подошёл. Нужен json, который скачан отсюда.";
      }
    };
    reader.readAsText(file);
  });

  zoom.addEventListener("click", () => {
    zoom.hidden = true;
  });

  function bootRoute() {
    if (!location.hash) {
      const day = todayDay();
      if (day) location.replace("#/" + day.id + "/" + chosenScheme());
      else location.replace("#/home");
    }
  }

  function refreshFromServer() {
    if (hasDraft() || syncing) return Promise.resolve();
    return pullWeights().then((ok) => {
      if (ok) render();
    });
  }

  window.addEventListener("hashchange", render);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshFromServer();
  });
  window.addEventListener("focus", refreshFromServer);

  pullWeights().finally(() => {
    bootRoute();
    render();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "zal-updated") {
        location.reload();
      }
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }
})();
