'use client'

import { useState } from 'react'

export default function Home() {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeAction, setActiveAction] = useState<string | null>(null)

  const handleAction = async (action: string) => {
    if (!url.trim()) {
      alert('Пожалуйста, введите URL статьи')
      return
    }

    const log = (step: string, data?: unknown) => {
      console.log(`[client] ${step}`, data !== undefined ? data : '')
    }

    setLoading(true)
    setActiveAction(action)
    setResult('')

    log('start', { action, url: url.trim() })

    try {
      const controller = new AbortController()
      // Увеличиваем таймаут для перевода (120 секунд = 2 минуты)
      const timeoutMs = action === 'Перевести статью' ? 120000 : 60000
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      // Сначала парсим статью
      log('fetch:before', { endpoint: '/api/parse' })
      const parseResponse = await fetch('/api/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: controller.signal
      })

      log('fetch:after', { status: parseResponse.status, ok: parseResponse.ok, statusText: parseResponse.statusText })

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json().catch(() => ({}))
        log('fetch:errorResponse', { status: parseResponse.status, errorData })
        throw new Error(errorData.error || `Ошибка ${parseResponse.status}: ${parseResponse.statusText}`)
      }

      log('response.json:before')
      const parseData = await parseResponse.json()
      log('response.json:after', { keys: Object.keys(parseData || {}) })

      // Если действие - перевод, отправляем контент на перевод
      if (action === 'Перевести статью') {
        log('translate:before')
        const translateResponse = await fetch('/api/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: parseData.content }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        log('translate:after', { status: translateResponse.status, ok: translateResponse.ok })

        if (!translateResponse.ok) {
          const errorData = await translateResponse.json().catch(() => ({}))
          log('translate:errorResponse', { status: translateResponse.status, errorData })
          
          // Используем сообщение об ошибке от сервера, если оно есть
          const errorMessage = errorData.error || `Ошибка перевода ${translateResponse.status}: ${translateResponse.statusText}`
          throw new Error(errorMessage)
        }

        const translateData = await translateResponse.json()
        log('translate:success', { hasTranslation: !!translateData.translation })
        
        setResult(translateData.translation || 'Перевод не получен')
      } else {
        clearTimeout(timeoutId)
        const formattedResult = JSON.stringify(parseData, null, 2)
        setResult(formattedResult)
      }
      
      log('success')
    } catch (error: any) {
      console.error('[client] catch', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        isAbort: error?.name === 'AbortError',
        isTypeError: error instanceof TypeError,
      })

      let errorMessage = 'Произошла ошибка'
      if (error.name === 'AbortError') {
        if (action === 'Перевести статью') {
          errorMessage = 'Превышено время ожидания перевода. Статья слишком большая или модель работает медленно. Попробуйте сократить текст или повторить попытку.'
        } else {
          errorMessage = 'Превышено время ожидания. Попробуйте еще раз или используйте другой URL.'
        }
      } else if (error.message) {
        errorMessage = error.message
      } else if (error instanceof TypeError && error.message?.includes('fetch')) {
        errorMessage = 'Не удалось подключиться к серверу. Проверьте подключение к интернету.'
      }

      setResult(`❌ Ошибка: ${errorMessage}`)
    } finally {
      setLoading(false)
      log('finally')
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Референт</h1>
          <p className="text-gray-600">Анализ англоязычных статей с помощью AI</p>
        </div>

        {/* Форма ввода URL */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
            URL англоязычной статьи
          </label>
          <div className="flex gap-3">
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              disabled={loading}
            />
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Действия</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => handleAction('О чем статья?')}
              disabled={loading}
              className={`px-6 py-4 rounded-lg font-medium text-white transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                activeAction === 'О чем статья?'
                  ? 'bg-indigo-600 shadow-lg'
                  : 'bg-indigo-500 hover:bg-indigo-600'
              }`}
            >
              {loading && activeAction === 'О чем статья?' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Обработка...
                </span>
              ) : (
                'О чем статья?'
              )}
            </button>

            <button
              onClick={() => handleAction('Тезисы')}
              disabled={loading}
              className={`px-6 py-4 rounded-lg font-medium text-white transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                activeAction === 'Тезисы'
                  ? 'bg-indigo-600 shadow-lg'
                  : 'bg-indigo-500 hover:bg-indigo-600'
              }`}
            >
              {loading && activeAction === 'Тезисы' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Обработка...
                </span>
              ) : (
                'Тезисы'
              )}
            </button>

            <button
              onClick={() => handleAction('Пост для Telegram')}
              disabled={loading}
              className={`px-6 py-4 rounded-lg font-medium text-white transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                activeAction === 'Пост для Telegram'
                  ? 'bg-indigo-600 shadow-lg'
                  : 'bg-indigo-500 hover:bg-indigo-600'
              }`}
            >
              {loading && activeAction === 'Пост для Telegram' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Обработка...
                </span>
              ) : (
                'Пост для Telegram'
              )}
            </button>

            <button
              onClick={() => handleAction('Перевести статью')}
              disabled={loading}
              className={`px-6 py-4 rounded-lg font-medium text-white transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                activeAction === 'Перевести статью'
                  ? 'bg-indigo-600 shadow-lg'
                  : 'bg-indigo-500 hover:bg-indigo-600'
              }`}
            >
              {loading && activeAction === 'Перевести статью' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Перевод...
                </span>
              ) : (
                'Перевести статью'
              )}
            </button>
          </div>
        </div>

        {/* Блок результата */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Результат</h2>
          <div className="min-h-[200px] p-4 bg-gray-50 rounded-lg border border-gray-200">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <svg className="animate-spin h-12 w-12 text-indigo-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-gray-600">Генерация результата...</p>
                </div>
              </div>
            ) : result ? (
              <div className="prose max-w-none">
                {activeAction === 'Перевести статью' ? (
                  <div className="whitespace-pre-wrap text-gray-800 font-sans">{result}</div>
                ) : (
                  <pre className="whitespace-pre-wrap text-gray-800 font-sans">{result}</pre>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>Результат появится здесь после выбора действия</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
