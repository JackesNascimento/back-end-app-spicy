const sql = require("mssql");

const dbConfig = {
    user: 'sa',
    password: 'L@bti1988',
    server: '46.202.150.129',
    database: 'spicy',
    options: {
        encrypt: false, // Desative se não estiver usando SSL
        trustServerCertificate: true, // Necessário para conexões não seguras
    }
};

// Conectar ao banco
async function connectDB() {
    try {
        const pool = await sql.connect(dbConfig);
        console.log("Conectado ao SQL Server!");
        return pool;
    } catch (error) {
        console.error("Erro ao conectar ao banco:", error);
        throw error;
    }
}

module.exports = { connectDB, sql };
