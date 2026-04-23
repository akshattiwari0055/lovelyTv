import { io, Socket } from "socket.io-client";
import { SOCKET_BASE_URL } from "./api";

let socket: Socket | null = null;

export function connectSocket(token: string) {
  if (socket) {
    return socket;
  }

  socket = io(SOCKET_BASE_URL, {
    autoConnect: true,
    auth: {
      token
    }
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
