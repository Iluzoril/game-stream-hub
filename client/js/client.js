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

        this.isConnected = false;
        this.initializeElements();
        this.initializeSocketListeners();
        this.initializeVideoHandling();
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
            this.updateStatus('Connecting to host...');
        });

        this.socket.on('session-error', (data) => {
            this.showError(data.message);
        });

        // ✅ ПРАВИЛЬНО: получаем объект с offer
        this.socket.on('webrtc-offer', async (data) => {
            console.log('📨 Received WebRTC offer from host');
            await this.handleOffer(data.offer);
        });

        this.socket.on('webrtc-answer', async (data) => {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(data.answer);
            }
        });

        // ✅ ПРАВИЛЬНО: получаем объект с candidate
        this.socket.on('ice-candidate', (data) => {
            console.log('❄️ Received ICE candidate from host');
            this.handleIceCandidate(data.candidate);
        });
    }

    initializeVideoHandling() {
        this.remoteVideo.playsInline = true;
        this.remoteVideo.muted = true;
        this.remoteVideo.setAttribute('playsinline', 'true');
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

        this.socket.emit('join-session', sessionId);
        
        setTimeout(() => {
            if (this.connectBtn.disabled && !this.isConnected) {
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
        this.remoteVideo.srcObject = null;
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
        this.connectBtn.disabled = false;
        this.connectBtn.textContent = 'Connect';
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
            console.log('🔗 Handling WebRTC offer:', offer);
            
            if (!offer || typeof offer !== 'object') {
                throw new Error('Invalid offer format');
            }

            this.peerConnection = new RTCPeerConnection(this.configuration);

            // Обработчик видеопотока
            this.peerConnection.ontrack = (event) => {
                console.log('🎬 Track event received:', event);
                
                if (event.streams && event.streams[0]) {
                    this.remoteVideo.srcObject = event.streams[0];
                    this.isConnected = true;
                    this.updateStatus('Video connected!');
                    
                    this.playVideoWithRetry();
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

            // Устанавливаем offer
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('webrtc-answer', {
                target: 'host',
                answer: answer
            });

            this.updateStatus('WebRTC connected!');

        } catch (error) {
            console.error('❌ Error handling offer:', error);
            this.showError('Connection failed: ' + error.message);
        }
    }

    async playVideoWithRetry() {
        try {
            await this.remoteVideo.play();
            console.log('✅ Video playback started');
            this.loadingMessage.style.display = 'none';
            this.updateStatus('Streaming!');
        } catch (playError) {
            console.log('⚠️ Auto-play failed');
            this.loadingMessage.innerHTML = 'Click to start video';
            this.loadingMessage.style.cursor = 'pointer';
            this.loadingMessage.onclick = () => {
                this.remoteVideo.play().then(() => {
                    this.loadingMessage.style.display = 'none';
                });
            };
        }
    }

    // ✅ ПРАВИЛЬНАЯ обработка candidate
    handleIceCandidate(candidate) {
        try {
            if (this.peerConnection && candidate) {
                console.log('✅ Adding ICE candidate from host');
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
        }
    }

    disconnect() {
        this.isConnected = false;
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        this.showConnectScreen();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ClientController();
});
