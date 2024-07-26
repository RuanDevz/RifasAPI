const nodemailer = require('nodemailer');

const sendConfirmationEmail = async (email, name, tickets) => {
  if (!email || !tickets || tickets.length === 0) {
    throw new Error('Invalid email or tickets');
  }

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const ticketList = tickets.map(ticket => ticket.ticket).join(', ');

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Payment Confirmation',
    text: `Hello ${name},\n\nThank you for your purchase. Your tickets are: ${ticketList}\n\nBest regards,\nTeam`,
  };

  if (!mailOptions.to) {
    throw new Error('No recipients defined');
  }

  try {
    await transporter.sendMail(mailOptions);
    console.log('Confirmation email sent successfully');
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    throw error;
  }
};

module.exports = sendConfirmationEmail;
