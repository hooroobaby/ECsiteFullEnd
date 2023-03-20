const express = require("express");
const path = require("path");
const app = express();
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./config/swagger.json");
const pageRouter = require("./apis/pages");
const apiRouter = require("./apis/api");
const PORT = 3000;

// 為node掛上ejs
app.set("view engine", "ejs");
// 使用 bootstrap
app.use(express.static(path.join(__dirname, "node_modules/bootstrap/dist/")));
// 使用靜態資源
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// router 設定
app.use("/", pageRouter); // 前端頁面
app.use("/api", apiRouter); // api router

// swagger設定檔案
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(PORT, () => {
    console.log("Server is listen on port:", PORT);
});


module.exports = app;
