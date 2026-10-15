export const dynamic = 'force-static';

export default function manifest() {
  return {
    name: 'Krystal KD-01 — 3D Studio Cassette Player',
    short_name: 'Krystal KD-01',
    description:
      'Interactive 3D WebGL portable cassette player with customizable skins, online song search, smart radio recommendations, and background media controls.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#151515',
    categories: ['music', 'entertainment'],
  };
}
