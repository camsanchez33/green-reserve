import type { Metadata } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GreenReserve — Online Tee Sheet for Golf Courses',
  description: 'Free online booking platform for golf courses. Set up your tee sheet in minutes. Golfers book direct — you keep 100% of green fees.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans bg-paper text-ink antialiased">
        <Nav />
        <main className="pt-16">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
