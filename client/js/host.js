class HostController {
    constructor() {
        this.socket = io();
        this.sessionId = null;
        this.localStream = null;
        this.peerConnections = new Map();
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        this.serverInfo = null;

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeSocketListeners();
        this.getServerInfo();
        this.startHosting();
    }

    initializeElements() {
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = this.statusIndicator.querySelector('.status-text');
        this.statusDot = this.statusIndicator.querySelector('.status-dot');
        this.sessionIdElement = document.getElementById('sessionId');
        this.connectedClientsElement = document.getElementById('connectedClients');
        this.streamStatusElement = document.getElementById('streamStatus');
        this.localVideo = document.getElementById('localVideo');
        this.copyBtn = document.getElementById('copyBtn');
        this.stopHostingBtn = document.getElementById('stopHostingBtn');
        
        // Создаем элемент для информации о подключении
        this.createConnectionInfoElement();
    }

    createConnectionInfoElement() {
        const sessionInfo = document.querySelector('.session-info');
        this.connectionInfo = document.createElement('div');
        this.connectionInfo.className = 'connection-info';
        this.connectionInfo.innerHTML = `
            <h3>Ссылка для подключения:</h3>
            <div class="connection-url">
                <input type="text" id="connectionUrl" readonly value="Загрузка...">
                <button id="copyUrlBtn" class="btn-secondary">Копировать ссылку</button>
            </div>
            <p class="connection-help">
                Отправьте эту ссылку другу или откройте на другом устройстве
            </p>
            <div class="session-stats">
                <div class="stat-item">
                    <span class="stat-label">Статус:</span>
                    <span class="stat-value" id="sessionStatus">Неактивна</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Клиентов:</span>
                    <span class="stat-value" id="sessionClients">0</span>
                </div>
            </div>
        `;
        sessionInfo.appendChild(this.connectionInfo);
    }

    initializeEventListeners() {
        this.copyBtn.addEventListener('click', () => this.copySessionId());
        this.stopHostingBtn.addEventListener('click', () => this.stopHosting());
        
        // Обработчик для копирования ссылки
        document.addEventListener('click', (e) => {
            if (e.target.id === 'copyUrlBtn') {
                this.copyConnectionUrl();
            }
        });
    }

    initializeSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server as host');
            this.updateStatus('Подключено к серверу', 'connected');
        });

        this.socket.on('disconnect', () => {
            this.updateStatus('Отключено от сервера', 'disconnected');
        });

        this.socket.on('session-created', (data) => {
            this.sessionId = data.sessionId;
            this.sessionIdElement.textContent = this.sessionId;
            this.updateStatus('Ожидание подключения клиента...', 'waiting');
            
            // Обновляем ссылку для подключения
            this.updateConnectionInfo(data.connectionUrl);
            this.updateSessionStats('Активна', '0');
        });

        this.socket.on('client-connected', (data) => {
            this.updateConnectedClients(data.totalClients);
            this.updateSessionStats('Активна', data.totalClients);
            this.createPeerConnection(data.clientId);
            this.updateStatus('Клиент подключен!', 'connected');
        });

        this.socket.on('client-disconnected', (data) => {
            this.updateConnectedClients(data.totalClients);
            this.updateSessionStats('Активна', data.totalClients);
            this.peerConnections.delete(data.clientId);
            
            if (data.totalClients === 0) {
                this.updateStatus('Ожидание подключения...', 'waiting');
            }
        });

        this.socket.on('webrtc-offer', async (data) => {
            await this.handleOffer(data.sender, data.offer);
        });

        this.socket.on('webrtc-answer', async (data) => {
            await this.handleAnswer(data.sender, data.answer);
        });

        this.socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data.sender, data.candidate);
        });

        this.socket.on('client-input', (data) => {
            console.log('Input received from client:', data);
            // Здесь можно добавить обработку ввода от клиента
            // Например, эмуляцию нажатий клавиш на хосте
        });

        this.socket.on('session-ended', (data) => {
            alert(`Сессия завершена: ${data.reason}`);
            this.stopHosting();
        });
    }

    async getServerInfo() {
        try {
            const response = await fetch('/api/server-info');
            const data = await response.json();
            this.serverInfo = data;
            console.log('Server info:', data);
        } catch (error) {
            console.error('Failed to get server info:', error);
        }
    }

    async startHosting() {
        try {
            this.updateStatus('Запуск трансляции...', 'waiting');
            
            // Запрос доступа к экрану
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    frameRate: { ideal: 30, max: 60 },
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });

            // Обработчик остановки трансляции пользователем
            this.localStream.getTracks().forEach(track => {
                track.onended = () => {
                    this.stopHosting();
                };
            });

            this.localVideo.srcObject = this.localStream;
            this.streamStatusElement.textContent = 'Активен';
            
            // Создание сессии на сервере
            this.socket.emit('create-session', {
                game: 'Desktop Stream',
                resolution: '1920x1080',
                fps: 30
            });

            this.updateStatus('Трансляция запущена', 'connected');

        } catch (error) {
            console.error('Error starting hosting:', error);
            this.updateStatus('Ошибка запуска трансляции', 'error');
            
            if (error.name === 'NotAllowedError') {
                alert('Доступ к экрану запрещен. Разрешите доступ в настройках браузера.');
            } else if (error.name === 'NotFoundError') {
                alert('Не найдено доступных источников для захвата экрана.');
            } else {
                alert('Не удалось начать трансляцию: ' + error.message);
            }
        }
    }

    async createPeerConnection(clientId) {
        try {
            const peerConnection = new RTCPeerConnection(this.configuration);

            // Добавляем все треки из локального стрима
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });

            // Обработка ICE кандидатов
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        target: clientId,
                        candidate: event.candidate
                    });
                }
            };

            peerConnection.onconnectionstatechange = () => {
                console.log(`Connection state with ${clientId}:`, peerConnection.connectionState);
                
                if (peerConnection.connectionState === 'connected') {
                    this.updateStatus('Соединение установлено', 'connected');
                } else if (peerConnection.connectionState === 'disconnected') {
                    this.updateStatus('Соединение прервано', 'waiting');
                }
            };

            peerConnection.ontrack = (event) => {
                console.log('Received track from client:', event);
            };

            // Создание offer
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });
            
            await peerConnection.setLocalDescription(offer);

            this.socket.emit('webrtc-offer', {
                target: clientId,
                offer: offer
            });

            this.peerConnections.set(clientId, peerConnection);
            console.log(`Peer connection created for client: ${clientId}`);

        } catch (error) {
            console.error('Error creating peer connection:', error);
        }
    }

    async handleOffer(clientId, offer) {
        try {
            if (!this.peerConnections.has(clientId)) {
                await this.createPeerConnection(clientId);
            }

            const peerConnection = this.peerConnections.get(clientId);
            await peerConnection.setRemoteDescription(offer);
            
            // Добавляем треки если их еще нет
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    const existingSender = peerConnection.getSenders().find(
                        sender => sender.track && sender.track.kind === track.kind
                    );
                    if (!existingSender) {
                        peerConnection.addTrack(track, this.localStream);
                    }
                });
            }

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            this.socket.emit('webrtc-answer', {
                target: clientId,
                answer: answer
            });

        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(clientId, answer) {
        try {
            const peerConnection = this.peerConnections.get(clientId);
            if (peerConnection) {
                await peerConnection.setRemoteDescription(answer);
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    handleIceCandidate(clientId, candidate) {
        try {
            const peerConnection = this.peerConnections.get(clientId);
            if (peerConnection && candidate) {
                peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    updateStatus(text, status) {
        this.statusText.textContent = text;
        this.statusDot.className = 'status-dot';
        
        switch (status) {
            case 'connected':
                this.statusDot.classList.add('connected');
                break;
            case 'waiting':
                this.statusDot.classList.add('waiting');
                break;
            case 'error':
                this.statusDot.classList.add('error');
                break;
            case 'disconnected':
                this.statusDot.classList.add('disconnected');
                break;
        }
    }

    updateConnectedClients(count) {
        this.connectedClientsElement.textContent = `${count}/5`;
    }

    updateConnectionInfo(connectionUrl) {
        const urlInput = document.getElementById('connectionUrl');
        if (urlInput) {
            urlInput.value = connectionUrl;
        }
    }

    updateSessionStats(status, clients) {
        const statusElement = document.getElementById('sessionStatus');
        const clientsElement = document.getElementById('sessionClients');
        
        if (statusElement) statusElement.textContent = status;
        if (clientsElement) clientsElement.textContent = clients;
    }

    copySessionId() {
        if (this.sessionId) {
            navigator.clipboard.writeText(this.sessionId).then(() => {
                this.showTempMessage('ID сессии скопирован!', this.copyBtn);
            }).catch(err => {
                console.error('Failed to copy session ID:', err);
            });
        }
    }

    copyConnectionUrl() {
        const urlInput = document.getElementById('connectionUrl');
        if (urlInput && urlInput.value !== 'Загрузка...') {
            navigator.clipboard.writeText(urlInput.value).then(() => {
                this.showTempMessage('Ссылка скопирована!', document.getElementById('copyUrlBtn'));
            }).catch(err => {
                console.error('Failed to copy URL:', err);
            });
        }
    }

    showTempMessage(message, element) {
        const originalText = element.textContent;
        element.textContent = message;
        element.disabled = true;
        
        setTimeout(() => {
            element.textContent = originalText;
            element.disabled = false;
        }, 2000);
    }

    stopHosting() {
        // Останавливаем все треки
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
                track.onended = null; // Убираем обработчики
            });
            this.localStream = null;
        }

        // Закрываем все peer соединения
        this.peerConnections.forEach((pc, clientId) => {
            pc.close();
            console.log(`Closed peer connection for client: ${clientId}`);
        });
        this.peerConnections.clear();

        // Перенаправляем на главную страницу
        window.location.href = '/';
    }

    // Очистка при разгрузке страницы
    cleanup() {
        this.stopHosting();
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Инициализация когда DOM загружен
document.addEventListener('DOMContentLoaded', () => {
    window.hostController = new HostController();
    
    // Очистка при закрытии страницы
    window.addEventListener('beforeunload', () => {
        if (window.hostController) {
            window.hostController.cleanup();
        }
    });
});