require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_API_KEY_TEST);
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./models");
const sendConfirmationEmail = require('./services/EmailSend');

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

app.post("/generate-tickets", async (req, res) => {
  const { name, email, quantity } = req.body;

  if (!name || !email || !quantity || quantity <= 0) {
    return res.status(400).json({ error: "Nome, email e quantidade são obrigatórios e a quantidade deve ser maior que zero" });
  }

  if (quantity > ticketsDisponiveis) {
    return res.status(400).json({ error: "Não há tickets suficientes disponíveis." });
  }

  try {
    const tickets = [];

    for (let i = 0; i < quantity; i++) {
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
        quantity: 1,
      });

      tickets.push(newTicket);
    }

    ticketsDisponiveis -= quantity;


    await sendConfirmationEmail(email, name, tickets);

    res.json({
      message: "Tickets gerados com sucesso",
      tickets,
    });
  } catch (error) {
    console.error("Error generating tickets:", error);
    res.status(500).json({ error: "Erro ao gerar tickets" });
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
    });
  } catch (error) {
    console.error("Error fetching ticket info:", error);
    res.status(500).json({ error: "Erro ao buscar informações do ticket" });
  }
});


app.get("/tickets-by-email/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const tickets = await db.Ticket.findAll({
      where: { email }
    });

    if (tickets.length === 0) {
      return res.status(404).json({ error: "Nenhum ticket encontrado para este email." });
    }

    // Formata a resposta para retornar apenas os tickets e suas quantidades
    const formattedTickets = tickets.map(ticket => ({
      ticket: ticket.ticket,
      quantity: ticket.quantity
    }));

    res.json({
      tickets: formattedTickets
    });
  } catch (error) {
    console.error("Error fetching tickets by email:", error);
    res.status(500).json({ error: "Erro ao buscar tickets pelo email" });
  }
});

const PORT = process.env.PORT || 5000;
db.sequelize.sync().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
