import { QRCodeSVG } from "qrcode.react";

export function QrPreview({ value, size = 210 }: { value: string; size?: number }) {
  return <QRCodeSVG value={value} size={size} level="H" marginSize={2} bgColor="#ffffff" fgColor="#0f172a" title="QR personnel du membre AADM" />;
}

