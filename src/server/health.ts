import express from "express";

/** HTTP health listener with no env/Telegram imports — used by Railway PR previews. */
export function startHealthServer(): void {
  const app = express();
  const port = Number(process.env.PORT ?? 8080);
  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });
  app.listen(port, () => {
    console.log(`HTTP server listening on port ${port}`);
  });
}
