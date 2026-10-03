# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-24

### Added
- Полная техническая инспекция платформы Lestrade's (`lestrades.com`).
- Документ `API_REFERENCE.md`:
  - Описание протокола прохождения защиты Altcha PoW (PBKDF2/SHA-256).
  - Спецификация Live Search & Suggest JSON/XML API (`action=suggest`).
  - Спецификация AJAX-команд Wedge (`sa=gg`, `sa=jumpto`, `sa=thought`, `action=quotefast`).
  - Маршруты прямого резолвинга Steam AppID (`/app/<id>/`) и SubID (`/sub/<id>/`).
  - Полный контракт DOM data-атрибутов (`data-t`, `data-appid`, `data-subid`, `data-gg`, `data-h`, `data-w`, `data-rated`, `data-rv`, `data-cards`, `data-reveal`).
  - Готовые сниппеты кода для Tampermonkey (поиск, резолвинг, парсинг, отправка цен).
- Документ `PROJECT.md`:
  - Архитектурная карта файлов и системных связей.
  - Описание модели сущностей (Games, Bundles, Users, Offers).
  - Разбор неочевидных решений и подводных камней (разделители `;`, заголовок `X-Requested-With`, CSRF-токены `we_sessvar=we_sessid`).
- Базовый `README.md` с инструкциями и примерами быстрого старта.
