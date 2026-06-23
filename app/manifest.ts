import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Margin Apex',
    short_name: 'Margin Apex',
    description: 'Advanced Trading App experience',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: '#006400',
    icons: [
      {
        src: '/favicon-32.png?v=7',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/icon-192x192.png?v=7',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512.png?v=7',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/splash-icon.jpg?v=4',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any',
      },
    ],
  };
}
