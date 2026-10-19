import { createRoot } from "react-dom/client";
import { App } from "./App";
import { tryReconnect } from "./net/store";
import { Gallery } from "./scene/Gallery";
import { Portraits } from "./scene/Portraits";
import { Demo } from "./scene/Demo";
import "./styles.css";
import "./theme.css";

// ?gallery : galerie de développement des personnages (sans serveur).
const params = new URLSearchParams(location.search);
const gallery = params.has("gallery");
const portraits = params.has("portraits");
const demo = params.has("demo");
if (!gallery && !portraits && !demo) void tryReconnect();
createRoot(document.getElementById("root")!).render(gallery ? <Gallery /> : portraits ? <Portraits /> : demo ? <Demo /> : <App />);
