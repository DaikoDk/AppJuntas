import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export async function sendEmail(subject, htmlContent) {
  const to = process.env.GMAIL_USER;
  try {
    const info = await getTransporter().sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject,
      html: htmlContent,
    });
    console.log(`📧 Email enviado: "${subject}" -> ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`❌ Error enviando email "${subject}":`, err.message);
    return false;
  }
}
