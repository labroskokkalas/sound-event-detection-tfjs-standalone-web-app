const express = require("express");
const bodyParser = require("body-parser");
const https = require('https');
const fs = require('fs');
const auth = require('basic-auth')
const winston = require('winston');
const app = express();
app.use(bodyParser.json());

const logConfiguration = {
    transports: [
        new winston.transports.Console({ level: 'info' }),
        new winston.transports.File({ level: 'info', filename: 'connections.log' })
    ]
};

const logger = winston.createLogger(logConfiguration);

app.use(function(req, res, next) {
    logger.info(`${new Date()} - ${req.method} request for ${req.url} from ${req.connection.remoteAddress}`)
	let user = auth(req)
    if (user === undefined || user['name'] !== 'apnea' || user['pass'] !== 'test') {
      res.statusCode = 401
      res.setHeader('WWW-Authenticate', 'Basic realm="Node"')
      res.end('Unauthorized')
    } else {
      next()
    }
});

app.post('/', function(req, res) {
    logger.info(req.body)
});

app.use(express.static("./static"));
// openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365
// we will pass our 'app' to 'https' server
https.createServer({
    key: fs.readFileSync('./key.pem'),
    cert: fs.readFileSync('./cert.pem'),
    passphrase: 'lonerider'
}, app)
.listen(3001,"192.168.2.4");
