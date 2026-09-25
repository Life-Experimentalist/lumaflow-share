import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumaflow",
  description: "Live grid of Lumaflow camera streams",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
