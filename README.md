Админ‑панель для What to Eat? (Next.js + Supabase).

## Запуск локально

1) Скопируйте `.env.local.example` в `.env.local` и заполните ключ:

```bash
cp .env.local.example .env.local
```

2) Установите зависимости и запустите:

```bash
npm install
npm run dev
```

Админка доступна на `http://localhost:3000`.

## Что внутри

- `/products` — добавление продуктов в `product_dictionary`
- `/ingredients` — добавление записей в `recipe_ingredients`
- `/recipes` — добавление записей в `recipes`
- `/schema` — просмотр схемы базы + кнопка «Обновить»

## Обновление схемы

Кнопка «Обновить» запускает `scripts/generate_db_docs.py` из корня репозитория и подтягивает актуальную структуру в `DATABASE_SCHEMA.md` и `database-documentation.html`.

Для работы обновления у вас должны быть:

- рабочая `.venv` в корне репозитория
- заполненный `db_credentials.json`

Если нужно отключить обновление схемы — просто не используйте кнопку.
