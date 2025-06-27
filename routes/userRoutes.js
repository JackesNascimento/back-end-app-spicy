const express = require("express");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const { connectDB, sql } = require("../db");

const router = express.Router();

// Definição dos trials por plano
const TRIAL_DAYS = {
    "Básico": 0,
    "Premium": 30,
    "Pro": 15,
};

router.post("/register", async (req, res) => {
    try {
        const { name, email, password, gender, userPlan } = req.body;

        if (!TRIAL_DAYS.hasOwnProperty(userPlan)) {
            return res.status(400).json({ error: "Plano inválido" });
        }

        let trialEndDate = null;
        if (TRIAL_DAYS[userPlan] > 0) {
            trialEndDate = new Date();
            trialEndDate.setDate(trialEndDate.getDate() + TRIAL_DAYS[userPlan]);
        }

        const pool = await connectDB();
        const checkUser = await pool.request()
            .input("email", sql.NVarChar, email)
            .query("SELECT * FROM Users WHERE email = @email");

        if (checkUser.recordset.length > 0) {
            return res.status(400).json({ error: "Email já cadastrado" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await pool.request()
            .input("name", sql.NVarChar, name)
            .input("email", sql.NVarChar, email)
            .input("password", sql.NVarChar, hashedPassword)
            .input("gender", sql.NVarChar, gender)
            .input("userPlan", sql.NVarChar, userPlan)
            .input("trialEndDate", sql.DateTime, trialEndDate)
            .query(`
                INSERT INTO Users (name, email, password, gender, userPlan, trialEndDate)
                VALUES (@name, @email, @password, @gender, @userPlan, @trialEndDate)
            `);

        res.status(201).json({ message: "Usuário cadastrado com sucesso!" });
    } catch (error) {
        console.error("Erro ao cadastrar usuário:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const pool = await connectDB();

        const result = await pool.request()
            .input("email", sql.NVarChar, email)
            .query("SELECT id, name, email, password, gender, userPlan, trialEndDate FROM Users WHERE email = @email");

        const user = result.recordset[0];
        if (!user) {
            return res.status(400).json({ error: "Usuário ou senha inválidos" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Usuário ou senha inválidos" });
        }

        delete user.password;
        res.status(200).json({ message: "Login bem-sucedido!", user });
    } catch (error) {
        console.error("Erro ao fazer login:", error);
        res.status(500).json({ error: "Erro interno do servidor" });
    }
});

// Rota para processar pagamentos
router.get("/processar-pagamentos/:email", async (req, res) => {
    try {
        const emailParam = req.params.email.toLowerCase();
        const response = await axios.get("https://webhookdois.whatsapchat.com.br/payloads");
        const payload = response.data.payloads;
        if (!Array.isArray(payload) || payload.length === 0) {
            return res.status(400).json({ error: "Nenhum pagamento disponível" });
        }

        const pagamentos = payload.filter(item =>
            item.customer.email.toLowerCase() === emailParam && item.sale_status_enum_key === "approved"
        );

        if (pagamentos.length === 0) {
            return res.status(404).json({ error: "Nenhum pagamento aprovado encontrado" });
        }

        const pool = await connectDB();
        for (const pagamento of pagamentos) {
            const sale_id = pagamento.code || pagamento.original_code || null;

            if (!sale_id) {
                console.error("Erro: sale_id está ausente no pagamento", pagamento);
                continue;
            }

            const cleanedPrice = pagamento.sale_amount
                ? parseFloat(pagamento.sale_amount.toString().replace("R$", "").replace(",", "."))
                : 0;

            const checkSaleIdResult = await pool.request()
                .input("sale_id", sql.NVarChar, sale_id)
                .input("email", sql.NVarChar, emailParam)
                .query("SELECT COUNT(*) AS count FROM Pagamentos WHERE sale_id = @sale_id AND customer_email = @email");

            if (checkSaleIdResult.recordset[0].count === 0) {
                await pool.request()
                    .input("sale_id", sql.NVarChar, sale_id)
                    .input("name", sql.NVarChar, pagamento.customer.full_name)
                    .input("email", sql.NVarChar, emailParam)
                    .input("price", sql.Decimal, cleanedPrice)
                    .input("created_at", sql.DateTime, pagamento.date_created)
                    .input("status", sql.NVarChar, pagamento.sale_status_enum_key)
                    .input("event", sql.NVarChar, "approved")
                    .input("payment_type", sql.NVarChar, pagamento.payment_type_enum_key)
                    .query(`
                        INSERT INTO Pagamentos (sale_id, customer_name, customer_email, total_price, created_at, status, event, payment_type)
                        VALUES (@sale_id, @name, @email, @price, @created_at, @status, @event, @payment_type)
                    `);

                await pool.request()
                    .input("email", sql.NVarChar, emailParam)
                    .query("UPDATE Users SET userPlan = 'Premium' WHERE email = @email");
            }
        }

        res.status(200).json({ message: "Pagamentos processados com sucesso" });
    } catch (err) {
        console.error("Erro ao processar pagamentos:", err.message);
        res.status(500).json({ error: "Erro ao processar pagamentos", message: err.message });
    }
});

module.exports = router;
