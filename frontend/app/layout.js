import './globals.css';

export const metadata = {
  title: 'ARIA | Morning Brief',
  description: 'Revenue intelligence for a fictional Lagos fabric merchant.'
};

export default function RootLayout({ children }) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
