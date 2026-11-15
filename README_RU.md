# MIRAGE — готовый комплект загрузки Futures Paper Trading

Репозиторий: `takedabrosssss-lgtm/trading-intelligence-pro`  
Проверенная базовая версия: `main` commit `088450d95fa161997006dd3f4c6c2ab309a0dc76`.

## Как применить без терминала и ручного патча

1. Распакуй этот ZIP. Внутри находятся папки `app/`, `tests/`, `.github/` и служебные файлы.
2. Открой репозиторий на GitHub и перейди в `main`.
3. Нажми **Add file → Upload files**.
4. Загрузи всё содержимое распакованной папки, сохраняя структуру каталогов. Обязательно включи скрытую папку `.github/workflows/` и файл `INTEGRATION_PATCH.diff`.
5. Внизу в **Commit changes** выбери создание новой ветки с точным названием `mirage-futures-upload`. Не коммить в `main`.
6. После загрузки открой вкладку **Actions**. Workflow `Prepare MIRAGE Futures integration` сам проверит базовую версию, применит diff к девяти существующим файлам, проверит синтаксис Python и добавит отдельный commit в ту же ветку.
7. Дождись зелёного статуса workflow. После этого в ветке будут и загруженные файлы, и применённые интеграционные изменения. Только тогда открывай Pull Request из `mirage-futures-upload` в `main` для проверки.

**Не запускай Render Deploy и не вливай Pull Request автоматически.** Сначала нужно проверить полный набор тестов и доступность Binance USD-M Futures из Render Oregon.

## Что делает автоматизация

- Патч не применяется к `main`; он применяется только к ветке `mirage-futures-upload`.
- Перед применением проверяется, что upload commit создан непосредственно поверх проверенного базового commit.
- Если базовая версия отличается или `git apply --check` находит конфликт, workflow завершается ошибкой и не записывает интеграционные изменения.
- После успешного применения workflow создаёт commit в той же ветке.
- Workflow не размещает реальные ордера, не меняет настройки биржи, не трогает базу данных и не запускает Render deployment.

Если вкладка Actions показывает ошибку, ничего не сливай в `main`: пришли скриншот ошибки.

## Что входит

- Полные файлы для замены: `app/config.py`, `app/database.py`, `app/market_data.py`, `app/migrations.py`, `app/paper_trading.py`, `app/risk_engine.py`.
- Новый файл: `app/futures_engine.py`.
- Новые тесты в `tests/`.
- `INTEGRATION_PATCH.diff` — интеграция с девятью существующими файлами; его автоматически применяет workflow.
- `.github/workflows/apply-mirage-futures-patch.yml` — автоматизация применения patch в отдельной ветке.
- `BASE_SOURCE_MANIFEST.txt`, `AUDIT_REPORT_RU.md`, `ENV_FUTURES_ADDITIONS.txt`.

## Логика Futures

Новые Paper-сделки используют Binance USDⓈ-M USDT Perpetual, LONG/SHORT, ISOLATED margin, автоматически выбираемое плечо 1–8x, расчёт позиции от риска до стопа, комиссии, проскальзывание и funding. Старые Spot-позиции сохраняются как Spot и продолжают обслуживаться по Spot-котировкам. Futures не подменяются Spot при ошибке API.

Stop Loss/Take Profit контролируются по Mark Price: REST-проверка каждые 5 секунд плюс минутные Mark Price OHLC. Это не tick-level WebSocket и не гарантия срабатывания в ту же миллисекунду. Оценка liquidation price использует фиксированную maintenance-margin ставку и не является точной биржевой liquidation price.

## Результаты локальных тестов комплекта

- `python -m compileall -q app tests` — успешно.
- `pytest -q` в изолированном наборе новых тестов — **19 passed**.
- Полный regression suite существующего приложения в этой среде не запускался.
- Сетевой доступ Render Oregon к `https://fapi.binance.com` не проверен.

Не добавляй переменные из `ENV_FUTURES_ADDITIONS.txt` до завершения проверки интеграции и сетевого smoke test. Live Trading в этой поставке не реализован.
