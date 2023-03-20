const express = require('express')
const router = express.Router()
const multer  = require('multer')
const upload = multer()
const mySqlDb = require("../connection/mySqlConnection");
const MongoClient = require( 'mongodb' ).MongoClient;
const url = "mongodb://localhost:27017/products";
const ecpay_payment = require('../node_modules/ecpay_aio_nodejs/lib/ecpay_payment')
const options = require('../node_modules/ecpay_aio_nodejs/conf/config-example');
/* 
購物網站基本API
*/
// 取得所有商品
router.route('/products')
.get(
    (req, res) => {
        // 取得 mysql 中, 當前建立的所有產本資料
        mySqlDb.query("select * from product", 
            (err, result) => {
                if (err) {
                    res.status(400).json()
                } else {
                    MongoClient.connect(url, (err, client) => {
                        if (err) {
                            res.status(400).json()
                        } else {
                            let db = client.db('products');
                            // 取當前 mongodb 中, 所有產品的照片資料
                            db.collection('image').find().toArray((err, imageList) => {
                                if (err){
                                    res.status(400).json();  
                                } else {
                                    // 以 mongodb 取得的資料, 與 mysql 取得的資料做比對, 若兩者產品 ID 相同, 
                                    // 則將圖片檔案放入產品清單中回傳至前端顯示
                                    for(let j =0; j < imageList.length; j+=1) {
                                        for(let i = 0; i < result.length; i+=1) {
                                            let prodId = result[i].id;
                                            if(prodId === imageList[j].id){
                                                result[i].img = imageList[j].image;
                                            }
                                        }                                        
                                    }
                                    res.status(200).json({productList : result});
                                }
                            });       
                        };      
                    });
                }
            }
        );
    }
)

// 登入
router.route('/login')
.post(
    (req, res) => {
        let data = req.body;
        // 以前端使用者輸入的帳號及密碼, 在 mysql custaccount 中比對是否有相符的客戶資料
        mySqlDb.query("select * from custaccount where account= ? and password = ?",
            [data.account, data.password],  
            (err, result) => {
                if (err) {
                    res.status(400).json()
                } else {
                    // 若有相同的客資則將密碼隱藏後回傳至前端, 若找不到則表示該使用者帳號密碼輸入錯誤
                    if (result != null && result[0] != undefined && result[0].id != null) {
                        let custAccount = JSON.parse(JSON.stringify(result[0]));
                        custAccount.password = null;
                        res.status(200).json({custAccount : custAccount});
                    } else {
                        res.status(400).json()
                    }
                }
            }
        );
    }
)
// 註冊會員
router.route('/register')
.post(
    (req, res) => {
        // 實務上還會檢查帳號是否已經存在 DB, 避免帳號重複, 造成使用者登入取值時發生錯誤
        // 大部分業界在將密碼存入資料庫時, 會先經過加密, 不會以明碼形式直接儲存, 容易造成資安風險
        let data = req.body;
        mySqlDb.query("INSERT INTO custaccount (account, password, type, name, cellphone, email, birthday)"
        + "VALUES (?, ?, ?, ?, ?, ?, ?);",
            [data.account, data.password, 1, data.name, data.phone, data.email, data.birthday],  
            (err, result) => {
                if (err) {
                    console.log(err)
                    res.status(400).json()
                } else {
                    if (result != null && result.insertId != null) {
                        res.status(200).json()
                    } else {
                        res.status(400).json()
                    }
                }
            }
        );
    }    
)

// 取得會員歷史訂單紀錄
router.route('/history/:id')
.get(
    (req, res) => {
        // 以前端回傳的用戶 ID 查詢此用戶過往的訂單紀錄, 以及付款情形等資料
        let id = req.params.id;

        mySqlDb.query("select * from shop_order where cust_id = ?",
            [id],  
            (err, result) => {
                if (err) {
                    res.status(400).json()
                } else {
                    res.status(200).json({result: result})
                }
            }
        );  
    }
)

