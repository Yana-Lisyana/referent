import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60 // Максимальное время выполнения для Vercel (секунды) - максимум для Hobby плана

const log = (step: string, data?: unknown) => {
  console.log(`[translate] ${step}`, data !== undefined ? data : '')
}

export async function POST(request: NextRequest) {
  log('POST:start')

  try {
    const body = await request.json()
    const { content } = body
    log('request.json:after', { contentLength: content?.length ?? 0 })

    if (!content || typeof content !== 'string') {
      log('validate:fail', { reason: 'Content missing or not string' })
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      )
    }

    // Ограничиваем размер контента для ускорения перевода (примерно 8000 символов)
    const maxContentLength = 8000
    const contentToTranslate = content.length > maxContentLength 
      ? content.substring(0, maxContentLength) + '\n\n[... текст обрезан для ускорения перевода ...]'
      : content
    
    log('content:prepared', { originalLength: content.length, translatedLength: contentToTranslate.length })

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      log('validate:fail', { reason: 'OPENROUTER_API_KEY not found' })
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }

    log('openrouter:before')
    
    // Создаем контроллер для таймаута запроса к OpenRouter (50 секунд, чтобы уложиться в лимит Vercel)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 50000)
    
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'Referent - Article Translator'
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-r1-0528:free',
          messages: [
            {
              role: 'system',
              content: 'Ты профессиональный переводчик. Переведи следующую статью с английского языка на русский язык. Сохрани структуру текста, форматирование и все технические термины переведи корректно.'
            },
            {
              role: 'user',
              content: `Переведи следующую статью на русский язык:\n\n${contentToTranslate}`
            }
          ],
          temperature: 0.3,
          max_tokens: 3000 // Уменьшаем для ускорения
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      log('openrouter:after', { status: response.status, ok: response.ok })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        log('openrouter:error', { status: response.status, errorData })
        
        // Обработка специфичных ошибок OpenRouter
        let errorMessage = errorData.error?.message || `Ошибка при обращении к API перевода: ${response.status}`
        
        // Переводим сообщения об ошибках на русский
        if (errorMessage.includes('Insufficient credits')) {
          errorMessage = 'Недостаточно кредитов на аккаунте OpenRouter. Пожалуйста, пополните баланс на https://openrouter.ai/settings/credits'
        } else if (errorMessage.includes('Invalid API key') || errorMessage.includes('Unauthorized')) {
          errorMessage = 'Неверный API-ключ. Проверьте правильность ключа в файле .env.local'
        } else if (errorMessage.includes('Rate limit')) {
          errorMessage = 'Превышен лимит запросов. Попробуйте позже'
        }
        
        return NextResponse.json(
          { 
            error: errorMessage,
            statusCode: response.status,
            details: errorData.error?.message // Оставляем оригинальное сообщение в details для отладки
          },
          { status: response.status }
        )
      }

      const data = await response.json()
      log('openrouter:success', { hasChoices: !!data.choices })

      const translatedText = data.choices?.[0]?.message?.content
      if (!translatedText) {
        log('error', { reason: 'No translation in response', data })
        return NextResponse.json(
          { error: 'Не удалось получить перевод от API' },
          { status: 500 }
        )
      }

      log('success', { translatedLength: translatedText.length })
      return NextResponse.json({
        translation: translatedText
      })
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        log('openrouter:timeout')
        return NextResponse.json(
          { 
            error: 'Превышено время ожидания ответа от OpenRouter API. Модель работает слишком долго. Попробуйте сократить размер статьи или использовать другую модель.',
            statusCode: 504
          },
          { status: 504 }
        )
      }
      
      throw fetchError
    }

  } catch (error: any) {
    console.error('[translate] error', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    })
    
    return NextResponse.json(
      { 
        error: error.message || 'Ошибка при переводе статьи',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
