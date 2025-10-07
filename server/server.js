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

// API для проверки
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
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
      clients: new Map() // Используем Map вместо Set для хранения данных клиентов
    });

    socket.join(sessionId);
    socket.emit('session-created', { 
      sessionId
    });
    console.log('🎮 Session created:', sessionId, 'by', socket.id);
  });

  // Подключение клиента
  socket.on('join-session', (sessionId) => {
    const session = sessions.get(sessionId);
    
    if (!session) {
      socket.emit('session-error', { message: 'Session not found' });
      return;
    }

    // Сохраняем клиента с дополнительной информацией
    session.clients.set(socket.id, {
      id: socket.id,
      connectedAt: new Date()
    });

    socket.join(sessionId);
    socket.emit('session-joined', { 
      sessionId,
      hostId: session.hostId
    });
    
    // Уведомляем хост о новом клиенте
    socket.to(session.hostId).emit('client-connected', { 
      clientId: socket.id,
      totalClients: session.clients.size
    });

    console.log('👥 Client joined:', socket.id, 'to session:', sessionId, 'Total clients:', session.clients.size);
  });

  // WebRTC signaling
  socket.on('webrtc-offer', (data) => {
    console.log('📨 Forwarding offer from', socket.id, 'to', data.target);
    socket.to(data.target).emit('webrtc-offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  socket.on('webrtc-answer', (data) => {
    console.log('📨 Forwarding answer from', socket.id, 'to', data.target);
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
        // Хост отключился - уведомляем всех клиентов
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
        console.log('👋 Client removed:', socket.id, 'from session:', sessionId);
      }
    }
  });
});

function generateSessionId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('=================================');
  console.log('🚀 GameStream Hub Server Started');
  console.log('📍 http://localhost:' + PORT);
  console.log('=================================');
});
