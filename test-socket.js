import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected to server with ID:', socket.id);
  
  // Try to create a room
  console.log('Emitting createRoom...');
  socket.emit('createRoom');
});

socket.on('roomCreated', (roomId) => {
  console.log('Success! Room created:', roomId);
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('Connection Error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('Timeout: Did not receive roomCreated event within 5 seconds.');
  process.exit(1);
}, 5000);
