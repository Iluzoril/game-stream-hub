class ClientController {
    constructor() {
        this.socket = io();
        this.peerConnection = null;
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        this.sessionId = null;
        this.isConnected = false;
        this.latencyInterval = null;

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeSocketListeners();
        this.initializeInputHandling();
    }

    initializeElements() {
        this.connectScreen = document.getElementById('connectScreen');
        this.gameScreen = document.getElementById('gameScreen');
        this.sessionIdInput = document.getElementById('sessionIdInput');
        this.connectBtn = document.getElementById('connectBtn');
        this.errorMessage = document.getElementById('errorMessage');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.latencyElement = document.getElementById('latency');
        this.connectionStatusElement = document.getElementById('connectionStatus');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.loadingMessage = document.getElementById('loadingMessage');
    }

    initializeEventListeners() {
        this.connectBtn.addEventListener('click', () => this.connectToSession());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        
        this.sessionIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connectToSession();
        });

        this.sessionIdInput.addEventListener('input', (e) => {
            // Автоматическое приведение к верхнему регистру
            e.target.value = e.target.value.toUpperCase();
            this.hideError();
        });

        // Полноэкранный режим по двойному клику
        this.remoteVideo.addEventListener('dblclick', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                this.remoteVideo.requestFullscreen().catch(err => {
                    console.log('Fullscreen error:', err);
                });
            }
        });
    }

    initializeSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server as client');
            this.updateConnectionStatus('Подключено к серверу');
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('Отключено от сервера');
        });

        this.socket.on('session-joined', (data) => {
            this.sessionId = data.sessionId;
            this.updateConnectionStatus('Подключение к хосту...');
            this.showGameScreen();
        });

        this.socket.on('session-error', (data) => {
            this.showError(data.message);
            this.updateConnectionStatus('Ошибка подключения');
        });

        this.socket.on('session-ended', (data) => {
            alert(`Сессия завершена: ${data.reason}`);
            this.disconnect();
        });

        this.socket.on('webrtc-offer', async (data) => {
            await this.handleOffer(data.offer);
        });

        this.socket.on('webrtc-answer', async (data) => {
            await this.handleAnswer(data.answer);
        });

        this.socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data.candidate);
        });

        // Замер latency
        this.socket.on('ping', (timestamp) => {
            this.socket.emit('pong', timestamp);
        });
    }

    initializeInputHandling() {
        // Обработка ввода с клавиатуры
        document.addEventListener('keydown', (event) => {
            if (!this.isConnected) return;
            
            // Игнорируем некоторые служебные клавиши
            if (['Shift', 'Control', 'Alt', 'Meta', 'OS'].includes(event.key)) {
                return;
            }

            this.sendInputEvent({
                type: 'keydown',
                key: event.key,
                code: event.code,
                keyCode: event.keyCode,
                timestamp: Date.now()
            });

            // Предотвращаем действие браузера для игровых клавиш
            if (this.isGameKey(event)) {
                event.preventDefault();
            }
        });

        document.addEventListener('keyup', (event) => {
            if (!this.isConnected) return;

            this.sendInputEvent({
                type: 'keyup',
                key: event.key,
                code: event.code,
                keyCode: event.keyCode,
                timestamp: Date.now()
            });
        });

        // Обработка ввода мышью
        this.remoteVideo.addEventListener('mousedown', (event) => {
            if (!this.isConnected) return;
            
            const rect = this.remoteVideo.getBoundingClientRect();
            this.sendInputEvent({
                type: 'mousedown',
                button: event.button,
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
                normalizedX: (event.clientX - rect.left) / rect.width,
                normalizedY: (event.clientY - rect.top) / rect.height,
                timestamp: Date.now()
            });
        });

        this.remoteVideo.addEventListener('mouseup', (event) => {
            if (!this.isConnected) return;
            
            const rect = this.remoteVideo.getBoundingClientRect();
            this.sendInputEvent({
                type: 'mouseup',
                button: event.button,
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
                normalizedX: (event.clientX - rect.left) / rect.width,
                normalizedY: (event.clientY - rect.top) / rect.height,
                timestamp: Date.now()
            });
        });

        this.remoteVideo.addEventListener('mousemove', (event) => {
            if (!this.isConnected) return;
            
            const rect = this.remoteVideo.getBoundingClientRect();
            this.sendInputEvent({
                type: 'mousemove',
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
                normalizedX: (event.clientX - rect.left) / rect.width,
                normalizedY: (event.clientY - rect.top) / rect.height,
                movementX: event.movementX,
                movementY: event.movementY,
                timestamp: Date.now()
            });
        });

        this.remoteVideo.addEventListener('wheel', (event) => {
            if (!this.isConnected) return;
            
            this.sendInputEvent({
                type: 'mousewheel',
                deltaX: event.deltaX,
                deltaY: event.deltaY,
                deltaZ: event.deltaZ,
                deltaMode: event.deltaMode,
                timestamp: Date.now()
            });
            
            event.preventDefault();
        });

        // Контекстное меню
        this.remoteVideo.addEventListener('contextmenu', (event) => {
            if (!this.isConnected) return;
            event.preventDefault();
        });
    }

    isGameKey(event) {
        const gameKeys = [
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            ' ', 'Enter', 'Escape', 'Tab', 'Shift',
            'Control', 'Alt', 'a', 'w', 's', 'd'
        ];
        return gameKeys.includes(event.key);
    }

    connectToSession() {
        const sessionId = this.sessionIdInput.value.trim().toUpperCase();
        
        if (!sessionId) {
            this.showError('Пожалуйста, введите ID сессии');
            return;
        }

        if (sessionId.length < 4 || sessionId.length > 8) {
            this.showError('ID сессии должен содержать от 4 до 8 символов');
            return;
        }

        this.hideError();
        this.updateConnectionStatus('Подключение к сессии...');
        this.connectBtn.disabled = true;
        this.connectBtn.textContent = 'Подключение...';

        this.socket.emit('join-session', sessionId);
        
        // Таймаут подключения
        setTimeout(() => {
            if (!this.isConnected && this.connectBtn.disabled) {
                this.showError('Таймаут подключения. Проверьте ID сессии.');
                this.connectBtn.disabled = false;
                this.connectBtn.textContent = 'Подключиться';
            }
        }, 10000);
    }

    showGameScreen() {
        this.connectScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.startLatencyMeasurement();
    }

    showConnectScreen() {
        this.gameScreen.classList.add('hidden');
        this.connectScreen.classList.remove('hidden');
        this.stopLatencyMeasurement();
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
        this.connectBtn.disabled = false;
        this.connectBtn.textContent = 'Подключиться';
    }

    hideError() {
        this.errorMessage.style.display = 'none';
    }

    updateConnectionStatus(status) {
        if (this.connectionStatusElement) {
            this.connectionStatusElement.textContent = status;
        }
    }

    updateLatency(latency) {
        if (this.latencyElement) {
            this.latencyElement.textContent = latency;
            
            // Цвет индикатора в зависимости от задержки
            if (latency < 50) {
                this.latencyElement.style.color = '#4CAF50';
            } else if (latency < 100) {
                this.latencyElement.style.color = '#FF9800';
            } else {
                this.latencyElement.style.color = '#f44336';
            }
        }
    }

    startLatencyMeasurement() {
        this.latencyInterval = setInterval(() => {
            const startTime = Date.now();
            this.socket.emit('ping', startTime);
        }, 2000);

        // Обработчик pong для расчета задержки
        this.socket.on('pong', (startTime) => {
            const latency = Date.now() - startTime;
            this.updateLatency(latency);
        });
    }

    stopLatencyMeasurement() {
        if (this.latencyInterval) {
            clearInterval(this.latencyInterval);
            this.latencyInterval = null;
        }
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.configuration);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    target: 'host',
                    candidate: event.candidate
                });
            }
        };

        this.peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event);
            if (event.streams && event.streams[0]) {
                this.remoteVideo.srcObject = event.streams[0];
                this.loadingMessage.style.display = 'none';
                this.isConnected = true;
                this.updateConnectionStatus('Подключено');
                
                // Автозапуск видео
                this.remoteVideo.play().catch(err => {
                    console.log('Video play error:', err);
                });
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('WebRTC connection state:', state);
            
            switch (state) {
                case 'connected':
                    this.isConnected = true;
                    this.updateConnectionStatus('Соединение установлено');
                    break;
                case 'disconnected':
                    this.updateConnectionStatus('Соединение прервано');
                    break;
                case 'failed':
                    this.updateConnectionStatus('Ошибка соединения');
                    this.showError('Ошибка подключения к хосту');
                    break;
                case 'closed':
                    this.isConnected = false;
                    this.updateConnectionStatus('Соединение закрыто');
                    break;
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.peerConnection.iceConnectionState);
        };
    }

    async handleOffer(offer) {
        try {
            if (!this.peerConnection) {
                this.createPeerConnection();
            }

            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('webrtc-answer', {
                target: 'host',
                answer: answer
            });

        } catch (error) {
            console.error('Error handling offer:', error);
            this.showError('Ошибка установки соединения');
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(answer);
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    handleIceCandidate(candidate) {
        try {
            if (this.peerConnection && candidate) {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    sendInputEvent(inputEvent) {
        if (this.socket && this.isConnected) {
            this.socket.emit('client-input', inputEvent);
        }
    }

    disconnect() {
        this.isConnected = false;
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.remoteVideo.srcObject) {
            this.remoteVideo.srcObject = null;
        }

        this.stopLatencyMeasurement();
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket.connect(); // Переподключаемся для возможности нового подключения
        }

        this.connectBtn.disabled = false;
        this.connectBtn.textContent = 'Подключиться';
        this.sessionIdInput.value = '';
        
        this.showConnectScreen();
    }

    cleanup() {
        this.disconnect();
    }
}

// Инициализация клиента
document.addEventListener('DOMContentLoaded', () => {
    window.clientController = new ClientController();
    
    // Очистка при закрытии страницы
    window.addEventListener('beforeunload', () => {
        if (window.clientController) {
            window.clientController.cleanup();
        }
    });
});