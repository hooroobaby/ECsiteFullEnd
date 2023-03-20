const mysql = require("mysql");

const connection = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "root", //windows用戶應該不用密碼
  database: "shop",
});

connection.connect((err) => {
  if (err) throw err;
});

module.exports = connection;
