// Démarre le serveur de jeu : npm start (port 2567 par défaut, variable PORT sinon).
import { server } from "./server.js";

const port = Number(process.env.PORT ?? 2567);
await server.listen(port);
console.log(`Game server listening on ws://localhost:${port}`);
