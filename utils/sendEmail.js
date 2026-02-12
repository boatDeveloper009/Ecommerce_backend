import nodeMailer from "nodemailer";

export const sendEmail = async ({ email, subject, message }) => {
  const transporter = nodeMailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Must be false for port 587
    auth: {
      user: process.env.SMTP_MAIL,
      pass: process.env.SMTP_PASSWORD, // Must be a 16-digit App Password
    },
    tls: {
      rejectUnauthorized: false, // Essential for cloud hosting environments
    },
    connectionTimeout: 10000, // Increased to 10s for Render's free tier
  });

  const options = {
    from: process.env.SMTP_MAIL,
    to: email,
    subject,
    html: message,
  };

  await transporter.sendMail(options);
};