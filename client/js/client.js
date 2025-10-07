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
        this.latencyInterval = null;

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeSocketListeners();
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
            e.target.value = e.target.value.toUpperCase();
            this.hideError();
        });
    }

    initializeSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            this.updateConnectionStatus('Connected to server');
        });

        this.socket.on('session-joined', (data) => {
            console.log('✅ Joined session:', data.sessionId);
            this.updateConnectionStatus('Connecting to host...');
            this.showGameScreen();
        });

        this.socket.on('session-error', (data) => {
            console.error('❌ Session error:', data.message);
            this.showError(data.message);
            this.updateConnectionStatus('Connection failed');
        });

        this.socket.on('session-ended', (data) => {
            alert('Session ended: ' + data.reason);
            this.disconnect();
        });

        this.socket.on('webrtc-offer', async (data) => {
            console.log('📨 Received offer from host');
            await this.handleOffer(data.offer);
        });

        this.socket.on('webrtc-answer', async (data) => {
            console.log('📨 Received answer from host');
            await this.handleAnswer(data.answer);
        });

        this.socket.on('ice-candidate', (data) => {
            console.log('❄️ Received ICE candidate from host');
            this.handleIceCandidate(data.candidate);
        });

        // Измерение задержки
        this.socket.on('ping', (timestamp) => {
            this.socket.emit('pong', timestamp);
        });
    }

    connectToSession() {
        const sessionId = this.sessionIdInput.value.trim().toUpperCase();
        
        if (!sessionId) {
            this.showError('Please enter session ID');
            return;
        }

        this.hideError();
        this.updateConnectionStatus('Connecting to session...');
        this.connectBtn.disabled = true;
        this.connectBtn.textContent = 'Connecting...';

        console.log('🔗 Connecting to session:', sessionId);
        this.socket.emit('join-session', sessionId);
        
        // Таймаут
        setTimeout(() => {
            if (!this.isConnected && this.connectBtn.disabled) {
                this.showError('Connection timeout');
                this.connectBtn.disabled = false;
                this.connectBtn.textContent = 'Connect';
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
        this.connectBtn.textContent = 'Connect';
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
        }
    }

    startLatencyMeasurement() {
        this.latencyInterval = setInterval(() => {
            const startTime = Date.now();
            this.socket.emit('ping', startTime);
        }, 2000);

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

    async handleOffer(offer) {
        try {
            console.log('🔗 Handling WebRTC offer');
            
            this.peerConnection = new RTCPeerConnection(this.configuration);

            // Получаем видео поток
            this.peerConnection.ontrack = (event) => {
                console.log('🎬 Received video stream');
                if (event.streams && event.streams[0]) {
                    this.remoteVideo.srcObject = event.streams[0];
                    this.loadingMessage.style.display = 'none';
                    this.isConnected = true;
                    this.updateConnectionStatus('Connected!');
                    
                    this.remoteVideo.play().catch(err => {
                        console.log('⚠️ Video play error:', err);
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

            // Отслеживание состояния соединения
            this.peerConnection.onconnectionstatechange = () => {
                console.log('🔗 WebRTC state:', this.peerConnection.connectionState);
            };

            // Устанавливаем offer и создаем answer
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('webrtc-answer', {
                target: 'host',
                answer: answer
            });

            console.log('✅ WebRTC connection established');

        } catch (error) {
            console.error('❌ Error handling offer:', error);
            this.showError('Connection failed: ' + error.message);
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(answer);
            }
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    }

    handleIceCandidate(candidate) {
        try {
            if (this.peerConnection && candidate) {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
        }
    }

    disconnect() {
        console.log('🔌 Disconnecting...');
        this.isConnected = false;
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.remoteVideo.srcObject) {
            this.remoteVideo.srcObject = null;
        }

        this.stopLatencyMeasurement();
        this.showConnectScreen();
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    new ClientController();
});
