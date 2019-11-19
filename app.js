var express = require('express');
var flash = require('connect-flash');
var http = require('http');
var path = require('path');
var session = require('express-session');

const axios = require('axios');

var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var methodOverride = require('method-override');
var fileUpload = require('express-fileupload');
var mongoose = require('mongoose');



var app = express();
var server = http.createServer(app);
var config = require('./config');

var cors = require('cors');
var i18n = require('i18n');
i18n.configure({
    //define how many languages we would support in our application
    locales: ['en'],

    //define the path to language json files, default is /locales
    directory: __dirname + '/locales',

    //define the default language
    defaultLocale: 'en',

    // define a custom cookie name to parse locale settings from
    cookie: 'i18n'
});

/** ================================================================================
 *  Environment Setting part
 */

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(config.secret));
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 },
}));
app.use(session({
    secret: config.secret,
    cookie: { maxAge: 43200000},
    // create new redis store.
    // store: new redisStore({ host: config.redis.host, port: config.redis.port, client: client, ttl: config.redis.expiration}),
    resave: false,
    saveUninitialized: false,
}));

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'application/vnd.api+json' })); // parse application/vnd.api+json as json
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('X-HTTP-Method-Override')); // override with the X-HTTP-Method-Override header in the request

// use connect-flash for flash messages stored in session
app.use(flash());
// use it before all route definitions
app.use(cors());
//init i18n after cookie-parser
app.use(i18n.init);

var route = require('./routes');
var home_controller = require('./controllers/HomeController');

mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);

// var testFilePath = path.join(__dirname, 'handhistory.txt');
var testFilePath = path.join(__dirname, 'handHistory-14521.txt');
// var testFilePath = path.join(__dirname, 'handhistory2.txt');

mongoose.connect(config.mongo.dbURL + '/' + config.mongo.dbname, function(err, db) {
    if (err) {
        console.log('[' + new Date() + ']', 'Sorry, there is no mongo db server running.');
        process.exit(1);
    } else {

        app.use('/', route);
        app.use(fileUpload({
            useTempFiles : true,
            tempFileDir : '/tmp/'
        }));

        home_controller.testFileParse(testFilePath);

        server.listen(config.port, function () {
            console.log('[' + new Date() + '] ' + 'Express server listening on port ' + config.port);
        });

    }
});