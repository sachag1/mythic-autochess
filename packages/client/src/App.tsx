import { useStore } from "./net/store";
import { GameView } from "./ui/GameView";
import { Lobby, WaitingRoom } from "./ui/Lobby";
import { Toasts } from "./ui/Overlays";

export function App() {
  const status = useStore((s) => s.status);
  const phase = useStore((s) => s.game?.phase);
  if (status !== "connected" || !phase) return <Lobby />;
  if (phase === "lobby")
    return (
      <>
        <WaitingRoom />
        <Toasts />
      </>
    );
  return <GameView />;
}
