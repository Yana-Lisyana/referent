import type { Metadata } from 'next'
import React from 'react'

export const metadata: Metadata = {
  title: 'Референт',
  description: 'Программа Референт',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}

