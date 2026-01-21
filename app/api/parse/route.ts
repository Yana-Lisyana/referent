import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

// Используем Node.js runtime для cheerio (не Edge)
export const runtime = 'nodejs'
export const maxDuration = 30 // Максимальное время выполнения для Vercel (секунды)

// Увеличиваем таймаут для Vercel (максимум 60 секунд для serverless функций)
const FETCH_TIMEOUT = 30000 // 30 секунд

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Валидация URL
    let targetUrl: URL
    try {
      targetUrl = new URL(url)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Проверяем, что это HTTP/HTTPS
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return NextResponse.json(
        { error: 'Only HTTP and HTTPS URLs are supported' },
        { status: 400 }
      )
    }

    // Получаем HTML страницы с улучшенными заголовками
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'Referer': targetUrl.origin,
          'Origin': targetUrl.origin
        },
        redirect: 'follow',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        // Более детальная обработка ошибок
        if (response.status === 403) {
          return NextResponse.json(
            { 
              error: 'Доступ запрещен (403). Сайт может блокировать автоматические запросы. Попробуйте другой URL или проверьте доступность сайта.',
              statusCode: 403
            },
            { status: 403 }
          )
        }
        if (response.status === 404) {
          return NextResponse.json(
            { 
              error: 'Страница не найдена (404)',
              statusCode: 404
            },
            { status: 404 }
          )
        }
        return NextResponse.json(
          { 
            error: `Ошибка при получении страницы: ${response.status} ${response.statusText}`,
            statusCode: response.status
          },
          { status: response.status }
        )
      }

      const html = await response.text()
      
      if (!html || html.length === 0) {
        return NextResponse.json(
          { error: 'Получена пустая страница' },
          { status: 500 }
        )
      }

      const $ = cheerio.load(html)

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

    // Очистка контента от лишних пробелов и переносов строк
    content = content.replace(/\s+/g, ' ').trim()

    return NextResponse.json({
      date: date || 'Не найдена',
      title: title || 'Не найден',
      content: content || 'Контент не найден'
    })

    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Превышено время ожидания ответа от сервера (таймаут)' },
          { status: 504 }
        )
      }
      
      if (fetchError.message?.includes('fetch failed')) {
        return NextResponse.json(
          { error: 'Не удалось подключиться к серверу. Проверьте правильность URL и доступность сайта.' },
          { status: 503 }
        )
      }
      
      throw fetchError
    }
  } catch (error: any) {
    console.error('Parse error:', error)
    
    // Более информативные сообщения об ошибках
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

