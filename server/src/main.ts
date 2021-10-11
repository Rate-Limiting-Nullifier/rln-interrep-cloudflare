import express from "express";
import http from "http";
import { seed } from "./utils/seed";
import { initDb } from "./db";
import { userRouter, appRouter } from "./api";

const PORT = 8080;

const main = async () => {
  // init express and SocketIO
  const app = express();

  const server = http.createServer(app);

  await initDb();
  // seed database if data doesn't exist
  await seed();

  app.use(express.json());

  app.use("/users", userRouter);
  app.use("/apps", appRouter);

  app.get("/", (req, res) => {
    res.send("<h1>Welcome to cloudflare rate limiting service.</h1>");
  });

  server.listen(PORT, () => {
    console.log(`Rate limiting service running on: ${PORT}`);
  });
};

main();