/* 
金流API
*/
// 成立訂單並產生導向金流頁面 html
router.route('/submitOrder')
.post(
    (req, res) => {  
        let data = req.body;
        // 建立訂單資料
        // 這裡為了簡單示範,所以直接建訂單且拿前端回傳的值做付款
        // 但實際上為了避免資料被竄改,需要從後端計算商品金額
        mySqlDb.query("INSERT INTO shop_order (cust_id, cust_name, phone, address, status, total) VALUES (?, ?, ?, ?, ?, ?);", 
        [data.custAccount.id, data.order.name, data.order.phone, data.order.address, '1', data.order.total],
        (err, result) => {
            if (err) {
                res.status(400).json()
            } else {
                // 呼叫 金流 API
                // 組成基本參數 (綠界提供的付款API皆需有此基本參數物件)
                let base_param = {
                    MerchantTradeNo: _uuid(), // 需用不重複的 20碼 UUID
                    MerchantTradeDate: _dateString(), // 當前時間 YYYY/MM/DD HH:MM:SS
                    TotalAmount: data.order.total, // 訂單金額
                    TradeDesc: '測試交易描述', // 訂單小標題
                    ItemName: '測試商品等', // 訂單詳細內容 ( 可以放實際購買哪些物品及細項金額 )
                    // 訂單完成後, 綠界會將使用者導回的頁面
                    OrderResultURL: 'http://localhost:3000/shopcart?success=true',
                    // 用來接收回傳付款成功的 API, 通常會在此更新訂單狀態 
                    // ex. 原本訂單為建立中, 打此 API 後表示付款成功或更新用戶付款方式
                    ReturnURL: 'http://192.168.0.1',
                }
                
                // 發票資訊, 詳細設定可以參考綠界官方 API
                let inv_params = {}
                if(data.order.payment == 'bank'){
                    // 若用戶選擇銀行匯款, 綠界會產生銀行付款資訊 & 代碼, 並以 POST 的方式傳至 pay_info_url
                    // 我們再回傳至前端顯示給用戶
                    const pay_info_url = 'http://192.168.0.1',
                    // 交易有效期限
                    exp = '7',
                    // 銀行帳號取號成功後, 綠界會將用戶導至此網址
                    cli_redir_url = 'http://localhost:3000/shopcart?success=true',
                    // 取得連線至綠界 API 參數
                    create = new ecpay_payment(options),
                    // 產生銀行付款導頁的 form html, 我們只要將此 html 回傳至前端
                    // 就可以自動以 form post 的方式導至綠界金流付款頁面
                    htm = create.payment_client.aio_check_out_atm(parameters = base_param, url_return_payinfo = pay_info_url, exp_period = exp, client_redirect = cli_redir_url, invoice = inv_params)
                    res.status(200).json({result : htm})
                }else if (data.order.payment == 'credit'){
                    // 取得連線至綠界 API 參數
                    create = new ecpay_payment(options),
                    // 產生銀行付款導頁的 form html, 我們只要將此 html 回傳至前端
                    // 就可以自動以 form post 的方式導至綠界金流付款頁面
                    htm = create.payment_client.aio_check_out_credit_onetime(parameters = base_param, invoice = inv_params)
                    res.status(200).json({result : htm})
                }
            }
        });
    }
)


