//********************************
// App setup
//********************************/
var application_root = __dirname,
    express = require("express"),
    path = require('path'),
    socket = require('socket.io'),
    http = require('http'),
    campfire = require('campfire'),
    ejs = require('ejs');

var app = express();

var server = http.createServer(app);
var port = process.env.PORT || 5000;
server.listen(port);
var io = socket.listen(server);

app.configure(function(){
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.logger());
  app.use(express.static(__dirname + '/public'));
  app.use(express.cookieParser());
  app.use(express.session({secret: 'IHAZSeCuRiTy'}));
});

//********************************
// Routes
//********************************/

/**
 * Homepage
 */
app.get('/', function(request, response) {
  if(doAuth(request, response)) {
    client.rooms(function(error, data) {
      response.render('index.ejs', {rooms: data});
    });
  }
});

/**
 * Show Login page
 */
app.get('/login', function(request, response) {
  response.render('login.ejs');
});

/**
 * Authenticate the user
 */
app.post('/login', function(request, response) {
  var username = request.body.username;
  var password = request.body.password;
  var account = request.body.account;

  campfire.login(username, password, {account: account, ssl: true}, function(error, user) {
    request.session.authToken = user.user.api_auth_token;
    request.session.account = account;

    setupClient(request);
    response.redirect('/');
  })
});

/**
 * Main room chat client
 */
app.get('/rooms/:roomId', function(request, response) {
  if(doAuth(request, response)) {
    var roomId = request.params.roomId;

    io.sockets.on('connection', function (socket) {
      client.join(roomId, function(error, room) {
        room.listen(function(message) {
          delete message.campfire;
          io.sockets.emit('new-message', message);
          lastMessageId = message.id;
        })
      })
    });

    response.render('room.ejs', {roomId: roomId});
  }
});

/**
 * Returns list of users in the given room
 */
app.get('/api/rooms/:roomId/users', function(request, response, next) {
  if(doAuth(request, response)) {
    var roomId = request.params.roomId;
    client.room(roomId, function(error, room) {
      response.send(room.users);
    })
  }
})

/**
 * Posts message to the given room
 */
app.post('/api/rooms/:roomId/speak', function(request, response) {
  if(doAuth(request, response)) {
    var message = request.body.message;
    var roomId = request.params.roomId;
    client.room(roomId, function(error, room) {
      room.speak(message);
    })
  }
});

/**
 * Returns most recent messages for the given room
 */
app.get('/api/rooms/:roomId/recent', function(request, response) {
  if(doAuth(request, response)) {
    var roomId = request.params.roomId;
    var limit = request.query.limit || 100;

    client.room(roomId, function(error, room) {
      room.messages(function(error, data) {

        var m = [];
        for(var i = 0; i < data.length; i++) {
          var d = data[i];
          delete d.campfire;
          m.push(d);
        }
        response.json(m);
      }, {limit: limit});
    })
  }
})

//********************************
// Helper functions
//********************************/

var client;

function doAuth(request, response) {
  if(typeof request.session.authToken == 'undefined' || request.session.authToken == '') {
    response.redirect('/login');
    return false;
  }
  return true;
}

function setupClient(request) {
  client = new campfire.Campfire({
    ssl: true,
    token: request.session.authToken,
    account: request.session.account
  })
}