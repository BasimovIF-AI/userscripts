# Walkthrough — Пошаговое руководство по использованию Auto-Publisher

Данный документ описывает процесс первоначальной установки скрипта `GreasyFork - Auto-Publisher Bridge` и демонстрацию его работы по автоматической публикации скриптов.

---

## 1. Первоначальная установка скрипта в Tampermonkey (делается 1 раз)

1. Откройте прямую ссылку установки скрипта из репозитория:
   [Установить GreasyFork Auto-Publisher Bridge](https://raw.githubusercontent.com/BasimovIF-AI/userscripts/main/greasyfork-auto-publisher.user.js)
2. В открывшемся окне Tampermonkey нажмите кнопку **«Установить»** (Install).
3. Готово! Скрипт активен и готов к автоматической обработке ссылок публикации.

---

## 2. Использование для автоматической публикации скриптов

После установки достаточно открыть специальную ссылку в браузере (или агент запустит её через терминал):

### Публикация нового скрипта (Chance Per Point):
```text
https://greasyfork.org/ru/script_versions/new?auto_publish=steamgifts-chance-per-point.user.js
```
*Что произойдёт:*
1. Страница откроется в вашем браузере.
2. Скрипт мгновенно загрузит код `steamgifts-chance-per-point.user.js` из репозитория GitHub.
3. Вставит его в редактор, выберет Markdown и заполнит описание.
4. В правом верхнем углу начнётся 3-секундный обратный отсчёт.
5. Скрипт автоматически нажмёт кнопку **«Опубликовать скрипт»**!

### Публикация нового скрипта (Group Stats Checker):
```text
https://greasyfork.org/ru/script_versions/new?auto_publish=steamgifts-group-stats-checker.user.js
```

### Публикация нового скрипта (Region Auto-Selector):
```text
https://greasyfork.org/ru/script_versions/new?auto_publish=steamgifts-region-auto-selector.user.js
```

### Обновление существующего скрипта (Unlucky-7 #580030 до v1.4.1):
```text
https://greasyfork.org/ru/scripts/580030-steamgifts-unlucky-7-winner-stats-copy/versions/new?auto_update=steamgifts-unlucky-7-winner-stats-copy.user.js
```
