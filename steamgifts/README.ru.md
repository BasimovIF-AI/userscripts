# Набор юзерскриптов для SteamGifts

<p align="center">
  <a href="README.md">English</a> | <b>Русский</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="Лицензия: MIT"></a>
  <a href="https://github.com/BasimovIF-AI/steamgifts-userscripts"><img src="https://img.shields.io/badge/GitHub-BasimovIF--AI%2Fsteamgifts--userscripts-181717?logo=github" alt="Репозиторий GitHub"></a>
  <a href="https://greasyfork.org/ru/users/1522624-basimovif-ai"><img src="https://img.shields.io/badge/GreasyFork-BasimovIF--AI-red.svg" alt="Профиль на GreasyFork"></a>
</p>

Коллекция легковесных и быстрых скриптов для Tampermonkey / Violentmonkey, предназначенных для улучшения и автоматизации работы с сайтом [SteamGifts](https://www.steamgifts.com).

> **Документация:** [AGENTS.md](AGENTS.md) | [CHANGELOG.md](CHANGELOG.md) | [build.ps1](build.ps1)

---

## 📦 Обзор скриптов

| Скрипт | Версия | GreasyFork | Прямая установка (Raw) | Описание |
| :--- | :---: | :---: | :---: | :--- |
| **Chance Per Point (‱)** | `7.0.0` | [Открыть](https://greasyfork.org/ru/scripts/by-site/steamgifts.com?filter_locale=0) | [Установить](https://raw.githubusercontent.com/BasimovIF-AI/steamgifts-userscripts/main/steamgifts-chance-per-point.user.js) | Расчёт шанса на победу в базисных пунктах (‱) и панель фильтрации раздач. |
| **Group Stats Checker** | `1.7.0` | [Открыть](https://greasyfork.org/ru/scripts/by-site/steamgifts.com?filter_locale=0) | [Установить](https://raw.githubusercontent.com/BasimovIF-AI/steamgifts-userscripts/main/steamgifts-group-stats-checker.user.js) | Проверка статистики в группах раздачи и авто-комментарий автору. |
| **Region Auto-Selector** | `1.5.0` | [Открыть](https://greasyfork.org/ru/scripts/by-site/steamgifts.com?filter_locale=0) | [Установить](https://raw.githubusercontent.com/BasimovIF-AI/steamgifts-userscripts/main/steamgifts-region-auto-selector.user.js) | Автовыбор стран через вкладку SteamDB при создании раздачи (обход Cloudflare). |
| **Unlucky-7 Winner Stats & Copy** | `1.4.1` | [GreasyFork #580030](https://greasyfork.org/ru/scripts/580030-steamgifts-unlucky-7-winner-stats-copy) | [Установить](https://raw.githubusercontent.com/BasimovIF-AI/steamgifts-userscripts/main/steamgifts-unlucky-7-winner-stats-copy.user.js) | Статистика победителей группы Unlucky-7 и быстрое копирование для отчёта. |

---

## 🚀 Возможности и описание

### 1. SteamGifts - Chance Per Point (‱) (`v7.0.0`)
- **Целевая страница**: `https://www.steamgifts.com/giveaways/entered*`
- **Что делает**:
  - Рассчитывает шанс на победу за одно затраченное очко: `(Копии / (Участники * Очки)) * 10 000‱`.
  - Добавляет отдельный столбец в таблицу активных участий.
  - Добавляет панель фильтрации сверху для скрытия раздач с шансом выше заданного порога.
  - Двуязычный интерфейс (RU/EN), автоматически определяющий язык браузера.

---

### 2. SteamGifts - Group Stats Checker (Universal) (`v1.7.0`)
- **Целевая страница**: `https://www.steamgifts.com/giveaway/*`
- **Что делает**:
  - Находит группы раздачи и вставляет компактные кнопки для проверки вашей личной статистики.
  - Запрашивает и сверяет отправленные/полученные подарки и баланс стоимости в долларах.
  - Интерактивный просмотр: по клику разворачивается детальная математическая формула и общее число побед (`Gifts Won`).
  - Цветовая валидация: зелёный цвет — расчёты сошлись с сайтом, красный — есть расхождение.
  - Автоматически подставляет вежливую благодарность создателю раздачи (`Thanks a lot ...`), если поле комментария пустое.

---

### 3. SteamGifts - Region Auto-Selector via SteamDB Tab (`v1.5.0`)
- **Целевые страницы**: `https://www.steamgifts.com/giveaways/new`, `https://steamdb.info/sub/*`
- **Что делает**:
  - Избавляет от необходимости вручную отмечать десятки стран при создании раздачи с региональными ограничениями.
  - Достаточно указать числовой SubID пакета из SteamDB (например `828967`) и нажать **Применить**.
  - Открывает временную вкладку SteamDB для фонового парсинга данных (беспрепятственный обход Cloudflare) и автоматически закрывает её.
  - Автоматически проставляет галочки нужных стран на SteamGifts и предупреждает о несовпадающих кодах стран.

---

### 4. SteamGifts - Unlucky-7 Winner Stats & Copy (`v1.4.1`)
- **Целевая страница**: `https://www.steamgifts.com/giveaway/*/winners`
- **Что делает**:
  - Работает на странице победителей, если раздача создана для участников группы `Unlucky-7`.
  - Отображает баланс подарков и суммы победителя с раскрываемой математической формулой по клику.
  - Кнопка копирования в буфер обмена в 1 клик для ведения отчётности в группе:
    - До 8 побед включительно: `GA: <url>\nWinner: <user> (Xth win)`
    - Более 8 побед: `GA: <url>\nWinner: <user> (Gifter, +X)`

---

## 🛠️ Установка

1. Установите расширение для управления пользовательскими скриптами:
   - [Tampermonkey](https://www.tampermonkey.net/) (Рекомендуется)
   - [Violentmonkey](https://violentmonkey.github.io/)
2. Нажмите ссылку **Установить** в таблице выше или перейдите на страницу скрипта на [GreasyFork](https://greasyfork.org/ru/users/1522624-basimovif-ai).
3. Подтвердите установку скрипта в открывшемся окне расширения.

---

## 📄 Лицензия

Проект распространяется под лицензией [MIT](LICENSE).
