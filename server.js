
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

app.get("/", (req, res) => {
  res.send("PowerGrid server is running!");
});

function makeRoomCode() {
  let code;

  do {
    code = crypto.randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(code));

  return code;
}

function getRoomPlayers(room) {
  return [...room.players.values()].map((player) => ({
    id: player.id,
    name: player.name
  }));
}

function sendRoomUpdate(code) {
  const room = rooms.get(code);
  if (!room) return;

  io.to(code).emit("roomUpdate", {
    code,
    name: room.name,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    players: getRoomPlayers(room)
  });
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("createRoom", (settings, callback) => {
    if (typeof callback !== "function") return;

    if (socket.data.roomCode) {
      callback({ ok: false, message: "이미 방에 참가 중입니다." });
      return;
    }

    const maxPlayers = Math.max(
      2,
      Math.min(8, Number(settings?.maxPlayers) || 8)
    );

    const code = makeRoomCode();

    const room = {
      name: String(settings?.name || "PowerGrid Room").slice(0, 30),
      mode: settings?.mode === "SURVIVAL" ? "SURVIVAL" : "PVP",
      maxPlayers,
      players: new Map()
    };

    room.players.set(socket.id, {
      id: socket.id,
      name: String(settings?.playerName || "Player").slice(0, 20)
    });

    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(code);

    callback({ ok: true, code });
    sendRoomUpdate(code);
  });

  socket.on("joinRoom", (data, callback) => {
    if (typeof callback !== "function") return;

    if (socket.data.roomCode) {
      callback({ ok: false, message: "이미 방에 참가 중입니다." });
      return;
    }

    const code = String(data?.code || "")
      .trim()
      .toUpperCase();

    const room = rooms.get(code);

    if (!room) {
      callback({ ok: false, message: "방을 찾을 수 없습니다." });
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      callback({ ok: false, message: "방 인원이 가득 찼습니다." });
      return;
    }

    room.players.set(socket.id, {
      id: socket.id,
      name: String(data?.playerName || "Player").slice(0, 20)
    });

    socket.data.roomCode = code;
    socket.join(code);

    callback({ ok: true, code });
    sendRoomUpdate(code);
  });

  socket.on("leaveRoom", () => {
    leaveRoom(socket);
  });

  socket.on("disconnect", () => {
    leaveRoom(socket);
    console.log("Player disconnected:", socket.id);
  });
});

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;

  const room = rooms.get(code);

  socket.data.roomCode = null;
  socket.leave(code);

  if (!room) return;

  room.players.delete(socket.id);

  if (room.players.size === 0) {
    rooms.delete(code);
  } else {
    sendRoomUpdate(code);
  }
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PowerGrid server listening on port ${PORT}`);
});
