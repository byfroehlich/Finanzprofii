import nodemailer from "nodemailer";
import { config } from "./config.ts";

/** Mail über das eigene Postfach senden – nur nach Freigabe. */
export async function sendeMail(an: string, betreff: string, text: string): Promise<void> {
  const smtp = config.smtp;
  if (!smtp) throw new Error("Mailversand ist nicht eingerichtet (SMTP_USER/SMTP_PASS in engine/.env).");
  const t = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } });
  await t.sendMail({ from: smtp.from, to: an, subject: betreff, text });
}
