class ClientController {
    constructor() {
        this.socket = io();
        this.peerConnection = null;
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
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
            this.updateStatus('Connecting to host...');
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
            if (this.peerConnection && candidate) {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
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

        this.socket.emit('join-session', sessionId);
        
        // Таймаут
        setTimeout(() => {
            if (this.connectBtn.disabled) {
                this.showError('Connection timeout');
                this.connectBtn.disabled = false;
                this.connectBtn.textContent = 'Connect';
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
            console.log('Received offer from host');
            
            this.peerConnection = new RTCPeerConnection(this.configuration);

            // Получаем видео поток
            this.peerConnection.ontrack = (event) => {
                console.log('Received video stream');
                if (event.streams && event.streams[0]) {
                    this.remoteVideo.srcObject = event.streams[0];
                    this.loadingMessage.style.display = 'none';
                    this.updateStatus('Connected!');
                    
                    this.remoteVideo.play().catch(err => {
                        console.log('Video play error:', err);
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

            // Устанавливаем offer и создаем answer
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('webrtc-answer', {
                target: 'host',
                answer: answer
            });

            console.log('Answer sent to host');

        } catch (error) {
            console.error('Error handling offer:', error);
            this.showError('Connection failed: ' + error.message);
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

// Запуск
document.addEventListener('DOMContentLoaded', () => {
    new ClientController();
});
