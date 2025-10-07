const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Маршруты
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/host.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/client.html'));
});

// Хранилище сессий
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);

  // Создание сессии
  socket.on('create-session', () => {
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      hostId: socket.id,
      clients: new Set()
    });

    socket.join(sessionId);
    socket.emit('session-created', { sessionId });
    console.log('🎮 Session created:', sessionId);
  });

  // Подключение клиента
  socket.on('join-session', (sessionId) => {
    const session = sessions.get(sessionId);
    
    if (!session) {
      socket.emit('session-error', { message: 'Session not found' });
      return;
    }

    session.clients.add(socket.id);
    socket.join(sessionId);
    socket.emit('session-joined', { sessionId });
    
    socket.to(session.hostId).emit('client-connected', { 
      clientId: socket.id
    });
  });

  // WebRTC signaling - ВАЖНО: передаем данные правильно
  socket.on('webrtc-offer', (data) => {
    console.log('📨 Forwarding offer to:', data.target);
    // Передаем ВЕСЬ объект data, а не только offer
    socket.to(data.target).emit('webrtc-offer', {
      type: 'offer',
      offer: data.offer,
      sender: socket.id
    });
  });

  socket.on('webrtc-answer', (data) => {
    console.log('📨 Forwarding answer to:', data.target);
    socket.to(data.target).emit('webrtc-answer', {
      type: 'answer', 
      answer: data.answer,
      sender: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    console.log('❄️ Forwarding ICE candidate to:', data.target);
    // ВАЖНО: передаем объект candidate правильно
    socket.to(data.target).emit('ice-candidate', {
      type: 'candidate',
      candidate: data.candidate ? {
        candidate: data.candidate.candidate,
        sdpMid: data.candidate.sdpMid || '',
        sdpMLineIndex: data.candidate.sdpMLineIndex || 0,
        usernameFragment: data.candidate.usernameFragment || null
      } : null,
      sender: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

function generateSessionId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
});
