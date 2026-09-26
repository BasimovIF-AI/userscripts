# Коллекция пользовательских скриптов (Userscripts)

<p align="center">
  <a href="README.md">English</a> | <b>Русский</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="Лицензия: MIT"></a>
  <a href="https://github.com/BasimovIF-AI/userscripts"><img src="https://img.shields.io/badge/GitHub-BasimovIF--AI%2Fuserscripts-181717?logo=github" alt="Репозиторий GitHub"></a>
  <a href="https://greasyfork.org/ru/users/1522624-basimovif-ai"><img src="https://img.shields.io/badge/GreasyFork-BasimovIF--AI-red.svg" alt="Профиль на GreasyFork"></a>
</p>

Коллекция универсальных скриптов для Tampermonkey и Violentmonkey, предназначенных для автоматизации веб-сервисов, ускорения рутинных операций и улучшения интерфейсов различных сайтов.

---

## 📦 Каталог скриптов

| Скрипт | Версия | Прямая установка (Raw) | Описание |
| :--- | :---: | :---: | :--- |
| **GreasyFork Auto-Publisher Bridge** | `1.0.0` | [Установить](https://raw.githubusercontent.com/BasimovIF-AI/userscripts/main/greasyfork-auto-publisher.user.js) | Автоматизирует публикацию и обновление скриптов на GreasyFork через параметры в URL. |

---

## 🚀 Подробное описание скриптов

### GreasyFork - Auto-Publisher Bridge (`v1.0.0`)
- **Целевые страницы**: `https://greasyfork.org/*/script_versions/new*`, `https://greasyfork.org/*/scripts/*/versions/new*`
- **Ключевые возможности**:
  - Автоматически скачивает исходный код скрипта напрямую с GitHub при открытии страницы с параметрами.
  - Заполняет форму GreasyFork (поддерживает обычные текстовые поля и редактор с подсветкой CodeMirror).
  - Автоматически переключает формат описания на Markdown и добавляет ссылку на репозиторий.
  - Отображает плавающий оверлей с таймером обратного отсчёта (3 секунды) и кнопкой отмены (`[Отмена]`).
  - Автоматически нажимает кнопку отправки формы.

#### Пример использования:
Открытие ссылки в браузере автоматически подгрузит, вставит и опубликует скрипт:
```text
https://greasyfork.org/ru/script_versions/new?auto_publish=steamgifts-chance-per-point.user.js
```

---

## 🛠️ Установка

1. Установите расширение [Tampermonkey](https://www.tampermonkey.net/) или [Violentmonkey](https://violentmonkey.github.io/).
2. Нажмите **Установить** в таблице выше.
3. Подтвердите установку в открывшемся окне расширения.

---

## 📄 Лицензия

Проект распространяется под лицензией [MIT](LICENSE).
