export const metadata = {title: 'CPMCRM2', description: 'CRM'};
export default function RootLayout({children}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
