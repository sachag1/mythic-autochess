import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Colyseus (via pm2/axm) écrit sur process.send, qui n'existe pas dans un thread.
    pool: "threads",
  },
});
