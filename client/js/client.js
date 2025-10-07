class ClientController {
    constructor() {
        this.socket = io();
        this.peerConnection = null;
        
        // УЛУЧШЕННАЯ конфигурация WebRTC
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                },
                {
                    urls: 'turn:openrelay.metered.ca:443',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ],
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };

        this.initializeElements();
        this.initializeSocketListeners();
    }

    initializeElements() {
        this.connectScreen = document.getElementById('connectScreen');
        this.gameScreen = document.getElementById('gameScreen');
        this.sessionIdInput = document.getElementById('sessionIdInput');
        this.connectBtn = document.getElementById('connectBtn');
        this.errorMessage = document.getElementById('errorMessage');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.connectionStatusElement = document.getElementById('connectionStatus');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.loadingMessage = document.getElementById('loadingMessage');

        this.connectBtn.addEventListener('click', () => this.connectToSession());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        
        this.sessionIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.connectToSession();
        });
    }

    initializeSocketListeners() {
        this.socket.on('connect', () => {
            this.updateStatus('Connected to server');
        });

        this.socket.on('session-joined', () => {
            this.showGameScreen();
            this.updateStatus('Waiting for video stream...');
        });

        this.socket.on('session-error', (data) => {
            this.showError(data.message);
        });

        this.socket.on('webrtc-offer', async (offer) => {
            await this.handleOffer(offer);
        });

        this.socket.on('webrtc-answer', async (answer) => {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(answer);
            }
        });

        this.socket.on('ice-candidate', (candidate) => {
            this.handleIceCandidate(candidate);
        });
    }

    connectToSession() {
        const sessionId = this.sessionIdInput.value.trim().toUpperCase();
        
        if (!sessionId) {
            this.showError('Please enter session ID');
            return;
        }

        this.hideError();
        this.connectBtn.disabled = true;
        this.connectBtn.textContent = 'Connecting...';
        this.updateStatus('Connecting to session...');

        this.socket.emit('join-session', sessionId);
        
        setTimeout(() => {
            if (this.connectBtn.disabled) {
                this.showError('Connection timeout');
            }
        }, 10000);
    }

    showGameScreen() {
        this.connectScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
    }

    showConnectScreen() {
        this.gameScreen.classList.add('hidden');
        this.connectScreen.classList.remove('hidden');
        this.connectBtn.disabled = false;
        this.connectBtn.textContent = 'Connect';
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
    }

    hideError() {
        this.errorMessage.style.display = 'none';
    }

    updateStatus(status) {
        if (this.connectionStatusElement) {
            this.connectionStatusElement.textContent = status;
        }
    }

    async handleOffer(offer) {
        try {
            console.log('📨 Received WebRTC offer');
            
            this.peerConnection = new RTCPeerConnection(this.configuration);

            // ВАЖНО: Обработчик входящего видеопотока
            this.peerConnection.ontrack = (event) => {
                console.log('🎬 Received track event:', event);
                
                if (event.streams && event.streams[0]) {
                    const stream = event.streams[0];
                    console.log('📹 Stream received with tracks:', stream.getTracks().length);
                    
                    this.remoteVideo.srcObject = stream;
                    this.loadingMessage.style.display = 'none';
                    this.updateStatus('Connected! Video streaming...');
                    
                    // Автовоспроизведение с обработкой ошибок
                    this.remoteVideo.play().then(() => {
                        console.log('✅ Video playback started');
                    }).catch(error => {
                        console.log('⚠️ Video play error:', error);
                        // Показываем кнопку для ручного запуска
                        this.remoteVideo.controls = true;
                    });
                }
            };

            // ICE кандидаты
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        target: 'host',
                        candidate: event.candidate
                    });
                }
            };

            // Отслеживание состояния
            this.peerConnection.onconnectionstatechange = () => {
                console.log('🔗 WebRTC state:', this.peerConnection.connectionState);
                switch(this.peerConnection.connectionState) {
                    case 'connected':
                        this.updateStatus('Video connected!');
                        break;
                    case 'disconnected':
                    case 'failed':
                        this.updateStatus('Connection lost');
                        this.showError('Video connection lost');
                        break;
                }
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('❄️ ICE state:', this.peerConnection.iceConnectionState);
            };

            // Устанавливаем offer и создаем answer
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('webrtc-answer', {
                target: 'host',
                answer: answer
            });

            console.log('✅ WebRTC negotiation completed');

        } catch (error) {
            console.error('❌ WebRTC error:', error);
            this.showError('Connection failed: ' + error.message);
        }
    }

    handleIceCandidate(candidate) {
        try {
            if (this.peerConnection && candidate) {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('❌ ICE candidate error:', error);
        }
    }

    disconnect() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        if (this.remoteVideo.srcObject) {
            this.remoteVideo.srcObject = null;
        }
        this.showConnectScreen();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ClientController();
});
