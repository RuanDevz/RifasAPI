require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_API_KEY_TEST);
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./models");
const sendConfirmationEmail = require("./services/EmailSend");
const pg = require("pg");
const Bull = require("bull");

const app = express();

app.use(cors());
app.use(express.json());
app.use(bodyParser.raw({ type: "application/json" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const getTicketsDisponiveis = async () => {
  const result = await db.AvailableTickets.findOne({
    where: {},
    order: [["createdAt", "DESC"]],
  });
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
    res
      .status(400)
      .json({ error: "O novo tempo deve ser um número inteiro não negativo." });
  }
});

app.get("/tickets-restantes", async (req, res) => {
  const ticketsDisponiveis = await getTicketsDisponiveis();
  res.json({ ticketsDisponiveis });
});

app.post("/create-checkout", async (req, res) => {
  const ticketsDisponiveis = await getTicketsDisponiveis();
  const totalQuantity = req.body.products.reduce(
    (acc, product) => acc + product.quantity,
    0
  );

  if (totalQuantity > ticketsDisponiveis) {
    return res
      .status(400)
      .json({ error: "Não há tickets suficientes disponíveis." });
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
    success_url: `${process.env.FRONT_END_URL}/#/payment-confirmation`,
    cancel_url: `${process.env.FRONT_END_URL}/#/payment-confirmation/error`,
  });

  res.send({ url: session.url });
});

// Configuração da fila Bull
const ticketQueue = new Bull('ticketQueue', {
  redis: {
    host: '127.0.0.1',
    port: 6379
  }
});

// Processo de geração de tickets em segundo plano
ticketQueue.process(async (job) => {
  const { quantity, email, name, ticketsDisponiveis } = job.data;

  const newTicketsDisponiveis = ticketsDisponiveis - quantity;
  await updateTicketsDisponiveis(newTicketsDisponiveis);

  // Geração dos tickets
  const tickets = [];
  const ticketNumbers = [];

  while (ticketNumbers.length < quantity) {
    let ticketNumber = Math.floor(Math.random() * 1000000) + 1;
    if (!ticketNumbers.includes(ticketNumber)) {
      ticketNumbers.push(ticketNumber);
    }
  }

  const ticketPromises = ticketNumbers.map(ticketNumber =>
    db.Ticket.create({
      name,
      email,
      ticket: ticketNumber,
      quantity: 1,
    })
  );

  const createdTickets = await Promise.all(ticketPromises);
  await sendConfirmationEmail(email, name, createdTickets);
});

app.post("/reduce-ticket", async (req, res) => {
  try {
    const ticketsDisponiveis = await getTicketsDisponiveis();
    const { quantity, email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "Email e nome são obrigatórios." });
    }

    if (ticketsDisponiveis >= quantity) {
      if (quantity > 200) {
        await ticketQueue.add({ quantity, email, name, ticketsDisponiveis });
        res.json({
          message: "Seu pedido foi recebido e os tickets serão gerados. Você receberá um email com os tickets assim que estiverem prontos.",
        });
      } else {
        const newTicketsDisponiveis = ticketsDisponiveis - quantity;
        await updateTicketsDisponiveis(newTicketsDisponiveis);

        // Geração dos tickets
        const tickets = [];
        const ticketNumbers = [];

        while (ticketNumbers.length < quantity) {
          let ticketNumber = Math.floor(Math.random() * 1000000) + 1;
          if (!ticketNumbers.includes(ticketNumber)) {
            ticketNumbers.push(ticketNumber);
          }
        }

        const ticketPromises = ticketNumbers.map(ticketNumber =>
          db.Ticket.create({
            name,
            email,
            ticket: ticketNumber,
            quantity: 1,
          })
        );

        const createdTickets = await Promise.all(ticketPromises);
        res.json({
          message: "Ticket(s) reduzido(s) com sucesso",
          ticketsDisponiveis: newTicketsDisponiveis,
          tickets: createdTickets,
        });

        await sendConfirmationEmail(email, name, createdTickets);
      }
    } else {
      res.status(400).json({ error: "Não há tickets suficientes disponíveis." });
    }
  } catch (error) {
    console.error("Error in /reduce-ticket:", error);
    res.status(500).json({ error: "Erro ao processar a requisição." });
  }
});

app.post("/generate-tickets", async (req, res) => {
  const { name, email, quantity } = req.body;
  const ticketsDisponiveis = await getTicketsDisponiveis();

  if (!name || !email || !quantity || quantity <= 0) {
    return res
      .status(400)
      .json({
        error:
          "Nome, email e quantidade são obrigatórios e a quantidade deve ser maior que zero",
      });
  }

  if (quantity > ticketsDisponiveis) {
    return res
      .status(400)
      .json({ error: "Não há tickets suficientes disponíveis." });
  }

  res.json({
    message:
      "Pedido para gerar tickets recebido com sucesso. A geração de tickets será feita no momento da redução de tickets.",
  });
});

app.get("/ticket-info/:ticketNumber", async (req, res) => {
  const { ticketNumber } = req.params;

  try {
    const ticket = await db.Ticket.findOne({
      where: { ticket: ticketNumber },
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
      where: { email },
    });

    if (tickets.length === 0) {
      return res
        .status(404)
        .json({ error: "Nenhum ticket encontrado para este email." });
    }

    const formattedTickets = tickets.map((ticket) => ({
      ticket: ticket.ticket,
    }));

    res.json({
      tickets: formattedTickets,
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
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
});
