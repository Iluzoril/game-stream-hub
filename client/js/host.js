class HostController {
    constructor() {
        this.socket = io();
        this.sessionId = null;
        this.localStream = null;
        this.peerConnection = null;
        
        // Улучшенная конфигурация WebRTC
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.initializeElements();
        this.initializeSocketListeners();
        this.startHosting();
    }

    initializeElements() {
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = this.statusIndicator.querySelector('.status-text');
        this.statusDot = this.statusIndicator.querySelector('.status-dot');
        this.sessionIdElement = document.getElementById('sessionId');
        this.connectedClientsElement = document.getElementById('connectedClients');
        this.localVideo = document.getElementById('localVideo');
        this.copyBtn = document.getElementById('copyBtn');
        this.stopHostingBtn = document.getElementById('stopHostingBtn');
        
        this.copyBtn.addEventListener('click', () => this.copySessionId());
        this.stopHostingBtn.addEventListener('click', () => this.stopHosting());
    }

    initializeSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            this.updateStatus('Connected to server', 'waiting');
        });

        this.socket.on('session-created', (data) => {
            this.sessionId = data.sessionId;
            this.sessionIdElement.textContent = this.sessionId;
            this.updateStatus('Waiting for client...', 'waiting');
            console.log('✅ Session created:', this.sessionId);
        });

        this.socket.on('client-connected', (data) => {
            console.log('✅ Client connected:', data.clientId);
            this.updateStatus('Client connected! Starting stream...', 'connected');
            this.connectedClientsElement.textContent = '1/1';
            this.createPeerConnection(data.clientId);
        });

        this.socket.on('client-disconnected', (data) => {
            console.log('❌ Client disconnected');
            this.connectedClientsElement.textContent = '0/1';
            this.updateStatus('Client disconnected', 'waiting');
        });

        this.socket.on('webrtc-answer', async (data) => {
            console.log('📨 Received answer from client');
            await this.handleAnswer(data.answer);
        });

        this.socket.on('ice-candidate', (data) => {
            console.log('❄️ Received ICE candidate from client');
            this.handleIceCandidate(data.candidate);
        });
    }

    async startHosting() {
        try {
            this.updateStatus('Requesting screen access...', 'waiting');
            
            // Захват экрана с правильными настройками
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    frameRate: { ideal: 30, max: 60 },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            console.log('🎥 Screen capture started. Tracks:', this.localStream.getTracks().length);
            this.localStream.getTracks().forEach(track => {
                console.log('📹 Track:', track.kind, 'id:', track.id, 'enabled:', track.enabled, 'readyState:', track.readyState);
            });

            // Показываем локальное видео
            this.localVideo.srcObject = this.localStream;
            
            // Обработчик остановки трансляции
            this.localStream.getTracks().forEach(track => {
                track.addEventListener('ended', () => {
                    console.log('🛑 Screen sharing stopped');
                    this.stopHosting();
                });
            });

            // Создаем сессию на сервере
            this.socket.emit('create-session', {});
            this.updateStatus('Screen sharing active', 'connected');

        } catch (error) {
            console.error('❌ Screen capture error:', error);
            this.updateStatus('Failed to start sharing', 'error');
            alert('Error starting screen sharing: ' + error.message);
        }
    }

    async createPeerConnection(clientId) {
        try {
            console.log('🔗 Creating peer connection for client:', clientId);
            
            this.peerConnection = new RTCPeerConnection(this.configuration);

            // ВАЖНО: Добавляем все треки в соединение
            this.localStream.getTracks().forEach(track => {
                console.log('➕ Adding track:', track.kind, 'id:', track.id, 'enabled:', track.enabled, 'readyState:', track.readyState);
                const sender = this.peerConnection.addTrack(track, this.localStream);
                console.log('🎯 Sender created:', sender);
            });

            // Проверяем senders
            console.log('📡 Current senders:', this.peerConnection.getSenders().length);
            
            // Обработчик ICE кандидатов
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('❄️ Sending ICE candidate to client:', event.candidate.candidate.substring(0, 50) + '...');
                    this.socket.emit('ice-candidate', {
                        target: clientId,
                        candidate: event.candidate
                    });
                } else {
                    console.log('✅ All ICE candidates gathered');
                }
            };

            // Отслеживание состояния соединения
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                console.log('🔗 Connection state:', state);
                
                switch(state) {
                    case 'connected':
                        this.updateStatus('Streaming to client!', 'connected');
                        // Проверяем состояние треков после подключения
                        setTimeout(() => {
                            console.log('🎯 Senders after connection:', this.peerConnection.getSenders().length);
                            this.peerConnection.getSenders().forEach((sender, index) => {
                                console.log(`Sender ${index}:`, sender.track ? `track: ${sender.track.kind} (${sender.track.readyState})` : 'no track');
                            });
                        }, 1000);
                        break;
                    case 'disconnected':
                        this.updateStatus('Connection lost', 'waiting');
                        break;
                    case 'failed':
                        this.updateStatus('Connection failed', 'error');
                        break;
                }
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('❄️ ICE connection state:', this.peerConnection.iceConnectionState);
            };

            // Создаем offer
            console.log('🎯 Creating offer...');
            const offer = await this.peerConnection.createOffer();
            console.log('✅ Offer created, type:', offer.type);
            console.log('📝 Offer SDP:', offer.sdp.substring(0, 200) + '...');
            
            await this.peerConnection.setLocalDescription(offer);
            
            console.log('📨 Sending offer to client');
            
            this.socket.emit('webrtc-offer', {
                target: clientId,
                offer: offer
            });

            console.log('✅ Peer connection established');

        } catch (error) {
            console.error('❌ Error creating peer connection:', error);
            this.updateStatus('Connection error', 'error');
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.peerConnection && answer) {
                console.log('✅ Processing answer from client');
                await this.peerConnection.setRemoteDescription(answer);
                console.log('✅ Remote description set successfully');
            }
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    }

    handleIceCandidate(candidate) {
        try {
            if (this.peerConnection && candidate) {
                console.log('✅ Adding ICE candidate from client');
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
        }
    }

    updateStatus(text, status) {
        this.statusText.textContent = text;
        this.statusDot.className = 'status-dot ' + status;
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

        if (this.peerConnection) {
            this.peerConnection.close();
        }

        window.location.href = '/';
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    new HostController();
});
