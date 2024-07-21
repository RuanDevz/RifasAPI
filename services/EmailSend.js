// emailService.js
const nodemailer = require('nodemailer');

// Configure o transporte de e-mail
const transporter = nodemailer.createTransport({
  service: 'gmail', // ou outro serviço de e-mail
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendConfirmationEmail = (to, ticket) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: 'Confirmação de Compra de Ticket',
    text: `
      Olá,

      Seu ticket foi comprado com sucesso!

      Número do Ticket: #${ticket.ticket}
      Nome: ${ticket.name}
      Quantidade: ${ticket.quantity}

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
