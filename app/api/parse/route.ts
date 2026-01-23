import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

// Используем Node.js runtime для cheerio (не Edge)
export const runtime = 'nodejs'
export const maxDuration = 30 // Максимальное время выполнения для Vercel (секунды)

// Увеличиваем таймаут для Vercel (максимум 60 секунд для serverless функций)
const FETCH_TIMEOUT = 30000 // 30 секунд
const MAX_RETRIES = 3 // Максимальное количество попыток
const RETRY_DELAY_BASE = 1000 // Базовая задержка для ретраев (1 секунда)

// Список реалистичных User-Agents для ротации
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
]

// Функция для получения случайного User-Agent
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

// Функция для создания реалистичных заголовков
function createHeaders(targetUrl: URL, attempt: number = 0): HeadersInit {
  const userAgent = getRandomUserAgent()
  const referer = attempt > 0 
    ? `https://www.google.com/` // Используем Google как referer при ретраях
    : targetUrl.origin

  return {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': attempt > 0 ? 'cross-site' : 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    'Referer': referer,
    'Origin': targetUrl.origin,
    'Viewport-Width': '1920',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  }
}

// Функция для задержки
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Функция для выполнения fetch с ретраями
async function fetchWithRetry(
  url: string,
  targetUrl: URL,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: any = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let timeoutId: NodeJS.Timeout | null = null
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
      
      const response = await fetch(url, {
        headers: createHeaders(targetUrl, attempt),
        redirect: 'follow',
        signal: controller.signal
      })
      
      if (timeoutId) clearTimeout(timeoutId)
      
      // Если получили успешный ответ, возвращаем его
      if (response.ok) {
        return response
      }
      
      // Если получили 403 и это не последняя попытка, делаем ретрай
      if (response.status === 403 && attempt < maxRetries) {
        const delayMs = RETRY_DELAY_BASE * Math.pow(2, attempt) + Math.random() * 500 // Экспоненциальная задержка с небольшим рандомом
        console.log(`403 ошибка, попытка ${attempt + 1}/${maxRetries + 1}, повтор через ${Math.round(delayMs)}мс`)
        await delay(delayMs)
        lastError = response
        continue
      }
      
      // Для других ошибок возвращаем ответ сразу
      return response
      
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId)
      
      // Если это таймаут и не последняя попытка, делаем ретрай
      if (error.name === 'AbortError' && attempt < maxRetries) {
        const delayMs = RETRY_DELAY_BASE * Math.pow(2, attempt)
        console.log(`Таймаут, попытка ${attempt + 1}/${maxRetries + 1}, повтор через ${Math.round(delayMs)}мс`)
        await delay(delayMs)
        lastError = error
        continue
      }
      
      // Для других ошибок или последней попытки выбрасываем ошибку
      throw error
    }
  }
  
  // Если все попытки исчерпаны, выбрасываем последнюю ошибку
  throw lastError || new Error('Все попытки исчерпаны')
}

const log = (step: string, data?: unknown) => {
  console.log(`[parse] ${step}`, data !== undefined ? data : '')
}

