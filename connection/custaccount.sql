CREATE TABLE `custaccount` (
    `id` int(20) NOT NULL AUTO_INCREMENT,
    `account` varchar(20) NOT NULL,
    `password` varchar(20) NOT NULL,
    `type` varchar(1) NOT NULL,
    `name` varchar(20) NOT NULL,
    `cellphone` varchar(10) NOT NULL,
    `email` varchar(200) NOT NULL,
    `birthday` date NOT NULL,
    `create_date` date NOT NULL DEFAULT current_timestamp(),
    `update_date` date NOT NULL DEFAULT current_timestamp(), --代表default值是現在的timestamp
    `remark` varchar(200) NOT NULL, --對這位顧客做設定
    PRIMARY KEY (`id`)
  )