/* 
後臺管理API
*/
router.route('/product/:id')
// 刪除商品
.delete(
    (req, res) => {
        let id = req.params.id;
        // 以產品 ID 下條件刪除 mysql 中該產品資訊
        mySqlDb.query("DELETE FROM product WHERE id = ?;", 
            [id],
            (err, result) => {
                if (err) {
                    res.status(400).json()
                } else {
                    // 刪除 mysql 後, 再以產品 ID 至 mongodb 刪除該產品對應的產品照片
                    MongoClient.connect(url, (err, client) => {
                        if (err) {
                            res.status(400).json()
                        } else {
                            let db = client.db('products');
                            let image = db.collection('image');
                            image.deleteOne(
                            { id: Number(id) },
                            (err, response) => {
                                if (err) {
                                    res.status(400).json()
                                }else {
                                    // 檢查 mysql 以及 mongodb 是否都刪除成功 (可以考慮要不要寫這個驗證)
                                    res.status(result.affectedRows > 0 && response.deletedCount > 0 ? 200 : 400).json()
                                }
                            }
                            );
                        };      
                    });
                }
        })
    }
)
// 修改商品
.put(
    upload.single('img'),
    (req, res) => {
        // 從 restful 在 url 中傳來的參數取得產品編號
        let id = req.params.id;
        // 剩餘資料從 request 的 formdata 中取得
        let data = req.body;
        let file = req.file;
        let imgString;
        // 將照片檔案轉為 base64 字串
        if(file != undefined && file != null){
            imgString = "data:image/gif;base64,"+ file.buffer.toString('base64');
        }

        // 先以產品 ID 當作更新條件, 更新 mysql 中該產品資料
        mySqlDb.query("update product set name = ?, description = ?, amount = ?, inventory = ?, status = ? where id = ?", 
            [data.name, data.desc, data.amount, data.inventory, data.status, id],
            (err, result) => {
                if (err) {
                    res.status(400).json()
                } else {
                    // 更新 mysql 成功後, 更新 mongodb 中該產品對應的圖片
                    MongoClient.connect(url, (err, client) => {
                        if (err) {
                            res.status(400).json()
                        } else {
                            if(imgString != null && imgString.length > 0){
                                let db = client.db('products');
                                let image = db.collection('image')
                                image.updateOne(
                                    {"id": Number(id)},
                                    {$set: { "image" : imgString }}, 
                                    (err, response) => {
                                        if (err) {
                                            res.status(400).json()
                                        } else {
                                            res.status(200).json()
                                        }
                                    } 
                                );
                            } else {
                                res.status(200).json()
                            }                           
                        };      
                     });
                }
            }
        )
    }
)
// 新增商品
router.route('/product')
.post(upload.single('img'),
    (req, res) => {
        let data = req.body;
        let file = req.file;
        let imgString;
        // 將檔案轉成 base64 字串
        if(file != undefined && file != null){
            imgString = "data:image/gif;base64,"+ file.buffer.toString('base64');
        }
        // 將欲新增的產品資訊新增至 mysql 中
        mySqlDb.query("INSERT INTO product (name, description, amount, inventory, status) VALUES (?, ?, ?, ?, ?);", 
            [data.name, data.desc, data.amount, data.inventory, data.status],
            (err, result) => {
                if (err) {
                    console.log(err)
                    res.status(400).json()
                } else {
                    // 新增 mysql 成功時, 將轉成 base64 的產品圖片字串新增至 mongodb 中
                    MongoClient.connect(url, (err, client) => {
                        if (err) {
                            res.status(400).json()
                        } else {
                            let db = client.db('products');
                            let image = db.collection('image')
                            image.insertOne(
                             { id: result.insertId, image:imgString },
                             (err, response) => {
                                 if (err) {
                                    res.status(400).json()
                                 }else {
                                     res.status(result.affectedRows > 0 && response.insertedId != undefined ? 200 : 400).json()
                                 }
                             }
                            );
                        };      
                     });
                }
        })
    }
)


// 以當前時間毫秒數, 產生隨機的 20 碼 UUID
_uuid = () => {
    let d = Date.now();
    if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
      d += performance.now(); //use high-precision timer if available
    }
    return 'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, function (c) {
      let r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

// 將當前日期組成 YYYY/MM/DD HH:MM:SS 格式
_dateString = () => {
    let date = new Date();
    return dateStr =
    date.getFullYear() + "/" +
    ("00" + (date.getMonth() + 1)).slice(-2) + "/" +
    ("00" + date.getDate()).slice(-2) + " " +
    ("00" + date.getHours()).slice(-2) + ":" +
    ("00" + date.getMinutes()).slice(-2) + ":" +
    ("00" + date.getSeconds()).slice(-2);
}

module.exports = router;
