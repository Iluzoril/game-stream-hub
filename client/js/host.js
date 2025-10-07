class HostController {
    constructor() {
        // Подключаемся к серверу на Render
        this.socket = io({
            transports: ['websocket', 'polling']
        });
        
        this.sessionId = null;
        this.localStream = null;
        this.peerConnections = new Map();
        
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeSocketListeners();
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
        
        // Создаем контейнер для ссылки
        this.createConnectionInfo();
    }

    createConnectionInfo() {
        const sessionInfo = document.querySelector('.session-info');
        const connectionDiv = document.createElement('div');
        connectionDiv.className = 'connection-info';
        connectionDiv.innerHTML = `
            <h3>Информация для подключения:</h3>
            <div class="connection-url">
                <strong>ID сессии: </strong><span id="sessionIdDisplay">-</span>
            </div>
            <div class="connection-url">
                <strong>Ссылка для клиента: </strong>
                <span>https://game-stream-hub.onrender.com/client</span>
            </div>
            <p class="connection-help">
                Откройте ссылку на другом устройстве и введите ID сессии
            </p>
        `;
        sessionInfo.appendChild(connectionDiv);
        
        this.sessionIdDisplay = document.getElementById('sessionIdDisplay');
    }

    initializeEventListeners() {
        this.copyBtn.addEventListener('click', () => this.copySessionId());
        this.stopHostingBtn.addEventListener('click', () => this.stopHosting());
    }

    initializeSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to Render server');
            this.updateStatus('Connected to server', 'waiting');
        });

        this.socket.on('session-created', (data) => {
            this.sessionId = data.sessionId;
            this.sessionIdElement.textContent = this.sessionId;
            this.sessionIdDisplay.textContent = this.sessionId;
            this.updateStatus('Waiting for client...', 'waiting');
            this.updateConnectedClients(0);
            console.log('✅ Session created with ID:', this.sessionId);
        });

        this.socket.on('client-connected', (data) => {
            console.log('✅ Client connected:', data.clientId);
            this.updateConnectedClients(data.totalClients);
            this.updateStatus('Client connected! Starting stream...', 'connected');
            this.createPeerConnection(data.clientId);
        });

        this.socket.on('client-disconnected', (data) => {
            console.log('❌ Client disconnected');
            this.updateConnectedClients(data.totalClients);
            this.peerConnections.delete(data.clientId);
            
            if (data.totalClients === 0) {
                this.updateStatus('Waiting for client...', 'waiting');
            }
        });

        this.socket.on('webrtc-answer', async (data) => {
            console.log('📨 Received WebRTC answer');
            await this.handleAnswer(data.sender, data.answer);
        });

        this.socket.on('ice-candidate', (data) => {
            console.log('❄️ Received ICE candidate');
            this.handleIceCandidate(data.sender, data.candidate);
        });

        this.socket.on('session-ended', (data) => {
            alert('Session ended: ' + data.reason);
            this.stopHosting();
        });
    }

    async startHosting() {
        try {
            this.updateStatus('Requesting screen access...', 'waiting');
            
            // Захват экрана с базовыми настройками
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    frameRate: 30
                },
                audio: true
            });

            console.log('🎥 Screen capture started');

            // Обработчик остановки трансляции
            this.localStream.getTracks().forEach(track => {
                track.onended = () => {
                    console.log('🛑 Screen sharing stopped');
                    this.stopHosting();
                };
            });

            this.localVideo.srcObject = this.localStream;
            this.streamStatusElement.textContent = 'Active';
            
            // Создаем сессию на сервере
            this.socket.emit('create-session', {});
            this.updateStatus('Screen sharing active', 'connected');

        } catch (error) {
            console.error('❌ Error starting hosting:', error);
            this.updateStatus('Failed to start sharing', 'error');
            alert('Error: ' + error.message);
        }
    }

    async createPeerConnection(clientId) {
        try {
            console.log('🔗 Creating peer connection for:', clientId);
            
            const peerConnection = new RTCPeerConnection(this.configuration);

            // Добавляем треки
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });

            // ICE кандидаты
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        target: clientId,
                        candidate: event.candidate
                    });
                }
            };

            // Отслеживание состояния
            peerConnection.onconnectionstatechange = () => {
                console.log('🔗 Connection state:', peerConnection.connectionState);
                if (peerConnection.connectionState === 'connected') {
                    this.updateStatus('Streaming to client!', 'connected');
                } else if (peerConnection.connectionState === 'failed') {
                    this.updateStatus('Connection failed', 'error');
                }
            };

            // Создаем и отправляем offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            this.socket.emit('webrtc-offer', {
                target: clientId,
                offer: offer
            });

            this.peerConnections.set(clientId, peerConnection);
            console.log('✅ Peer connection created and offer sent');

        } catch (error) {
            console.error('❌ Error creating peer connection:', error);
            this.updateStatus('Connection error', 'error');
        }
    }

    async handleAnswer(clientId, answer) {
        try {
            const peerConnection = this.peerConnections.get(clientId);
            if (peerConnection) {
                await peerConnection.setRemoteDescription(answer);
                console.log('✅ Answer processed for client:', clientId);
            }
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    }

    handleIceCandidate(clientId, candidate) {
        try {
            const peerConnection = this.peerConnections.get(clientId);
            if (peerConnection && candidate) {
                peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
        }
    }

    updateStatus(text, status) {
        this.statusText.textContent = text;
        this.statusDot.className = 'status-dot ' + status;
    }

    updateConnectedClients(count) {
        this.connectedClientsElement.textContent = `${count}/5`;
    }

    copySessionId() {
        if (this.sessionId) {
            navigator.clipboard.writeText(this.sessionId);
            alert('Session ID copied!');
        }
    }

    stopHosting() {
        console.log('🛑 Stopping hosting...');
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();

        window.location.href = '/';
    }
}

// Автозапуск при загрузке страницы
document.addEventListener('DOMContent
