import './globals.css';

export const metadata = {
  title: 'Voice Chat AI',
  description: 'Voice Chat Agent with Wikipedia Search',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
