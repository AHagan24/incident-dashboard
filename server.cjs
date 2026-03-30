const { createServer } = require("node:http");
const next = require("next");
const { Server } = require("socket.io");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const dev = process.argv.includes("--dev");
const hostname = "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: "*",
    },
  });

  global.io = io;

  io.on("connection", (socket) => {
    socket.emit("incident:connected", {
      connectedAt: new Date().toISOString(),
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(
      `> Server listening at http://localhost:${port} as ${
        dev ? "development" : "production"
      }`,
    );
  });
});
