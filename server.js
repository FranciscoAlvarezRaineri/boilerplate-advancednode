"use strict";
require("dotenv").config();
const express = require("express");
const myDB = require("./connection");
const fccTesting = require("./freeCodeCamp/fcctesting.js");
const passport = require("passport");
const session = require("express-session");

const passportSocketIo = require("passport.socketio");
const cookieParser = require("cookie-parser");
const MongoStore = require("connect-mongo")(session);
const URI = process.env.MONGO_URI;
const store = new MongoStore({ url: URI });

const routes = require("./routes.js");
const auth = require("./auth.js");

const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.set("view engine", "pug");
app.set("views", "./views/pug");

fccTesting(app); //For FCC testing purposes
app.use("/public", express.static(process.cwd() + "/public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    key: "express.sid",
    saveUninitialized: true,
    cookie: { secure: false },
    store: store,
  })
);
app.use(passport.initialize());
app.use(passport.session());

io.use(
  passportSocketIo.authorize({
    cookieParser: cookieParser,
    key: "express.sid",
    secret: process.env.SESSION_SECRET,
    store: store,
    success: onAuthorizeSuccess,
    fail: onAuthorizeFail,
  })
);

function onAuthorizeSuccess(data, accept) {
  console.log("successful connection to socket.io");

  accept(null, true);
}

function onAuthorizeFail(data, message, error, accept) {
  if (error) throw new Error(message);
  console.log("failed connection to socket.io:", message);
  accept(null, false);
}

myDB(async (client) => {
  const myDataBase = await client
    .db("fcc-mongodb-and-mongoose")
    .collection("users");

  routes(app, myDataBase);
  auth(app, myDataBase);

  io.on("connection", (socket) => {
    console.log("A user has connected");
    ++currentUsers;
    io.emit("user count", currentUsers);
    io.emit("user", {
      username: socket.request.user.username,
      currentUsers,
      connected: true,
    });

    socket.on("disconnect", (socket) => {
      console.log("A user has disconnected");
      --currentUsers;
      io.emit("user count", currentUsers);
      io.emit("user", {
        username: socket.request.user.username,
        currentUsers,
        connected: false,
      });
    });
    socket.on("chat message", (message) => {
      io.emit("chat message", {
        username: socket.request.user.username,
        message,
      });
    });
  });
}).catch((e) => {
  app.route("/").get((req, res) => {
    res.render("index", { title: e, message: "Unable to connect to database" });
  });
});

/*app.use((req, res, next) => {
  res.status(404).type("text").send("Not Found");
});*/

let currentUsers = 0;

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("Listening on port " + PORT);
});
