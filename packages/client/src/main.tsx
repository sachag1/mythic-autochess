import { createRoot } from "react-dom/client";
import { App } from "./App";
import { tryReconnect } from "./net/store";
import { Gallery } from "./scene/Gallery";
import "./styles.css";

// ?gallery : galerie de développement des personnages (sans serveur).
const gallery = new URLSearchParams(location.search).has("gallery");
if (!gallery) void tryReconnect();
createRoot(document.getElementById("root")!).render(gallery ? <Gallery /> : <App />);
