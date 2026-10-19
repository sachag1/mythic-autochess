import { createRoot } from "react-dom/client";
import { App } from "./App";
import { tryReconnect } from "./net/store";
import "./styles.css";

void tryReconnect();
createRoot(document.getElementById("root")!).render(<App />);
