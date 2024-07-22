const nodemailer = require('nodemailer');

// Configure o transporte de e-mail
const transporter = nodemailer.createTransport({
  service: 'gmail', // ou outro serviço de e-mail
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendConfirmationEmail = (to, name, tickets) => {
  const ticketList = tickets.map(ticket => `Ticket Número: #${ticket.ticket}`).join('\n');

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: 'Confirmação de Compra de Tickets',
    text: `
      Olá ${name},

      Seus tickets foram comprados com sucesso!

      ${ticketList}

      Obrigado por usar nosso serviço!

      Atenciosamente,
      Equipe de Suporte
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Erro ao enviar e-mail:', error);
    } else {
      console.log('E-mail enviado:', info.response);
    }
  });

  return transporter.sendMail(mailOptions);
};

module.exports = sendConfirmationEmail;
