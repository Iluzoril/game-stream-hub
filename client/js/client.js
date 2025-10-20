class ClientController {
    constructor() {
        this.socket = io();
        this.peerConnection = null;
        
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
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
            console.log('✅ Connected to server');
            this.updateConnectionStatus('Connected to server');
        });

        this.socket.on('session-joined', (data) => {
            console.log('✅ Joined session successfully:', data.sessionId);
            this.updateConnectionStatus('Connecting to host...');
            this.showGameScreen();
        });

        this.socket.on('session-error', (data) => {
            console.error('❌ Session error:', data.message);
            this.showError(data.message);
            this.updateConnectionStatus('Connection failed');
            this.connectBtn.disabled = false;
            this.connectBtn.textContent = 'Connect';
        });

        this.socket.on('host-disconnected', () => {
            console.log('❌ Host disconnected');
            this.showError('Host disconnected');
            this.disconnect();
        });

        this.socket.on('webrtc-offer', async (data) => {
            console.log('📨 Received WebRTC offer from host');
            await this.handleOffer(data.offer);
        });

        this.socket.on('ice-candidate', (data) => {
            console.log('❄️ Received ICE candidate from host');
            this.handleIceCandidate(data.candidate);
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            this.updateConnectionStatus('Disconnected');
        });
    }

    initializeVideoHandling() {
        // Настройка видео элемента
        this.remoteVideo.playsInline = true;
        this.remoteVideo.setAttribute('playsinline', 'true');
        this.remoteVideo.setAttribute('webkit-playsinline', 'true');
        
        this.remoteVideo.addEventListener('loadeddata', () => {
            console.log('✅ Video data loaded');
            this.loadingMessage.style.display = 'none';
        });
        
        this.remoteVideo.addEventListener('canplay', () => {
            console.log('▶️ Video can play');
            this.updateConnectionStatus('Streaming!');
        });
        
        this.remoteVideo.addEventListener('error', (e) => {
            console.error('❌ Video error:', e);
            console.error('Video error details:', this.remoteVideo.error);
        });

        this.remoteVideo.addEventListener('waiting', () => {
            console.log('⏳ Video waiting for data');
            this.loadingMessage.style.display = 'block';
        });

        this.remoteVideo.addEventListener('playing', () => {
            console.log('🎬 Video playing');
            this.loadingMessage.style.display = 'none';
        });
    }

    connectToSession() {
        const sessionId = this.sessionIdInput.value.trim().toUpperCase();
        
        if (!sessionId) {
            this.showError('Please enter session ID');
            return;
        }

        if (sessionId.length !== 4) {
            this.showError('Session ID must be 4 characters');
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
                this.showError('Connection timeout - check session ID');
                this.connectBtn.disabled = false;
                this.connectBtn.textContent = 'Connect';
            }
        }, 10000);
    }

    showGameScreen() {
        this.connectScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.loadingMessage.style.display = 'block';
    }

    showConnectScreen() {
        this.gameScreen.classList.add('hidden');
        this.connectScreen.classList.remove('hidden');
        this.connectBtn.disabled = false;
        this.connectBtn.textContent = 'Connect';
        this.remoteVideo.srcObject = null;
        this.isConnected = false;
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

    async handleOffer(offer) {
        try {
            console.log('🔗 Handling WebRTC offer from host');
            
            if (!offer) {
                throw new Error('No offer received');
            }

            // Закрываем предыдущее соединение если есть
            if (this.peerConnection) {
                this.peerConnection.close();
            }

            this.peerConnection = new RTCPeerConnection(this.configuration);

            // ВАЖНО: Правильная обработка входящего видеопотока
            this.peerConnection.ontrack = (event) => {
                console.log('🎬 Received track event:', event);
                console.log('📹 Streams count:', event.streams.length);
                console.log('🎯 Track kind:', event.track.kind);
                
                if (event.streams && event.streams[0]) {
                    const stream = event.streams[0];
                    console.log('📹 Stream received with tracks:', stream.getTracks().length);
                    
                    // Отображаем все треки
                    stream.getTracks().forEach(track => {
                        console.log('🎯 Track:', track.kind, 'id:', track.id, 'readyState:', track.readyState);
                    });
                    
                    this.remoteVideo.srcObject = stream;
                    this.isConnected = true;
                    this.updateConnectionStatus('WebRTC connected!');
                    
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
                this.updateConnectionStatus(`WebRTC: ${state}`);
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('❄️ ICE connection state:', this.peerConnection.iceConnectionState);
            };

            this.peerConnection.onsignalingstatechange = () => {
                console.log('📡 Signaling state:', this.peerConnection.signalingState);
            };

            // Устанавливаем offer
            console.log('🎯 Setting remote description...');
            await this.peerConnection.setRemoteDescription(offer);
            console.log('✅ Remote description set');
            
            console.log('🎯 Creating answer...');
            const answer = await this.peerConnection.createAnswer();
            console.log('✅ Answer created');
            
            await this.peerConnection.setLocalDescription(answer);
            console.log('✅ Local description set');

            console.log('📨 Sending answer to host');
            this.socket.emit('webrtc-answer', {
                target: 'host',
                answer: answer
            });

        } catch (error) {
            console.error('❌ Error handling offer:', error);
            this.showError('Connection failed: ' + error.message);
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

    async playVideoWithRetry() {
        try {
            console.log('🎬 Attempting to play video...');
            console.log('🎥 Video srcObject:', this.remoteVideo.srcObject);
            console.log('🎥 Video tracks:', this.remoteVideo.srcObject?.getTracks().length);
            
            if (this.remoteVideo.srcObject) {
                await this.remoteVideo.play();
                console.log('✅ Video playback started successfully');
                this.loadingMessage.style.display = 'none';
                this.updateConnectionStatus('Streaming!');
            }
        } catch (playError) {
            console.log('⚠️ Auto-play failed:', playError);
            
            this.loadingMessage.innerHTML = 'Click to start video<br><small>Autoplay blocked by browser</small>';
            this.loadingMessage.style.cursor = 'pointer';
            this.loadingMessage.style.background = 'rgba(255, 152, 0, 0.9)';
            this.loadingMessage.onclick = () => {
                console.log('🎬 Manual play attempt...');
                this.remoteVideo.play().then(() => {
                    console.log('✅ Manual play successful');
                    this.loadingMessage.style.display = 'none';
                }).catch(e => {
                    console.error('❌ Manual play failed:', e);
                    this.loadingMessage.innerHTML = 'Playback failed<br><small>Check browser permissions</small>';
                });
            };
        }
    }

    disconnect() {
        console.log('🛑 Disconnecting...');
        this.isConnected = false;
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        this.showConnectScreen();
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    new ClientController();
});
