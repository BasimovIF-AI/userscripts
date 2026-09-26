# PROJECT.md — Главный справочник архитектуры репозитория Userscripts

## 1. Карта файлов и назначение

| Файл | Тип | Точка входа / `@match` | Назначение |
| :--- | :---: | :--- | :--- |
| `greasyfork-auto-publisher.user.js` | Userscript | `https://greasyfork.org/*/script_versions/new*` & `.../scripts/*/versions/new*` | Автоматизация загрузки кода с GitHub и нажатия кнопки публикации на GreasyFork. |
| `README.md` | Doc | — | Каталог скриптов и инструкции (EN). |
| `README.ru.md` | Doc | — | Каталог скриптов и инструкции (RU). |
| `CHANGELOG.md` | Doc | — | Журнал версий по стандарту Keep a Changelog. |
| `walkthrough.md` | Doc | — | Пошаговое руководство по использованию и интеграции. |
| `LICENSE` | Legal | — | Лицензия MIT. |
| `.gitignore` | Config | — | Исключение артефактов и служебных файлов. |

---

## 2. Архитектура и Data Flow: `greasyfork-auto-publisher`

```
  Пользователь / AI Агент
            │
            │  Start-Process "https://greasyfork.org/ru/script_versions/new?auto_publish=file.user.js"
            ▼
    [Браузер с активной сессией GreasyFork]
            │
            ├──> GreasyFork загружает страницу со своим CSRF-токеном
            │
            ├──> [greasyfork-auto-publisher.user.js] перехватывает URL-параметры
            │       │
            │       ├──> GM_xmlhttpRequest на raw.githubusercontent.com/...
            │       │
            │       ├──> Заполнение поля кода (textarea / CodeMirror)
            │       │
            │       ├──> Выбор Markdown и заполнение доп. описания
            │       │
            │       └──> 3-секундный таймер в плавающем UI (с кнопкой [Отмена])
            │
            ▼
   Авто-клик Submit ("Опубликовать скрипт")
            │
            └──> Скрипт опубликован и доступен в поиске на обоих языках!
```

---

## 3. Поддерживаемые URL параметры

1. **`auto_publish`**: имя файла из репозитория по умолчанию (`BasimovIF-AI/steamgifts-userscripts/main/`), который нужно создать.  
   *Пример:* `?auto_publish=steamgifts-chance-per-point.user.js`
2. **`auto_update`**: имя файла для страницы обновления существующего скрипта.  
   *Пример:* `.../scripts/580030/versions/new?auto_update=steamgifts-unlucky-7-winner-stats-copy.user.js`
3. **`auto_url`**: прямая произвольная ссылка на любой `.user.js` файл в интернете.
4. **`repo`**: кастомное имя репозитория (по умолчанию `steamgifts-userscripts`).
5. **`user`**: кастомный GitHub-пользователь (по умолчанию `BasimovIF-AI`).
6. **`branch`**: ветка репозитория (по умолчанию `main`).

---

## 4. Нетривиальные решения и особенности реализации

1. **Обход проблемы SameSite Cookie:**
   - Вместо межсайтового запроса со сторонних страниц скрипт выполняется **непосредственно внутри домена GreasyFork**, используя нативные куки сессии браузера и оригинальный валидный `authenticity_token` формы.
2. **Двойная поддержка редакторов:**
   - GreasyFork позволяет включать подсветку синтаксиса на базе CodeMirror. Скрипт проверяет наличие `.CodeMirror?.CodeMirror`, вызывая `setValue()`, и одновременно заполняет нативный `textarea` с вызовом событий `input` и `change`.
3. **Защитный интервал (Grace Period):**
   - 3-секундный обратный отсчёт предотвращает случайные ошибочные отправки и позволяет пользователю отменить действие в 1 клик (`[🛑 Отменить отправку]`).
