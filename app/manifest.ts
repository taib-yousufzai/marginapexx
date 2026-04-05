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
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
