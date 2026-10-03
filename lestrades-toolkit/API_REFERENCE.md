# Lestrade's (lestrades.com) — Полный справочник API, эндпоинтов и хуков

> **Версия документации:** 1.0.0  
> **Дата инспекции:** Сентябрь 2026  
> **Платформа:** Wedge CMS (SMF fork) / Custom Steam Trading Engine  

Данный документ содержит исчерпывающее техническое описание всех внутренних API-эндпоинтов, AJAX-команд, структур данных, DOM-атрибутов и механизмов безопасности сервиса [Lestrade's](https://lestrades.com). Предназначен для разработчиков браузерных скриптов (Tampermonkey, Violentmonkey), ботов и инструментов автоматизации.

---

## Содержание
1. [Безопасность и шлюз доступа (Anti-Bot / Altcha PoW)](#1-безопасность-и-шлюз-доступа-anti-bot--altcha-pow)
2. [Авторизация, сессии и CSRF](#2-авторизация-сессии-и-csrf)
3. [Search & Autocomplete JSON/XML API (`action=suggest`)](#3-search--autocomplete-jsonxml-api-actionsuggest)
4. [AJAX-команды движка (`action=ajax`)](#4-ajax-команды-движка-actionajax)
5. [Прямые резолверы Steam ID и URL-маршруты](#5-прямые-резолверы-steam-id-и-url-маршруты)
6. [DOM Data-атрибуты (Контракт для Userscripts)](#6-dom-data-атрибуты-контракт-для-userscripts)
7. [RSS и Atom синдикация](#7-rss-и-atom-синдикация)
8. [Клиентские функции и сортировка](#8-клиентские-функции-и-сортировка)
9. [Готовые примеры кода для Tampermonkey](#9-готовые-примеры-кода-для-tampermonkey)

---

## 1. Безопасность и шлюз доступа (Anti-Bot / Altcha PoW)

При прямых HTTP-запросах вне браузера (curl, python, node) сервер возвращает страницу проверки браузера **Altcha** (Proof-of-Work). Браузерные пользователи и Tampermonkey-скрипты проходят её незаметно.

### Протокол прохождения проверки:
1. **Получение задачи:**
   * **Запрос:** `GET https://lestrades.com/captcha/verify.php?action=challenge`
   * **Ответ (JSON):**
     ```json
     {
       "parameters": {
         "algorithm": "PBKDF2/SHA-256",
         "cost": 100,
         "expiresAt": 1790193768,
         "keyLength": 32,
         "keyPrefix": "e1a7",
         "nonce": "6c9c647ad8c36bdd7e3fa3bb34a599e9",
         "salt": "58ce3d68dde7f0f300b1a7f72d78fbd3"
       },
       "signature": "0fbc005a8af7dfbc13358c657c2a7399d19203f9876a5c6e32b132c08dc6f710"
     }
     ```
2. **Вычисление Proof-of-Work:**
   * Ищется 32-битное целое число `counter` (от 0 и далее, big-endian), приписываемое к буферу `nonce`.
   * Вычисляется `PBKDF2(password = nonce + counter, salt = salt, iterations = 100, keylen = 32, digest = SHA-256)`.
   * Результат в hex должен начинаться с `keyPrefix`.
3. **Отправка решения:**
   * **Запрос:** `POST https://lestrades.com/captcha/verify.php`
   * **Заголовки:** `Content-Type: application/x-www-form-urlencoded`
   * **Тело:**
     ```
     return_url=/&altcha=<base64(JSON({ challenge: { parameters, signature }, solution: { counter, derivedKey, time } }))>
     ```
   * **Результат:** `302 Found` на `Location: /`. После этого IP-адрес клиента заносится в белый список севера, и любые последующие запросы отдают реальный контент.

---

## 2. Авторизация, сессии и CSRF

* **Вход через Steam:** `GET https://lestrades.com/login/` перенаправляет на стандартный OpenID 2.0 шлюз `https://steamcommunity.com/openid/login`. При возврате устанавливается защищенная cookie `PHPSESSID`.
* **CSRF-токены:** Сервер Wedge генерирует уникальный токен на каждую сессию. Переменные встроены в footer любой HTML-страницы:
  ```html
  <script>
    we_script = "https://lestrades.com/";
    we_assets = "https://lestrades.com/assets";
    we_sessid = "6527b089842951df4f999adbdb8267a6"; // Значение токена
    we_sessvar = "ead1d96";                          // Имя параметра сессии
  </script>
  ```
  В Tampermonkey они доступны через `window.we_sessvar` и `window.we_sessid` (или `unsafeWindow.*`).
  Любой изменяющий POST-запрос должен включать `&${we_sessvar}=${we_sessid}`.

---

## 3. Search & Autocomplete JSON/XML API (`action=suggest`)

Используется для быстрого поиска на лету через верхнюю панель поиска и автодополнение упоминаний.

> **ВАЖНОЕ ПРАВИЛО:** Чтобы эндпоинт вернул чистый **JSON**, необходимо обязательно передавать заголовок:  
> `X-Requested-With: XMLHttpRequest`  
> Без этого заголовка движок Wedge переходит в режим отладочного шаблона и возвращает сырой PHP `print_r` вместе с HTML-страницей ошибки.

### 3.1. Поиск игр (`suggest_type=game`)
* **URL:** `POST https://lestrades.com/?action=suggest;suggest_type=game`
* **Заголовки:** `Content-Type: application/x-www-form-urlencoded`, `X-Requested-With: XMLHttpRequest`
* **Тело:** `search=<поисковый_запрос>`
* **Ответ (JSON Array):**
  ```json
  [
    {
      "id": 40044,
      "v": "The <b>Witcher</b> 3: Wild Hunt - Complete Edition",
      "f": 0,
      "s": "<div><span style=\"color: #a0cba1\">8 : 23</span>  <span class=\"help ggd processed myhover\">$9.99</span><em>Gog</em></div>",
      "i": "apps/1340380/ad8415b2dfa1ae5bc0b284f289e54bd9a52e4f40/capsule_184x69.jpg"
    }
  ]
  ```
  * `id`: Внутренний ID игры в Lestrade's (`/game/<id>/`)
  * `v`: Название игры с HTML-подсветкой совпадений (`<b>...</b>`)
  * `f`: Флаг / внутренний статус
  * `s`: Готовый HTML-сниппет:
    * `8:23` — соотношение Have : Want
    * `$9.99` — актуальная цена GG.deals
    * `Gog` / `Steam` — магазин привязки
  * `i`: Относительный путь к обложке на Fastly CDN (`//shared.fastly.steamstatic.com/store_item_assets/steam/...`)

### 3.2. Поиск бандлов (`suggest_type=bundle`)
* **URL:** `POST https://lestrades.com/?action=suggest;suggest_type=bundle`
* **Заголовки:** `X-Requested-With: XMLHttpRequest`
* **Тело:** `search=<название_бандла>`
* **Ответ (JSON Array):**
  ```json
  [
    {
      "id": 9335,
      "v": "Humble Bundle: Best of Humble Bundle Indie Fears",
      "s": "<div>14 games - 2026 - Humble Bundle</div>",
      "i": "..."
    }
  ]
  ```

### 3.3. Поиск студий / разработчиков (`suggest_type=studio`)
* **URL:** `POST https://lestrades.com/?action=suggest;suggest_type=studio`
* **Заголовки:** `X-Requested-With: XMLHttpRequest`
* **Тело:** `search=<имя_студии>`
* **Ответ (JSON Array):**
  ```json
  [
    {
      "id": 89276,
      "v": "humbledbag",
      "s": "<div>1 game</div>",
      "i": "apps/3705480"
    }
  ]
  ```

### 3.4. Поиск пользователей (`suggest_type=user` или `member`)
* **URL:** `POST https://lestrades.com/?action=suggest;suggest_type=user`
* **Заголовки:** `Content-Type: application/x-www-form-urlencoded`
* **Тело:** `search=<логин_или_ник>`
* **Ответ (XML):**
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <we>
    <items>
      <item id="/@garkham/" n="9925" a="//avatars.steamstatic.com/774c079530bdcdc89e51764891dab355e5e5771d_medium.jpg"><![CDATA[garkham]]></item>
    </items>
  </we>
  ```
  * `id`: URL профиля пользователя
  * `n`: Внутренний числовой ID пользователя (`u=9925`)
  * `a`: Прямая ссылка на аватар Steam
  * Значение узла: Отображаемый никнейм

---

## 4. AJAX-команды движка (`action=ajax`)

В URL движка параметры можно разделять точкой с запятой (`;`) или амперсандом (`&`).

### 4.1. Обновление цен GG.deals (`sa=gg`)
Официальный шлюз сбора цен от пользователей скрипта `Lestrades-Prices.user.js` для пополнения общей базы сайта.
* **URL:** `POST https://lestrades.com/?action=ajax;sa=gg`
* **Параметры:**
  * `gg`: Значение цены (например `USD|999` или `$9.99`)
  * `app`: Идентификатор игры (`app/12345` или `sub/67890` или `game/slug`)
  * `url`: Слаг на GG.deals (например `the-witcher-3-wild-hunt`)
  * `<we_sessvar>=<we_sessid>`: CSRF токен сессии

### 4.2. Дерево разделов форума (`sa=jumpto`)
* **URL:** `POST https://lestrades.com/?action=ajax;sa=jumpto`
* **Заголовки:** `X-Requested-With: XMLHttpRequest`
* **Параметры (опционально):** `board=<id>`
* **Ответ (JSON):**
  ```json
  [
    { "name": "Lestrade's Lounge" },
    { "level": 0, "id": "https://lestrades.com/official/", "name": "Announcements" },
    { "level": 0, "id": "https://lestrades.com/general/", "name": "Let's Talk!" },
    { "level": 0, "id": "https://lestrades.com/ideas/", "name": "Site Features" },
    { "level": 0, "id": "https://lestrades.com/bugs/", "name": "Site Bugs" },
    { "name": "The Trader Club" },
    { "level": 0, "id": "https://lestrades.com/trading/", "name": "Trading Help" },
    { "level": 0, "id": "https://lestrades.com/deals/", "name": "Good Deals" },
    { "level": 0, "id": "https://lestrades.com/offtopic/", "name": "Playing Around" }
  ]
  ```

### 4.3. Комментарии и «Мысли» (`sa=thought`)
* **URL:** `POST https://lestrades.com/?action=ajax;sa=thought`
* **Параметры:**
  * `cx`: Контекст ветки (например `"thread 0 0"`)
  * `type`: Тип сущности (`game`, `bundle`, `user`, `offer`)
  * `item`: ID сущности (ID игры, ID бандла)
  * `oid`: ID конкретного комментария (для редактирования или лайка)
  * `text`: Текст сообщения
  * `privacy`: Уровень приватности (`0` = публично, `1` = только друзья/участники)
  * `parent`: ID родительского комментария при ответе
  * `like`: Флаг (в URL: `;like;`), если нужно поставить/снять лайк
  * `<we_sessvar>=<we_sessid>`: CSRF токен

### 4.4. Быстрое цитирование (`action=quotefast`)
* **URL:** `POST https://lestrades.com/?action=quotefast`
* **Параметры:** `quote=<msgId>&mode=<0|1>`
* **Ответ:** XML с узлом `<quote>...</quote>`.

---

## 5. Прямые резолверы Steam ID и URL-маршруты

### 5.1. Резолверы Steam AppID и SubID
Lestrade's поддерживает автоматический 301-редирект со стандартных путей Steam на свои внутренние страницы игр:
* `GET https://lestrades.com/app/<steam_appid>/`  
  * **Ответ:** `301 Moved Permanently` -> `Location: https://lestrades.com/game/<lestrades_id>/`
* `GET https://lestrades.com/sub/<steam_subid>/`  
  * **Ответ:** `301 Moved Permanently` -> `Location: https://lestrades.com/game/<lestrades_id>/`

### 5.2. Ссылки на списки пользователей
Каждый раздел доступен как по ЧПУ (с ником), так и по постоянному ID:
| Раздел | Формат ЧПУ | Классический URL (по ID) |
| :--- | :--- | :--- |
| **Профиль** | `/@<username>/` | `/?action=profile;u=<id>` |
| **Tradables** (Обменник) | `/@<username>/tradables/` | `/?action=tradables;u=<id>` |
| **Wishlist** (Список желаемого) | `/@<username>/wishlist/` | `/?action=wishlist;u=<id>` |
| **Library** (Библиотека) | `/@<username>/library/` | `/?action=library;u=<id>` |
| **Blacklist** (Черный список) | `/@<username>/blacklist/` | `/?action=blacklist;u=<id>` |

### 5.3. Матчинг и трейды
* `GET https://lestrades.com/matches/` — Общие совпадения (требует авторизации)
* `GET https://lestrades.com/matches/?tid=<lestrades_id>` — Поиск пользователей, которым нужна эта ваша игра
* `GET https://lestrades.com/matches/?wid=<lestrades_id>` — Поиск пользователей, у которых есть эта игра для вас
* `GET https://lestrades.com/offer/<offer_id>/` — Страница оффера/обмена

---

## 6. DOM Data-атрибуты (Контракт для Userscripts)

Таблицы и карточки игр содержат стандартизированные атрибуты в тегах `<tr>` и `<a>`:

| Атрибут | Пример значения | Описание |
| :--- | :--- | :--- |
| `data-t` | `225651` | Внутренний ID игры в базе данных Lestrade's |
| `data-appid` | `2072450` | Steam AppID приложения |
| `data-subid` | `128345` | Steam SubID пакета/подписки |
| `data-gg` | `573,$,1789846083` | Кэш GG.deals: `цена_в_центах, валюта, unix_timestamp` |
| `data-ggu` | `like-a-dragon-...` | Слаг игры на сайте GG.deals |
| `data-store` | `steam\|225651` | Магазин ключа и внутренний ID |
| `data-h` | `157` | **Have count**: сколько пользователей имеют игру для обмена |
| `data-w` | `653` | **Want count**: сколько пользователей добавили в вишлист |
| `data-rated` | `91` | Рейтинг положительных обзоров в Steam (%) |
| `data-rv` | `6999` | Retail Value (базовая цена) в центах ($69.99) |
| `data-cards` | `10` | Количество карточек Steam (0 если нет) |
| `data-reveal` | `1789846083` | Дедлайн раскрытия/активации бандл-ключа |
| `data-p` | `120` | Наигранное время (в минутах) |
| `data-type` | `bundle` / `game` | Тип комментируемой сущности |
| `data-item` | `9333` | ID комментируемой сущности |
| `data-oid` | `474610` | ID комментария/мысли |

---

## 7. RSS и Atom синдикация

Сервис предоставляет готовые ленты новостей и тем:
* `GET https://lestrades.com/feed/` — Atom 1.0 фид последних сообщений форума
* `GET https://lestrades.com/feed/?sa=news` — Atom 1.0 фид новостей сайта
* `GET https://lestrades.com/feed/?type=rss` — RSS 0.92 совместимый фид

---

## 8. Клиентские функции и сортировка

В глобальной области видимости `window` на страницах списков доступны:
* `lt_change(criteria)`:
  * Переключает сортировку таблицы списков (`alpha`, `alpha_desc`, `added`, `added_desc`, `value`, `value_desc`, `ratio`, `trade`, `wishe`, `rated`, `cards`, `revea`, `playt`).
  * Для страниц с пагинацией выполняет фоновый AJAX-запрос:
    ```javascript
    $('#glist').load(location + ' #glist', { v: 's' + sectionChar, val: sortCode });
    ```
    где `v: 'st'` — сортировка tradables, `'sw'` — wishlist, `'sl'` — library.
* `weUrl(url)`: Хелпер движка для конкатенации путей с сохранением домена и query-параметров.

---

## 9. Готовые примеры кода для Tampermonkey

### Пример 1. Поиск игры по названию через Suggest API
```javascript
// ==UserScript==
// @name         Lestrade's Search Helper
// @match        https://lestrades.com/*
// @grant        none
// ==/UserScript==

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

// Пример вызова:
// searchGames('Hades').then(games => console.log(games));
```

### Пример 2. Получение Lestrade ID по Steam AppID
```javascript
async function getLestradeIdByAppId(appId) {
    const res = await fetch(`https://lestrades.com/app/${appId}/`, {
        method: 'HEAD',
        redirect: 'manual'
    });
    const location = res.headers.get('location'); // например "/game/225651/"
    if (location) {
        const match = location.match(/\/game\/(\d+)\//);
        return match ? match[1] : null;
    }
    return null;
}
```

### Пример 3. Сбор всех игр со страницы со всеми метаданными
```javascript
function extractGamesFromPage() {
    const rows = document.querySelectorAll('tr[data-t]');
    return Array.from(rows).map(tr => {
        const titleLink = tr.querySelector('a[data-appid], a[href*="/game/"]');
        return {
            lestradesId: tr.getAttribute('data-t'),
            appId: tr.getAttribute('data-appid') || (titleLink ? titleLink.getAttribute('data-appid') : null),
            title: titleLink ? titleLink.textContent.trim() : null,
            haveCount: parseInt(tr.getAttribute('data-h') || '0', 10),
            wantCount: parseInt(tr.getAttribute('data-w') || '0', 10),
            rating: parseInt(tr.getAttribute('data-rated') || '0', 10),
            retailValueCents: parseInt(tr.getAttribute('data-rv') || '0', 10),
            cardsCount: parseInt(tr.getAttribute('data-cards') || '0', 10),
            ggDealsData: tr.getAttribute('data-gg') // "цена,валюта,таймстамп"
        };
    });
}
```

### Пример 4. Отправка обновленной цены GG.deals в базу сайта
```javascript
function reportGGPrice(appId, priceString, ggUrlSlug) {
    if (!window.we_sessvar || !window.we_sessid) {
        console.error("CSRF tokens not found!");
        return;
    }
    const body = new URLSearchParams({
        gg: priceString,
        app: appId.startsWith('app/') ? appId : `app/${appId}`,
        url: ggUrlSlug,
        [window.we_sessvar]: window.we_sessid
    });

    fetch('https://lestrades.com/?action=ajax;sa=gg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    }).then(res => console.log("Price reported, status:", res.status));
}
```