export async function POST(request: NextRequest) {
  log('POST:start')

  try {
    log('request.json:before')
    const body = await request.json()
    const url = body?.url
    log('request.json:after', { url: typeof url === 'string' ? url : '(not string)' })

    if (!url || typeof url !== 'string') {
      log('validate:fail', { reason: 'URL missing or not string' })
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(url)
      log('validate:url', { href: targetUrl.href, protocol: targetUrl.protocol })
    } catch (e) {
      log('validate:fail', { reason: 'Invalid URL format', err: String(e) })
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      log('validate:fail', { reason: 'Protocol not http(s)' })
      return NextResponse.json(
        { error: 'Only HTTP and HTTPS URLs are supported' },
        { status: 400 }
      )
    }

    try {
      log('fetchWithRetry:before', { url })
      const response = await fetchWithRetry(url, targetUrl)
      log('fetchWithRetry:after', { status: response.status, ok: response.ok })

      if (!response.ok) {
        log('fetch:notOk', { status: response.status, statusText: response.statusText })
        if (response.status === 403) {
          log('fetch:return403')
          return NextResponse.json(
            { 
              error: 'Доступ запрещен (403). Сайт блокирует автоматические запросы даже после нескольких попыток. Попробуйте другой URL.',
              statusCode: 403,
              suggestion: 'Некоторые сайты имеют строгую защиту от ботов. Попробуйте использовать другой источник статьи.'
            },
            { status: 403 }
          )
        }
        if (response.status === 404) {
          log('fetch:return404')
          return NextResponse.json(
            { 
              error: 'Страница не найдена (404)',
              statusCode: 404
            },
            { status: 404 }
          )
        }
        if (response.status === 429) {
          log('fetch:return429')
          return NextResponse.json(
            { 
              error: 'Слишком много запросов (429). Сайт временно ограничил доступ. Попробуйте позже.',
              statusCode: 429
            },
            { status: 429 }
          )
        }
        log('fetch:returnOther', { status: response.status })
        return NextResponse.json(
          { 
            error: `Ошибка при получении страницы: ${response.status} ${response.statusText}`,
            statusCode: response.status
          },
          { status: response.status }
        )
      }

      log('response.text:before')
      const html = await response.text()
      log('response.text:after', { htmlLength: html?.length ?? 0 })

      if (!html || html.length === 0) {
        log('error', { reason: 'Empty HTML' })
        return NextResponse.json(
          { error: 'Получена пустая страница' },
          { status: 500 }
        )
      }

      log('cheerio.load:before')
      const $ = cheerio.load(html)
      log('cheerio.load:after')

    // Поиск заголовка статьи
    let title = ''
    const titleSelectors = [
      'h1',
      'article h1',
      '.post-title',
      '.article-title',
      '.entry-title',
      '[class*="title"]',
      'meta[property="og:title"]',
      'meta[name="title"]'
    ]

    for (const selector of titleSelectors) {
      if (selector.startsWith('meta')) {
        const metaTitle = $(selector).attr('content')
        if (metaTitle) {
          title = metaTitle.trim()
          break
        }
      } else {
        const element = $(selector).first()
        if (element.length) {
          title = element.text().trim()
          if (title) break
        }
      }
    }

    // Поиск даты публикации
    let date = ''
    const dateSelectors = [
      'time[datetime]',
      'time',
      '[class*="date"]',
      '[class*="published"]',
      '[class*="time"]',
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      '[itemprop="datePublished"]'
    ]

    for (const selector of dateSelectors) {
      if (selector.startsWith('meta')) {
        const metaDate = $(selector).attr('content')
        if (metaDate) {
          date = metaDate.trim()
          break
        }
      } else {
        const element = $(selector).first()
        if (element.length) {
          const datetime = element.attr('datetime') || element.text()
          if (datetime) {
            date = datetime.trim()
            break
          }
        }
      }
    }

    // Поиск основного контента статьи
    let content = ''
    const contentSelectors = [
      'article',
      '.post',
      '.content',
      '.article-content',
      '.entry-content',
      '.post-content',
      '[class*="article"]',
      '[class*="content"]',
      'main',
      '[role="article"]'
    ]

    for (const selector of contentSelectors) {
      const element = $(selector).first()
      if (element.length) {
        // Удаляем ненужные элементы (реклама, навигация и т.д.)
        element.find('script, style, nav, aside, .ad, .advertisement, .sidebar').remove()
        const text = element.text().trim()
        if (text.length > 100) { // Минимальная длина контента
          content = text
          break
        }
      }
    }

    // Если не нашли через селекторы, пробуем найти через структуру
    if (!content) {
      const article = $('article').first()
      if (article.length) {
        article.find('script, style, nav, aside').remove()
        content = article.text().trim()
      }
    }

    // Если все еще нет контента, берем body без скриптов и стилей
    if (!content) {
      const body = $('body')
      body.find('script, style, nav, header, footer, aside').remove()
      content = body.text().trim()
    }

    content = content.replace(/\s+/g, ' ').trim()

    log('success', { titleLen: title.length, contentLen: content.length, dateLen: date.length })
    return NextResponse.json({
      date: date || 'Не найдена',
      title: title || 'Не найден',
      content: content || 'Контент не найден'
    })

    } catch (fetchError: any) {
      console.error('[parse] fetchError', {
        name: fetchError?.name,
        message: fetchError?.message,
        isResponse: fetchError instanceof Response,
        status: fetchError?.status,
      })
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Превышено время ожидания ответа от сервера (таймаут). Попробуйте еще раз.' },
          { status: 504 }
        )
      }
      
      if (fetchError.message?.includes('fetch failed') || fetchError.message?.includes('ECONNREFUSED')) {
        return NextResponse.json(
          { error: 'Не удалось подключиться к серверу. Проверьте правильность URL и доступность сайта.' },
          { status: 503 }
        )
      }
      
      // Если это Response объект (403 после всех попыток)
      if (fetchError instanceof Response) {
        if (fetchError.status === 403) {
          return NextResponse.json(
            { 
              error: 'Доступ запрещен (403). Сайт блокирует автоматические запросы. Попробуйте другой URL.',
              statusCode: 403
            },
            { status: 403 }
          )
        }
      }
      
      throw fetchError
    }
  } catch (error: any) {
    console.error('[parse] error (outer)', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    })
    if (error.message?.includes('Invalid URL')) {
      return NextResponse.json(
        { error: 'Некорректный формат URL' },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Ошибка при парсинге статьи',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

