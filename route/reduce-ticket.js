const sendConfirmationEmail = require("../services/EmailSend");

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
  
      res.json({
        message: "Ticket(s) reduzido(s) com sucesso",
        ticketsDisponiveis: newTicketsDisponiveis,
        tickets,
      });
  
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