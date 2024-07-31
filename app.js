require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_API_KEY_TEST);
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./models");
const sendConfirmationEmail = require('./services/EmailSend');
const pg = require('pg');

const app = express();

app.use(cors());
app.use(express.json());
app.use(bodyParser.raw({ type: "application/json" }));

const getTicketsDisponiveis = async () => {
  const result = await db.AvailableTickets.findOne({ where: {}, order: [['createdAt', 'DESC']] });
  return result ? result.tickets : 20000; 
};

const updateTicketsDisponiveis = async (tickets) => {
  await db.AvailableTickets.create({ tickets });
};

let timeLeft = 120 * 24 * 3600;

app.get("/time-left", (req, res) => {
  res.json({ timeLeft });
});

setInterval(() => {
  if (timeLeft > 0) {
    timeLeft -= 1;
  }
}, 1000);

app.post("/reset-time", (req, res) => {
  const { newTimeLeft } = req.body;
  if (newTimeLeft && Number.isInteger(newTimeLeft) && newTimeLeft >= 0) {
    timeLeft = newTimeLeft;
    res.json({ message: "Tempo restante resetado com sucesso.", timeLeft });
  } else {
    res.status(400).json({ error: "O novo tempo deve ser um número inteiro não negativo." });
  }
});


app.get("/tickets-restantes", async (req, res) => {
  const ticketsDisponiveis = await getTicketsDisponiveis();
  res.json({ ticketsDisponiveis });
});

app.post("/create-checkout", async (req, res) => {
  const ticketsDisponiveis = await getTicketsDisponiveis();
  const totalQuantity = req.body.products.reduce((acc, product) => acc + product.quantity, 0);

  if (totalQuantity > ticketsDisponiveis) {
    return res.status(400).json({ error: "Não há tickets suficientes disponíveis." });
  }

  const items = req.body.products.map((product) => ({
    price_data: {
      currency: "usd",
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

app.post("/reduce-ticket", async (req, res) => {
  const ticketsDisponiveis = await getTicketsDisponiveis();
  const { quantity, email, name } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: "Email e nome são obrigatórios." });
  }

  if (ticketsDisponiveis >= quantity) {
    const newTicketsDisponiveis = ticketsDisponiveis - quantity;
    await updateTicketsDisponiveis(newTicketsDisponiveis);

    // Geração dos tickets
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

    res.json({ message: "Ticket(s) reduzido(s) com sucesso", ticketsDisponiveis: newTicketsDisponiveis, tickets });

    try {
      await sendConfirmationEmail(email, name, tickets);
    } catch (error) {
      console.error("Error sending confirmation email:", error);
      res.status(500).json({ error: "Erro ao enviar email de confirmação." });
    }
  } else {
    res.status(400).json({ error: "Não há tickets suficientes disponíveis." });
  }
});

app.post("/generate-tickets", async (req, res) => {
  const { name, email, quantity } = req.body;
  const ticketsDisponiveis = await getTicketsDisponiveis();

  if (!name || !email || !quantity || quantity <= 0) {
    return res.status(400).json({ error: "Nome, email e quantidade são obrigatórios e a quantidade deve ser maior que zero" });
  }

  if (quantity > ticketsDisponiveis) {
    return res.status(400).json({ error: "Não há tickets suficientes disponíveis." });
  }

  res.json({
    message: "Pedido para gerar tickets recebido com sucesso. A geração de tickets será feita no momento da redução de tickets.",
  });
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

    const formattedTickets = tickets.map(ticket => ({
      ticket: ticket.ticket,
    }));

    res.json({
      tickets: formattedTickets
    });
  } catch (error) {
    console.error("Error fetching tickets by email:", error);
    res.status(500).json({ error: "Erro ao buscar tickets pelo email" });
  }
});

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

const PORT = process.env.PORT || 5000;

db.sequelize.sync().then(async () => {
  const tickets = await getTicketsDisponiveis();
  if (!tickets) {
    await updateTicketsDisponiveis(20000);
  }
//adjust
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
});
