import { createRoot } from "react-dom/client";
import { App } from "./App";
import { tryReconnect } from "./net/store";
import { Gallery } from "./scene/Gallery";
import { Portraits } from "./scene/Portraits";
import "./styles.css";
import "./theme.css";

// ?gallery : galerie de développement des personnages (sans serveur).
const params = new URLSearchParams(location.search);
const gallery = params.has("gallery");
const portraits = params.has("portraits");
if (!gallery && !portraits) void tryReconnect();
createRoot(document.getElementById("root")!).render(gallery ? <Gallery /> : portraits ? <Portraits /> : <App />);
