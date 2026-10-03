import nodemailer from "nodemailer";
import { z } from "zod";
export const emailAddress = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export function smtpConfigured() {
  return !!process.env.SMTP_HOST && !!process.env.SMTP_FROM;
}
export async function sendMail(to: string, subject: string, text: string) {
  if (!smtpConfigured()) throw new Error("SMTP unavailable");
  const recipient = emailAddress.parse(to),
    from = emailAddress.parse(process.env.SMTP_FROM);
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(process.env.SMTP_PORT || "587");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  try {
    await transport.sendMail({
      from,
      to: recipient,
      subject,
      text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } finally {
    transport.close();
  }
}
