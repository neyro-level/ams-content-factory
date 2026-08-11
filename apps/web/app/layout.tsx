import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AMS Content Factory',
  description: 'Операционная система полного цикла производства контента.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
