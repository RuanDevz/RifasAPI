const express = require('express');
const nodemailer = require('nodemailer');
const app = express();
app.use(express.json());

const router = express.Router()

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post('/', async (req, res) => {
  const { name, email, ticket } = req.body;

  const mailOptions = {
    from: 'Ruanbatista1509@gmail.com',
    to: 'Ruanbatista1509@outlook.com',
    subject: 'Compra Confirmada',
    text: `Olá ${name}, sua compra foi concluída com sucesso. Seu ticket é ${ticket}.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'E-mail enviado com sucesso' });
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    res.status(500).json({ error: 'Erro ao enviar e-mail' });
  }
});

module.exports = router