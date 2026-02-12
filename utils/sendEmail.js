import axios from "axios";

export const sendEmail = async ({ email, subject, message }) => {
  try {
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: "Ecommerce App",
          email: process.env.SMTP_MAIL, 
          // ⚠ Must be verified in Brevo dashboard
        },
        to: [
          {
            email: email,
          },
        ],
        subject: subject,
        htmlContent: message,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Email sent successfully via Brevo");
  } catch (error) {
    console.error(
      "Brevo email failed:",
      error.response?.data || error.message
    );
    throw error;
  }
};
