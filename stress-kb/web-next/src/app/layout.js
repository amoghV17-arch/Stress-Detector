import { Archivo, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/context/SessionContext';
import { Navbar } from '@/components/Navbar';

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
});

export const metadata = {
  title: 'StressKB — Keystroke Biometrics Stress Detector',
  description: 'Zero-knowledge cognitive stress estimation from typing rhythm',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${archivo.variable} ${sourceSerif.variable}`}>
      <body>
        <SessionProvider>
          <Navbar />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
