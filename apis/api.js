const express = require("express");
const router = express.Router();
const mysqlConnection = require("../connection/mySqlConnection");
const mongoClient = require("mongodb").MongoClient;
const url = "mongodb://localhost:27017/products";

// 引入金流的sdk
const ecpay_payment = require("../node_modules/ecpay_aio_nodejs/lib/ecpay_payment");
const options = require("../node_modules/ecpay_aio_nodejs/conf/config-example"); //付款規範

/**
 * 購物網站基本API
 **/

// 取得所有商品
router.route("/products").get((req, res) => {
  // mysql資料取得
  // 1. 取資料，若成功 --> mongo圖片
  mysqlConnection.query("SELECT * from product", (err, result) => {
    if (err) {
      res.status(500).json({ message: "MySQL Error" });
    } else {
      mongoClient.connect(url, (err, client) => {
        if (err) {
          res.status(500).json({ message: "mongo error" });
        } else {
          //   取得mongo資料，跟mySQL做ID比對，若正確就放進result回傳給前端
          let db = client.db("products");
          db.collection("image")
            .find()
            .toArray((err, imageList) => {
              imageList.forEach((item) => {
                result.filter((r) => r.id == item.id).image = item.image;
              });
            });
          res.status(200).json({ productList: result });
        }
      });
    }
  });
});

// 登入
router.route("/login").post((req, res) => {
  mysqlConnection.query(
    "SELECT * from custaccount where account=? and password=?",
    [req.body.account, req.body.password],
    (err, result) => {
      if (err) {
        res.status(400).json({ message: "bad request" });
      } else {
        // result會是一個array，且查詢密碼應該只有唯一那個值，所以用result[0]
        if (result && result.length == 1 && result[0] && result[0].id) {
          //   先轉成JSON字串，再轉成JSON物件
          let custAcc = JSON.parse(JSON.stringify(result[0]));
          custAcc.password = null;
          res.status(200).json({ custAccount: custAcc });
        } else {
          res.status(400).json({ message: "password/account not correct" });
        }
      }
    }
  );
});

// 註冊會員
router.route("/register").post((req, res) => {
  let data = req.body;
  mysqlConnection.query(
    "INSERT into custaccount (`account`, `password`, `type`, `name`, `cellphone`, `email`, `birthday` VALUES (?,?,?,?,?,?,?)"[
      (data.account,
      data.password,
      data.type,
      data.name,
      data.cellphone,
      data.email,
      data.birthday)
    ],
    (err, result) => {
      if (err) {
        res.status(400).json({ message: "bad request" });
      } else {
        // result 在insert後會回傳insertID
        if (result && result.insertId) {
          res.status(201).json({ message: "Insert successfully" });
        } else {
          res.status(400).json({ message: "bad request" });
        }
      }
    }
  );
});

// 取得會員歷史訂單記錄
router.route("/history/:id").get((req, res) => {
  let custId = req.params.id;
  mysqlConnection.query(
    "SELECT * from shop_order where cust_id=?",
    [custId],
    (err, result) => {
      if (err) {
        res.status(400).json({ message: "bad request" });
      } else {
        res.status(200).json({ history: result });
      }
    }
  );
});

// 取得會員歷史訂單紀錄
router.route("/history/:id").get((req, res) => {
  // 以前端回傳的用戶 ID 查詢此用戶過往的訂單紀錄, 以及付款情形等資料
  let id = req.params.id;

  mySqlDb.query(
    "select * from shop_order where cust_id = ?",
    [id],
    (err, result) => {
      if (err) {
        res.status(400).json();
      } else {
        res.status(200).json({ result: result });
      }
    }
  );
});

/* 
金流API：會用到atm跟credit_onetime
*/
// 成立訂單並產生導向金流頁面 html
router.route("/submitOrder").post((req, res) => {
  let data = req.body;
  // 建立訂單資料
  // 這裡為了簡單示範,所以直接建訂單且拿前端回傳的值做付款
  // 但實際上為了避免資料被竄改,需要從後端計算商品金額（SQL)
  mySqlDb.query(
    "INSERT INTO shop_order (cust_id, cust_name, phone, address, status, total) VALUES (?, ?, ?, ?, ?, ?);",
    [
      data.custAccount.id,
      data.order.name,
      data.order.phone,
      data.order.address,
      "1",
      data.order.total,
    ],
    (err, result) => {
      if (err) {
        res.status(400).json();
      } else {
        // 呼叫 金流 API
        // 組成基本參數 (綠界提供的付款API皆需有此基本參數物件)
        // 這部分可以參考/aio_check_out_atm.js
        let base_param = {
          MerchantTradeNo: _uuid(), // 需用不重複的 20碼 UUID
          MerchantTradeDate: _dateString(), // 當前時間 YYYY/MM/DD HH:MM:SS
          TotalAmount: data.order.total, // 訂單金額
          TradeDesc: "測試交易描述", // 訂單小標題
          ItemName: "測試商品等", // 訂單詳細內容 ( 可以放實際購買哪些物品及細項金額 )
          // 訂單完成後, 綠界會將使用者導回的頁面
          OrderResultURL: "http://localhost:3000/shopcart?success=true",
          // 用來接收回傳付款成功的 API, 通常會在此更新訂單狀態
          // ex. 原本訂單為建立中, 打此 API 後表示付款成功或更新用戶付款方式
          ReturnURL: "http://192.168.0.1", //因為是post方法，綠界會傳資料回來，所以這個網址必須是有公開網域。
        };

        // 發票資訊, 詳細設定可以參考綠界官方 API
        let inv_params = {};
        if (data.order.payment == "bank") {
          // 若用戶選擇銀行匯款, 綠界會產生銀行付款資訊 & 代碼, 並以 POST 的方式傳至 pay_info_url
          // 我們再回傳至前端顯示給用戶
          const pay_info_url = "http://192.168.0.1",
            // 交易有效期限
            exp = "7",
            // 銀行帳號取號成功後, 綠界會將用戶導至此網址
            cli_redir_url = "http://localhost:3000/shopcart?success=true",
            // 取得連線至綠界 API 參數
            create = new ecpay_payment(options),
            // 產生銀行付款導頁的 form html, 我們只要將此 html 回傳至前端
            // 就可以自動以 form post 的方式導至綠界金流付款頁面
            // 因為html是保留字，所以用htm
            htm = create.payment_client.aio_check_out_atm(
              (parameters = base_param),
              (url_return_payinfo = pay_info_url),
              (exp_period = exp),
              (client_redirect = cli_redir_url),
              (invoice = inv_params)
            );
          res.status(200).json({ result: htm });
        }
        // 信用卡串接
        else if (data.order.payment == "credit") {
          // 取得連線至綠界 API 參數
          (create = new ecpay_payment(options)),
            // 產生銀行付款導頁的 form html, 我們只要將此 html 回傳至前端
            // 就可以自動以 form post 的方式導至綠界金流付款頁面
            (htm = create.payment_client.aio_check_out_credit_onetime(
              (parameters = base_param),
              (invoice = inv_params)
            ));
          res.status(200).json({ result: htm });
        }
      }
    }
  );
});
