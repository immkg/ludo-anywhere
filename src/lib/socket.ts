import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

// Lazily creates one shared client, connecting to whatever origin the page
// itself was loaded from — never a hardcoded host, so this keeps working
// when a phone on the same network opens the app at e.g. http://192.168.x.x:3001.
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(typeof window !== "undefined" ? window.location.origin : undefined, {
    autoConnect: false,
  });
  return socket;
}
