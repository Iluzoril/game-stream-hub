const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Важные настройки для Socket.IO на Render
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
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

// API для проверки
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running on Render',
    url: 'https://game-stream-hub.onrender.com'
  });
});

// Хранилище сессий
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);

  // Создание сессии
  socket.on('create-session', (data) => {
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      hostId: socket.id,
      clients: new Map(),
      createdAt: new Date()
    });

    socket.join(sessionId);
    
    // Отправляем ТОЛЬКО sessionId, остальное клиент соберет сам
    socket.emit('session-created', { 
      sessionId: sessionId
    });
    
    console.log('🎮 Session created:', sessionId, 'by', socket.id);
  });

  // Подключение клиента
  socket.on('join-session', (sessionId) => {
    const session = sessions.get(sessionId);
    
    if (!session) {
      socket.emit('session-error', { message: 'Session not found. Check the ID.' });
      return;
    }

    session.clients.set(socket.id, {
      id: socket.id,
      connectedAt: new Date()
    });

    socket.join(sessionId);
    socket.emit('session-joined', { 
      sessionId: sessionId,
      hostId: session.hostId
    });
    
    // Уведомляем хост
    socket.to(session.hostId).emit('client-connected', { 
      clientId: socket.id,
      totalClients: session.clients.size
    });

    console.log('👥 Client', socket.id, 'joined session:', sessionId);
  });

  // WebRTC signaling
  socket.on('webrtc-offer', (data) => {
    console.log('📨 Forwarding offer to:', data.target);
    socket.to(data.target).emit('webrtc-offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  socket.on('webrtc-answer', (data) => {
    console.log('📨 Forwarding answer to:', data.target);
    socket.to(data.target).emit('webrtc-answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // Пинг-понг для задержки
  socket.on('ping', (timestamp) => {
    socket.emit('pong', timestamp);
  });

  // Отслеживание отключений
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    
    for (const [sessionId, session] of sessions.entries()) {
      if (session.hostId === socket.id) {
        // Хост отключился
        io.to(sessionId).emit('session-ended', { reason: 'Host disconnected' });
        sessions.delete(sessionId);
        console.log('🗑️ Session deleted:', sessionId);
        break;
      }
      
      if (session.clients.has(socket.id)) {
        // Клиент отключился
        session.clients.delete(socket.id);
        socket.to(session.hostId).emit('client-disconnected', {
          clientId: socket.id,
          totalClients: session.clients.size
        });
        console.log('👋 Client removed from session:', sessionId);
      }
    }
  });
});

function generateSessionId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 Server running on Render');
  console.log('📍 Port:', PORT);
  console.log('=================================');
});
