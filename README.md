# 🚀 Userscripts Central Monorepo

Единый централизованный моно-репозиторий авторских пользовательских скриптов (Userscripts для Tampermonkey / Violentmonkey) пользователя [BasimovIF-AI](https://github.com/BasimovIF-AI).

Каждый скрипт разрабатывается и отлаживается в изолированной среде, а чистовые релизы и документация консолидируются в данном репозитории.

---

## 📦 Каталог юзерскриптов

| Каталог | Назначение / Платформа | Версия | Описание |
|---|---|---|---|
| [`greasyfork-auto-publisher/`](./greasyfork-auto-publisher/) | GreasyFork Bridge | v1.1.0 | Автоматизация загрузки, заполнения форм и публикации скриптов на платформе GreasyFork. |
| [`steamgifts/`](./steamgifts/) | SteamGifts Suite | v1.1.0 | Пакет из 4 скриптов: расчет шанса на очко, статистика групп, авто-выбор региона, копирование победителей. |
| [`aistudio-folders/`](./aistudio-folders/) | Google AI Studio | v1.5.0 | Древовидная организация промптов, поиск, каталогизация и быстрый доступ к промптам в интерфейсе AI Studio. |
| [`wb-ozon-comparator/`](./wb-ozon-comparator/) | Wildberries / Ozon | v1.0.0 | Сравнение цен, характеристик и остатков товаров между маркетплейсами Wildberries и Ozon. |
| [`steam-licenses/`](./steam-licenses/) | Steam Store & Account | v1.4.0 | Менеджер лицензий Steam: проверка наличия, массовая активация и фильтрация библиотеки. |
| [`steamdb-links/`](./steamdb-links/) | Steam Store | v1.2.0 | Добавление прямых ссылок на SteamDB на страницах магазина Steam. |
| [`huggingface-notes/`](./huggingface-notes/) | Hugging Face | v1.1.0 | Заметки, теги и закладки для моделей, датасетов и спейсов на платформе Hugging Face. |
| [`school-pocket-money/`](./school-pocket-money/) | Электронный дневник | v1.0.0 | Расчет карманных денег по оценкам, виджеты и экспорт успеваемости из электронного дневника. |
| [`lestrades-toolkit/`](./lestrades-toolkit/) | Lestrades API & Web | v1.0.0 | Инструментарий интеграции с Lestrades: сбор данных, сессии и аналитика обмена ключами. |

---

## 🛠️ Архитектура и стандарты разработки

- **Среда выполнения:** Tampermonkey / Violentmonkey в браузерах Chrome, Firefox, Edge.
- **Стандарты документации (rev 8):** Каждый каталог содержит операционный мануал `AGENTS.md`, `README.md`, журнал изменений `CHANGELOG.md` и скрипт сборки `build.ps1`.
- **Безопасность (Strict Deny-All Allowlist):** В репозиторий категорически запрещен коммит временных дампов, личных заметок, баз данных или токенов авторизации.
