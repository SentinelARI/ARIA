import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: 'ARIA | Morning Brief',
  description: 'Revenue intelligence for fictional Lagos merchants.',
  openGraph: {
    title: 'ARIA | Morning Brief',
    description: 'Revenue intelligence that surfaces only the next action worth a merchant’s time.',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'ARIA Morning Brief' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ARIA | Morning Brief',
    description: 'Revenue intelligence for fictional Lagos merchants.',
    images: ['/opengraph-image']
  }
};

export default function RootLayout({ children }) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
