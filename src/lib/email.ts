import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT ?? "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.SMTP_USER) return;
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}

export async function sendApplicationConfirmation(email: string, name: string, jobTitle: string) {
  await sendEmail({
    to: email,
    subject: `Application received — ${jobTitle}`,
    html: `<p>Hi ${name},</p><p>We've received your application for <strong>${jobTitle}</strong> via Reqr. Our AI will review it and you'll hear back soon.</p><p>— Reqr by Shiprocket</p>`,
  });
}
