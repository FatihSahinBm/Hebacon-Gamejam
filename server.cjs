const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Room state
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[roomId] = { players: {}, runnerCaught: false, score: 0 };
    // Creator joins as Runner (Blue) initially
    rooms[roomId].players[socket.id] = {
      id: socket.id,
      x: 0, y: 0, z: 0, r: 0,
      team: 'runner', // runner (blue) or chaser (red)
      isStunned: false
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('roomCreated', roomId);
    socket.emit('assignedTeam', 'runner');
    io.to(roomId).emit('playerList', rooms[roomId].players);
    console.log(`Room [${roomId}] created by ${socket.id}`);
  });

  socket.on('joinRoom', (roomId) => {
    roomId = roomId.toUpperCase();
    if (rooms[roomId]) {
      let team = 'runner';
      const existingPlayers = Object.values(rooms[roomId].players);
      const runnerExists = existingPlayers.some(p => p.team === 'runner');
      if (runnerExists) {
        team = 'chaser'; // Red team
      }

      rooms[roomId].players[socket.id] = {
        id: socket.id,
        x: 0, y: 0, z: 0, r: 0,
        team: team,
        isStunned: false
      };
      socket.join(roomId);
      socket.roomId = roomId;
      socket.emit('roomJoined', roomId);
      socket.emit('assignedTeam', team);
      io.to(roomId).emit('playerList', rooms[roomId].players);
      console.log(`${socket.id} joined room [${roomId}] as ${team}`);
    } else {
      socket.emit('errorMsg', 'Oda bulunamadı!');
    }
  });

  socket.on('playerMove', (data) => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId] && rooms[roomId].players[socket.id]) {
      const p = rooms[roomId].players[socket.id];
      p.x = data.x;
      p.y = data.y;
      p.z = data.z;
      p.r = data.r;
      p.isStunned = data.isStunned;
      
      // Update others in room
      socket.to(roomId).emit('playerMoved', { id: socket.id, ...data });
    }
  });

  socket.on('catchRunner', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].score += 1;
      io.to(roomId).emit('runnerCaught', { score: rooms[roomId].score });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      delete rooms[roomId].players[socket.id];
      io.to(roomId).emit('playerDisconnected', socket.id);
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete rooms[roomId]; // Clean up empty rooms
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.IO Server running on port ${PORT}`);
});
