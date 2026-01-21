# referent
Программа Референт
Project.md - описание проекта

## Установка и запуск

Проект использует pnpm в качестве менеджера пакетов.

### Установка зависимостей
```powershell
pnpm install
```

### Запуск в режиме разработки
```powershell
pnpm dev
```

### Сборка проекта
```powershell
pnpm build
```

### Запуск production версии
```powershell
pnpm start
```

### Линтинг
```powershell
pnpm lint
```

## Проверка работоспособности

### 1. Проверка линтинга и типов
```powershell
pnpm lint
```
Должно вывести: `✔ No ESLint warnings or errors`

### 2. Проверка сборки
```powershell
pnpm build
```
Должна успешно завершиться без ошибок.

### 3. Запуск dev-сервера
```powershell
pnpm dev
```
Сервер запустится на `http://localhost:3000`

### 4. Проверка в браузере
1. Откройте браузер и перейдите на `http://localhost:3000`
2. Должен открыться интерфейс с полем для ввода URL и тремя кнопками:
   - "О чем статья?"
   - "Тезисы"
   - "Пост для Telegram"

### 5. Тестовая проверка API
Можно протестировать API endpoint напрямую:
```powershell
$body = @{ url = "https://example.com/article" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/parse" -Method Post -Body $body -ContentType "application/json"
```
Должен вернуть JSON с полями: `title`, `content`, `date`

### 6. Полная проверка
Все проверки выполняются одной командой:
```powershell
pnpm lint; pnpm build; Write-Host "✓ Все проверки пройдены успешно!"
```