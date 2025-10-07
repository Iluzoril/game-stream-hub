const isProduction = process.env.NODE_ENV === 'production';
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');

// Функция для получения IP адреса
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

const localIP = getLocalIP();
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: isProduction ? [
      "https://your-app-name.onrender.com",
      "http://your-app-name.onrender.com"
    ] : "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client'), {
  maxAge: isProduction ? '1d' : '0',
  etag: true,
  lastModified: true
}));

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

// API для получения информации о сервере
app.get('/api/server-info', (req, res) => {
  res.json({
    ip: localIP,
    port: PORT,
    urls: {
      main: `http://${localIP}:${PORT}`,
      host: `http://${localIP}:${PORT}/host`,
      client: `http://${localIP}:${PORT}/client`
    }
  });
});

app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'GameStream Hub Server is running',
    ip: localIP,
    port: PORT,
    timestamp: new Date().toISOString(),
    sessions: sessions ? sessions.size : 0
  });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  }
});


// Хранилище сессий
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Создание сессии для хоста
  socket.on('create-session', (data) => {
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      hostId: socket.id,
      clients: new Set(),
      game: data.game || 'Unknown Game',
      createdAt: new Date()
    });

    socket.join(sessionId);
    socket.emit('session-created', { 
      sessionId,
      connectionUrl: `http://${localIP}:${PORT}/client`
    });
    console.log(`Session created: ${sessionId} by ${socket.id}`);
  });

  // Подключение клиента к сессии
  socket.on('join-session', (sessionId) => {
    const session = sessions.get(sessionId);
    
    if (!session) {
      socket.emit('session-error', { message: 'Сессия не найдена' });
      return;
    }

    session.clients.add(socket.id);
    socket.join(sessionId);
    socket.emit('session-joined', { sessionId });
    
    // Уведомляем хост о новом клиенте
    socket.to(session.hostId).emit('client-connected', { 
      clientId: socket.id,
      totalClients: session.clients.size
    });

    console.log(`Client ${socket.id} joined session ${sessionId}`);
  });

  // WebRTC signaling
  socket.on('webrtc-offer', (data) => {
    socket.to(data.target).emit('webrtc-offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  socket.on('webrtc-answer', (data) => {
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

  // Передача input данных от клиента к хосту
  socket.on('client-input', (data) => {
    const session = findSessionByClient(socket.id);
    if (session) {
      socket.to(session.hostId).emit('client-input', data);
    }
  });

  // Получение информации о сессии
  socket.on('get-session-info', (sessionId) => {
    const session = sessions.get(sessionId);
    if (session) {
      socket.emit('session-info', {
        sessionId: sessionId,
        clientsCount: session.clients.size,
        game: session.game,
        createdAt: session.createdAt
      });
    }
  });

  // Отслеживание отключений
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Удаляем клиента из сессий
    for (const [sessionId, session] of sessions.entries()) {
      if (session.hostId === socket.id) {
        // Хост отключился - закрываем сессию
        io.to(sessionId).emit('session-ended', { reason: 'Хост отключился' });
        sessions.delete(sessionId);
        console.log(`Session ${sessionId} ended (host disconnected)`);
        break;
      }
      
      if (session.clients.has(socket.id)) {
        // Клиент отключился
        session.clients.delete(socket.id);
        socket.to(session.hostId).emit('client-disconnected', {
          clientId: socket.id,
          totalClients: session.clients.size
        });
      }
    }
  });

  function findSessionByClient(clientId) {
    for (const session of sessions.values()) {
      if (session.clients.has(clientId)) {
        return session;
      }
    }
    return null;
  }
});

function generateSessionId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Обработка ошибок
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Запуск сервера
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 GameStream Hub Server Started`);
  console.log(`📍 Local:  http://localhost:${PORT}`);
  console.log(`📍 Network: http://${localIP}:${PORT}`);
  console.log(`🔧 API Status: http://${localIP}:${PORT}/api/status`);
  console.log(`=================================`);
  console.log(`📢 Для подключения с других устройств:`);
  console.log(`   http://${localIP}:${PORT}`);
  console.log(`=================================`);
});