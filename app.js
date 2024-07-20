require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_API_KEY_TEST);
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./models");

const app = express();


app.use(cors());
app.use(express.json());
app.use(bodyParser.raw({ type: "application/json" }));

let ticketsDisponiveis = 100;

app.get("/tickets-restantes", (req, res) => {
  res.json({ ticketsDisponiveis });
});

app.post("/create-checkout", async (req, res) => {
  console.log(req.body);

  if (ticketsDisponiveis <= 0) {
    return res.status(400).json({ error: "Não há tickets disponíveis." });
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
  if (ticketsDisponiveis > 0) {
    ticketsDisponiveis--;
    res.json({ message: "Ticket reduzido com sucesso", ticketsDisponiveis });
  } else {
    res.status(400).json({ error: "Não há tickets disponíveis." });
  }
});

app.post("/generate-ticket", async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Nome e email são obrigatórios" });
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
    });

    res.json({
      message: "Ticket gerado com sucesso",
      ticket: newTicket,
    });
  } catch (error) {
    console.error("Error generating ticket:", error);
    res.status(500).json({ error: "Erro ao gerar ticket" });
  }
});

const PORT = process.env.PORT || 5000;
db.sequelize.sync().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
