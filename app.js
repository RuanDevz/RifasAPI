require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_API_KEY_TEST);
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./models");
const sendConfirmationEmail = require('./services/EmailSend'); // Importa o serviço de e-mail

const app = express();

app.use(cors());
app.use(express.json());
app.use(bodyParser.raw({ type: "application/json" }));

let ticketsDisponiveis = 20000;

app.get("/tickets-restantes", (req, res) => {
  res.json({ ticketsDisponiveis });
});

app.post("/create-checkout", async (req, res) => {
  const totalQuantity = req.body.products.reduce((acc, product) => acc + product.quantity, 0);

  if (totalQuantity > ticketsDisponiveis) {
    return res.status(400).json({ error: "Não há tickets suficientes disponíveis." });
  }

  const items = req.body.products.map((product) => ({
    price_data: {
      currency: "brl",
      product_data: {
        name: product.name,
      },
      unit_amount: parseInt(`${product.price}00`),
    },
    quantity: product.quantity,
  }));

  const session = await stripe.checkout.sessions.create({
    line_items: items,
    mode: "payment",
    success_url: `${process.env.FRONT_END_URL}/payment-confirmation`,
    cancel_url: `${process.env.FRONT_END_URL}/payment-confirmation?canceled=true`,
  });

  res.send({ url: session.url });
});

app.post("/reduce-ticket", (req, res) => {
  const { quantity } = req.body;

  if (ticketsDisponiveis >= quantity) {
    ticketsDisponiveis -= quantity;
    res.json({ message: "Ticket(s) reduzido(s) com sucesso", ticketsDisponiveis });
  } else {
    res.status(400).json({ error: "Não há tickets suficientes disponíveis." });
  }
});

app.post("/generate-ticket", async (req, res) => {
  const { name, email, quantity } = req.body;

  if (!name || !email || !quantity) {
    return res.status(400).json({ error: "Nome, email e quantidade são obrigatórios" });
  }

  try {
    let ticketNumber;
    let ticketExists = true;

    while (ticketExists) {
      ticketNumber = Math.floor(Math.random() * 1000000) + 1;
      const existingTicket = await db.Ticket.findOne({
        where: { ticket: ticketNumber },
      });
      if (!existingTicket) {
        ticketExists = false;
      }
    }

    const newTicket = await db.Ticket.create({
      name,
      email,
      ticket: ticketNumber,
      quantity
    });

    // Envia e-mail de confirmação
    await sendConfirmationEmail(email, newTicket);

    res.json({
      message: "Ticket gerado com sucesso",
      ticket: newTicket,
    });
  } catch (error) {
    console.error("Error generating ticket:", error);
    res.status(500).json({ error: "Erro ao gerar ticket" });
  }
});

app.get("/ticket-info/:ticketNumber", async (req, res) => {
  const { ticketNumber } = req.params;

  try {
    const ticket = await db.Ticket.findOne({
      where: { ticket: ticketNumber }
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket não encontrado." });
    }

    res.json({
      name: ticket.name,
      email: ticket.email,
      ticket: ticket.ticket,
      quantity: ticket.quantity
    });
  } catch (error) {
    console.error("Error fetching ticket info:", error);
    res.status(500).json({ error: "Erro ao buscar informações do ticket" });
  }
});

const PORT = process.env.PORT || 5000;
db.sequelize.sync().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
