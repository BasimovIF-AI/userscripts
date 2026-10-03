# Lestrade's (lestrades.com) — API Reference & Userscripts Toolkit

Справочник по внутренним API, структуре данных, эндпоинтам и механизмам платформы обмена игровыми ключами [Lestrade's](https://lestrades.com), а также инструментарий для разработки браузерных Tampermonkey / Violentmonkey скриптов.

---

## 📌 Назначение репозитория

1. **Технический справочник API:** Полная документация по внутренним JSON/XML эндпоинтам, AJAX-командам движка Wedge, механизмам авторизации, защиты от ботов и резолверам Steam ID.
2. **База знаний для юзерскриптов:** Готовые шаблоны, контракты DOM data-атрибутов (`data-t`, `data-appid`, `data-gg`, `data-h`, `data-w` и др.) и примеры функций интеграции для расширений Tampermonkey/Violentmonkey.
3. **Автоматизация и парсинг:** Руководство по взаимодействию с платформой из скриптов Node.js / Python с учетом PoW-проверки Altcha.

---

## 📂 Структура документации

* [**`API_REFERENCE.md`**](API_REFERENCE.md) — Главный технический справочник:
  * Алгоритм прохождения PoW-капчи Altcha (PBKDF2/SHA-256).
  * Поисковый Suggest JSON/XML API (`action=suggest`).
  * AJAX-команды движка Wedge (`action=ajax;sa=gg`, `sa=jumpto`, `sa=thought`).
  * Прямой резолвинг Steam AppID / SubID (`/app/<id>/` -> `/game/<id>/`).
  * Контракт DOM data-атрибутов для скриптов.
  * Готовые примеры функций для Tampermonkey.
* [**`AGENTS.md`**](AGENTS.md) — Операционный мануал:
  * Архитектурные правила и внутренняя модель сущностей.
  * Контракты эндпоинтов и хуки движка Wedge.
* [**`CHANGELOG.md`**](CHANGELOG.md) — Журнал изменений версий проекта (SemVer / Keep a Changelog).
* [**`build.ps1`**](build.ps1) — Автоматизация валидации и упаковки снимка исходников в `archives/`.

---

## 🚀 Быстрый старт (Примеры использования)

### 1. Поиск игр в Tampermonkey (Suggest API)
```javascript
async function searchGames(query) {
    const res = await fetch('https://lestrades.com/?action=suggest;suggest_type=game', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: new URLSearchParams({ search: query })
    });
    return await res.json();
}

// Использование:
const results = await searchGames('Resident Evil');
console.log(results);
```

### 2. Прямой резолвинг Steam AppID в Lestrade ID
```javascript
async function getLestradeIdBySteamAppId(appId) {
    const res = await fetch(`https://lestrades.com/app/${appId}/`, {
        method: 'HEAD',
        redirect: 'manual'
    });
    const loc = res.headers.get('location');
    return loc ? loc.match(/\/game\/(\d+)\//)?.[1] : null;
}
```

---

## 🛠 Требования к окружению

* Для браузерных скриптов: Браузер Chromium / Firefox с расширением **Tampermonkey** или **Violentmonkey**.
* Для standalone скриптов: **Node.js** v18+ или **Python** 3.10+.

---

## 📄 Лицензия
Документация и справочные материалы подготовлены для образовательных целей и разработки расширений сообщества. Права на сайт принадлежат его авторам (Nao / Wedge.org).

