import './globals.css';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export const metadata = {
  title: {
    default: 'Krystal KD-01 — 3D Studio Cassette Player',
    template: '%s | Krystal KD-01',
  },
  description:
    'Krystal KD-01 is an interactive 3D WebGL portable cassette player with customizable anodized finishes, full-length online song streaming, smart song radio recommendations, background media controls, and shareable cassette collections.',
  applicationName: 'Krystal KD-01',
  keywords: [
    'Krystal KD-01',
    '3D Cassette Player',
    'WebGL Walkman',
    'Interactive Music Player',
    'Three.js Cassette Deck',
    'Online Music Streaming',
    'Portable Cassette Player',
    'Adit-Yah',
  ],
  authors: [{ name: 'Adit-Yah', url: 'https://x.com/Adidotdev' }],
  creator: 'Adit-Yah',
  publisher: 'Krystal Audio Lab',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: 'Krystal KD-01',
    statusBarStyle: 'default',
  },
  openGraph: {
    type: 'website',
    siteName: 'Krystal KD-01',
    title: 'Krystal KD-01 — 3D Studio Cassette Player',
    description:
      'Interactive 3D WebGL portable cassette player with customizable skins, online song search, continuous smart radio recommendations, and shareable cassette collections.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Krystal KD-01 — 3D Studio Cassette Player',
    description:
      'Interactive 3D WebGL portable cassette player with customizable skins, online song search, continuous smart radio recommendations, and shareable cassette collections.',
    creator: '@Adidotdev',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Krystal KD-01',
  alternateName: 'Krystal KD-01 3D Studio Cassette Player',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any',
  description:
    'Interactive 3D WebGL portable cassette player with customizable anodized finishes, full-length online song search, smart song radio recommendations, and shareable cassette collections.',
  author: {
    '@type': 'Person',
    name: 'Adit-Yah',
    url: 'https://x.com/Adidotdev',
  },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://itunes.apple.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://music-api.gdstudio.xyz" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://itunes.apple.com" />
        <link rel="dns-prefetch" href="https://music-api.gdstudio.xyz" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

