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
    
    // Уведомляем хост
    socket.to(session.hostId).emit('client-connected', { 
      clientId: socket.id
    });

    console.log('👤 Client joined session:', sessionId);
  });

  // WebRTC signaling
  socket.on('webrtc-offer', (data) => {
    console.log('📨 Forwarding offer to:', data.target);
    socket.to(data.target).emit('webrtc-offer', {
      offer: data.offer
    });
  });

  socket.on('webrtc-answer', (data) => {
    console.log('📨 Forwarding answer to:', data.target);
    socket.to(data.target).emit('webrtc-answer', {
      answer: data.answer
    });
  });

  socket.on('ice-candidate', (data) => {
    console.log('❄️ Forwarding ICE candidate to:', data.target);
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    
    // Очистка сессий
    for (const [sessionId, session] of sessions.entries()) {
      if (session.hostId === socket.id) {
        // Уведомляем клиентов о отключении хоста
        socket.to(sessionId).emit('host-disconnected');
        sessions.delete(sessionId);
        console.log('🗑️ Session deleted:', sessionId);
        break;
      }
      
      if (session.clients.has(socket.id)) {
        // Удаляем клиента
        session.clients.delete(socket.id);
        socket.to(session.hostId).emit('client-disconnected', {
          clientId: socket.id
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
server.listen(PORT, () => {
  console.log('=================================');
  console.log('🚀 Server running on port', PORT);
  console.log('=================================');
});
