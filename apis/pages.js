const express = require('express')
const router = express.Router()

// 前台
router.route('/')
.get((req, res) => res.redirect('/index'));

router.route('/index')
.get((req, res) => res.render('index.ejs'))
.post((req, res) => res.render('index.ejs'));

router.route('/login')
.get((req, res) => res.render('login.ejs'))

router.route('/register')
.get((req,res) => res.render('register.ejs'))

router.route('/history')
.get((req,res) => res.render('history.ejs'))

router.route('/shopcart')
.get((req, res) => res.render('shopcart.ejs'))
.post((req, res) => res.render('shopcart.ejs'))

// 後臺頁面
router.route('/admin')
.get((req, res) => res.render("admin.ejs"));

module.exports = router
