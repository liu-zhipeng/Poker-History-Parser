var express = require('express');
var router = express.Router();

var home_controller = require('../controllers/HomeController');

router.get('/', function(req, res, next) {
    home_controller.run(req, res, next);
});

router.post('/upload', function(req, res, next) {
    home_controller.upload(req, res, next);
});

router.get('*', function(req, res, next) {
    return res.redirect('/');
});

module.exports = router;