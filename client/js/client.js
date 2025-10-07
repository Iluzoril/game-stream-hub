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

    initializeVideoHandling() {
        // Настройка видео элемента для лучшей совместимости
        this.remoteVideo.playsInline = true;
        this.remoteVideo.muted = true; // Важно для автовоспроизведения
        this.remoteVideo.setAttribute('playsinline', 'true');
        
        // Обработчики событий видео
        this.remoteVideo.addEventListener('loadeddata', () => {
            console.log('✅ Video data loaded');
        });
        
        this.remoteVideo.addEventListener('canplay', () => {
            console.log('▶️ Video can play');
            this.loadingMessage.style.display = 'none';
        });
        
        this.remoteVideo.addEventListener('error', (e) => {
            console.error('❌ Video error:', e);
            this.showError('Video playback error');
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
            console.log('📨 Handling WebRTC offer');
            
            this.peerConnection = new RTCPeerConnection(this.configuration);

            // ВАЖНО: Правильная обработка видеопотока
            this.peerConnection.ontrack = (event) => {
                console.log('🎬 Track event received:', event);
                
                if (event.streams && event.streams[0]) {
                    const stream = event.streams[0];
                    console.log('📹 Stream received with', stream.getTracks().length, 'tracks');
                    
                    // Устанавливаем поток в видео элемент
                    this.remoteVideo.srcObject = stream;
                    this.updateStatus('Video connected! Starting playback...');
                    
                    // Пытаемся воспроизвести видео
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

            console.log('✅ WebRTC negotiation completed');

        } catch (error) {
            console.error('❌ WebRTC error:', error);
            this.showError('Connection failed');
        }
    }

    async playVideoWithRetry() {
        try {
            // Ждем немного перед воспроизведением
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Пытаемся воспроизвести
            await this.remoteVideo.play();
            console.log('✅ Video playback started successfully');
            this.loadingMessage.style.display = 'none';
            this.updateStatus('Streaming!');
            
        } catch (playError) {
            console.log('⚠️ Auto-play failed, trying with user gesture...');
            
            // Показываем сообщение для пользователя
            this.loadingMessage.innerHTML = 'Click to start video playback';
            this.loadingMessage.style.cursor = 'pointer';
            this.loadingMessage.onclick = () => {
                this.remoteVideo.play().then(() => {
                    this.loadingMessage.style.display = 'none';
                }).catch(e => {
                    console.error('❌ Manual play also failed:', e);
                });
            };
        }
    }

    handleIceCandidate(candidate) {
        if (this.peerConnection && candidate) {
            this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    disconnect() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        this.showConnectScreen();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ClientController();
});
