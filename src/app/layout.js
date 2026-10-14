import './globals.css';

export const metadata = {
  title: 'Krystal Deck 3D Cassette Player',
  description:
    'Interactive 3D WebGL cassette player with customizable skins, online song search, continuous recommendations, and shareable cassette collections.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
