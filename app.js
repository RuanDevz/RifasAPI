require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_API_KEY_TEST);
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./models");
const sendConfirmationEmail = require("./services/EmailSend");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;
let timeLeft = 120 * 24 * 3600;

app.use(cors());
app.use(express.json());
app.use(bodyParser.raw({ type: "application/json" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

const getTicketsDisponiveis = async () => {
  const result = await db.AvailableTickets.findOne({
    order: [["createdAt", "DESC"]],
  });
  return result ? result.tickets : 20000;
};

const updateTicketsDisponiveis = async (tickets) => {
  await db.AvailableTickets.create({ tickets });
};

app.get("/time-left", (req, res) => res.json({ timeLeft }));

setInterval(() => {
  if (timeLeft > 0) timeLeft -= 1;
}, 1000);

app.post("/reset-time", (req, res) => {
  const { newTimeLeft } = req.body;
  if (Number.isInteger(newTimeLeft) && newTimeLeft >= 0) {
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
      product_data: { name: product.name },
      unit_amount: parseInt(`${product.price}00`),
    },
    quantity: product.quantity,
  }));

  const session = await stripe.checkout.sessions.create({
    line_items: items,
    mode: "payment",
    success_url: `${process.env.FRONT_END_URL}/#/payment-confirmation`,
    cancel_url: `${process.env.FRONT_END_URL}/#/payment-confirmation/error`,
  });

  res.send({ url: session.url });
});

app.post("/reduce-ticket", async (req, res) => {
  const ticketsDisponiveis = await getTicketsDisponiveis();
  const { quantity, email, name } = req.body;

  if (!email || !name || ticketsDisponiveis < quantity) {
    return res.status(400).json({ error: "Dados inválidos ou tickets insuficientes." });
  }

  const newTicketsDisponiveis = ticketsDisponiveis - quantity;
  await updateTicketsDisponiveis(newTicketsDisponiveis);

  try {
    const existingTickets = new Set((await db.Ticket.findAll({ attributes: ['ticket'] })).map(t => t.ticket));
    const ticketsPromises = Array.from({ length: quantity }, async () => {
      let ticketNumber;
      do {
        ticketNumber = Math.floor(Math.random() * 1000000) + 1;
      } while (existingTickets.has(ticketNumber));
      existingTickets.add(ticketNumber);
      return db.Ticket.create({ name, email, ticket: ticketNumber, quantity: 1 });
    });

    const tickets = await Promise.all(ticketsPromises);

    res.json({ message: "Ticket(s) reduzido(s) com sucesso", ticketsDisponiveis: newTicketsDisponiveis, tickets });
    await sendConfirmationEmail(email, name, tickets);
  } catch (error) {
    console.error("Error processing tickets:", error);
    res.status(500).json({ error: "Erro ao processar os tickets." });
  }
});

app.post("/generate-tickets", async (req, res) => {
  const { name, email, quantity } = req.body;
  const ticketsDisponiveis = await getTicketsDisponiveis();

  if (!name || !email || quantity <= 0 || quantity > ticketsDisponiveis) {
    return res.status(400).json({ error: "Dados inválidos ou tickets insuficientes." });
  }

  res.json({
    message: "Pedido para gerar tickets recebido com sucesso. A geração de tickets será feita no momento da redução de tickets.",
  });
});

app.get("/ticket-info/:ticketNumber", async (req, res) => {
  const { ticketNumber } = req.params;

  try {
    const ticket = await db.Ticket.findOne({ where: { ticket: ticketNumber } });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket não encontrado." });
    }

    res.json({ name: ticket.name, email: ticket.email, ticket: ticket.ticket });
  } catch (error) {
    console.error("Error fetching ticket info:", error);
    res.status(500).json({ error: "Erro ao buscar informações do ticket." });
  }
});

app.get("/tickets-by-email/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const tickets = await db.Ticket.findAll({ where: { email } });

    if (tickets.length === 0) {
      return res.status(404).json({ error: "Nenhum ticket encontrado para este email." });
    }

    res.json({ tickets: tickets.map(ticket => ({ ticket: ticket.ticket })) });
  } catch (error) {
    console.error("Error fetching tickets by email:", error);
    res.status(500).json({ error: "Erro ao buscar tickets pelo email." });
  }
});

db.sequelize.sync().then(async () => {
  const tickets = await getTicketsDisponiveis();
  if (!tickets) await updateTicketsDisponiveis(20000);

  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
});
