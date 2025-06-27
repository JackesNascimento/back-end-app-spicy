require("dotenv").config();
const express = require("express");
const cors = require("cors")
const userRoutes = require("./routes/userRoutes");

const app = express();
app.use(express.json());
app.use(cors())

app.use("/api/users", userRoutes);

const PORT = process.env.PORT || 5555;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
