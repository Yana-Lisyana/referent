import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60 // Максимальное время выполнения для Vercel (секунды)

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

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      log('validate:fail', { reason: 'OPENROUTER_API_KEY not found' })
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }

    log('openrouter:before')
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
            content: `Переведи следующую статью на русский язык:\n\n${content}`
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    })

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
