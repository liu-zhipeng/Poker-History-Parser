var config = {
    mode: "development",
    port: 3030,

    secret: "handparser",
    url: 'http://localhost:3030',

    mail: {
        host: '',
        port: 465,
        secure: true,
        account: '',
        password: '',
    },

    mongo: {
        dbURL: "mongodb://localhost:27017",
        dbname: 'handparser'
    },

    redis: {
        host: '127.0.0.1',
        port: 6379,
        password: ""
    },

    logEnabled: false,
    testMode: true,
    printMode: false,
}

module.exports = config;