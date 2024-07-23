const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendConfirmationEmail = (to, name, tickets) => {
  const ticketList = tickets.map(ticket => `Ticket Number: #${ticket.ticket}`).join('\n');

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: 'Ticket Purchase Confirmation',
    text: `
      Hello ${name},

      Your tickets have been successfully purchased!

      ${ticketList}

      Thank you for using our service!

      Best regards,
      Support Team
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });

  return transporter.sendMail(mailOptions);
};

module.exports = sendConfirmationEmail;
