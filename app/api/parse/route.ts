import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Получаем HTML страницы
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      redirect: 'follow'
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.statusText}` },
        { status: response.status }
      )
    }

    const html = await response.text()
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

  } catch (error: any) {
    console.error('Parse error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to parse article' },
      { status: 500 }
    )
  }
}

