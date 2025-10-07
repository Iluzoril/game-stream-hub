class ClientController {
    constructor() {
        this.socket = io();
        this.peerConnection = null;
        
        // УЛУЧШЕННАЯ конфигурация WebRTC
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ],
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
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

        this.socket.on('session-joined', () => {
            console.log('✅ Joined session successfully');
            this.updateConnectionStatus('Connecting to host...');
            this.showGameScreen();
        });

        this.socket.on('session-error', (data) => {
            console.error('❌ Session error:', data.message);
            this.showError(data.message);
            this.updateConnectionStatus('Connection failed');
        });

        this.socket.on('webrtc-offer', async (data) => {
            console.log('📨 Received WebRTC offer from host');
            await this.handleOffer(data.offer);
        });

        this.socket.on('webrtc-answer', async (data) => {
            console.log('📨 Received WebRTC answer from host');
            await this.handleAnswer(data.answer);
        });

        this.socket.on('ice-candidate', (data) => {
            console.log('❄️ Received ICE candidate from host');
            this.handleIceCandidate(data.candidate);
        });
    }

    initializeVideoHandling() {
        // Настройка видео элемента для WebRTC
        this.remoteVideo.playsInline = true;
        this.remoteVideo.muted = true; // Важно для автовоспроизведения
        this.remoteVideo.setAttribute('playsinline', 'true');
        this.remoteVideo.setAttribute('autoplay', 'true');
        
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

        if (sessionId.length < 4) {
            this.showError('Session ID must be at least 4 characters');
            return;
        }

        this.hideError();
        this.updateConnectionStatus('Connecting to session...');
        this.connectBtn.disabled = true;
        this.connectBtn.textContent = 'Connecting...';

        console.log('🔗 Connecting to session:', sessionId);
        this.socket.emit('join-session', sessionId);
        
        // Таймаут подключения
        setTimeout(() => {
            if (!this.isConnected && this.connectBtn.disabled) {
                this.showError('Connection timeout. Check session ID.');
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

    updateConnectionStatus(status) {
        if (this.connectionStatusElement) {
            this.connectionStatusElement.textContent = status;
        }
        console.log('🔧 Status:', status);
    }

    async handleOffer(offer) {
        try {
            console.log('🔗 Handling WebRTC offer from host');
            
            if (!offer || typeof offer !== 'object') {
                throw new Error('Invalid offer received from host');
            }

            this.peerConnection = new RTCPeerConnection(this.configuration);

            // ВАЖНО: Обработчик входящего видеопотока
            this.peerConnection.ontrack = (event) => {
                console.log('🎬 Received track event:', event);
                
                if (event.streams && event.streams[0]) {
                    const stream = event.streams[0];
                    console.log('📹 Stream received with tracks:', stream.getTracks().length);
                    
                    // Устанавливаем поток в видео элемент
                    this.remoteVideo.srcObject = stream;
                    this.isConnected = true;
                    this.updateConnectionStatus('Video connected! Starting playback...');
                    
                    // Пытаемся воспроизвести видео
                    this.playVideoWithRetry();
                }
            };

            // ICE кандидаты
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('❄️ Sending ICE candidate to host');
                    this.socket.emit('ice-candidate', {
                        target: 'host',
                        candidate: event.candidate
                    });
                }
            };

            // Отслеживание состояния соединения
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                console.log('🔗 WebRTC connection state:', state);
                
                switch (state) {
                    case 'connected':
                        this.updateConnectionStatus('WebRTC connected!');
                        break;
                    case 'disconnected':
                        this.updateConnectionStatus('Connection lost');
                        break;
                    case 'failed':
                        this.updateConnectionStatus('Connection failed');
                        this.showError('WebRTC connection failed');
                        break;
                }
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('❄️ ICE connection state:', this.peerConnection.iceConnectionState);
            };

            // Устанавливаем offer и создаем answer
            console.log('✅ Setting remote description');
            await this.peerConnection.setRemoteDescription(offer);
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            console.log('📨 Sending answer to host');
            this.socket.emit('webrtc-answer', {
                target: 'host',
                answer: answer
            });

            console.log('✅ WebRTC negotiation completed');

        } catch (error) {
            console.error('❌ Error handling offer:', error);
            this.showError('WebRTC connection failed: ' + error.message);
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.peerConnection && answer) {
                await this.peerConnection.setRemoteDescription(answer);
                console.log('✅ Answer processed successfully');
            }
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    }

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

    async playVideoWithRetry() {
        try {
            // Ждем немного перед воспроизведением
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Пытаемся воспроизвести
            await this.remoteVideo.play();
            console.log('✅ Video playback started successfully');
            this.loadingMessage.style.display = 'none';
            this.updateConnectionStatus('Streaming!');
            
        } catch (playError) {
            console.log('⚠️ Auto-play failed, showing manual play button');
            
            // Показываем сообщение для пользователя
            this.loadingMessage.innerHTML = 'Click here to start video playback';
            this.loadingMessage.style.cursor = 'pointer';
            this.loadingMessage.style.background = 'rgba(76, 175, 80, 0.8)';
            this.loadingMessage.onclick = () => {
                this.remoteVideo.play().then(() => {
                    this.loadingMessage.style.display = 'none';
                }).catch(e => {
                    console.error('❌ Manual play also failed:', e);
                    this.loadingMessage.innerHTML = 'Playback failed. Try refreshing.';
                });
            };
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

        this.showConnectScreen();
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    new ClientController();
});
