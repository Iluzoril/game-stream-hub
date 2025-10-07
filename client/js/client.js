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

        this.socket.on('host-disconnected', () => {
            console.log('❌ Host disconnected');
            this.showError('Host disconnected');
            this.disconnect();
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
        // Настройка видео элемента
        this.remoteVideo.playsInline = true;
        this.remoteVideo.muted = true;
        this.remoteVideo.setAttribute('playsinline', 'true');
        
        this.remoteVideo.addEventListener('loadeddata', () => {
            console.log('✅ Video data loaded');
        });
        
        this.remoteVideo.addEventListener('canplay', () => {
            console.log('▶️ Video can play');
        });
        
        this.remoteVideo.addEventListener('error', (e) => {
            console.error('❌ Video error:', e);
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
        
        setTimeout(() => {
            if (!this.isConnected && this.connectBtn.disabled) {
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

    updateConnectionStatus(status) {
        if (this.connectionStatusElement) {
            this.connectionStatusElement.textContent = status;
        }
    }

    async handleOffer(offer) {
        try {
            console.log('🔗 Handling WebRTC offer from host');
            console.log('📝 Offer type:', offer.type);
            console.log('📝 Offer SDP:', offer.sdp.substring(0, 200) + '...');
            
            if (!offer) {
                throw new Error('No offer received');
            }

            this.peerConnection = new RTCPeerConnection(this.configuration);

            // ВАЖНО: Обработчик входящего видеопотока
            this.peerConnection.ontrack = (event) => {
                console.log('🎬 Received track event:', event);
                console.log('📹 Streams count:', event.streams.length);
                
                if (event.streams && event.streams[0]) {
                    const stream = event.streams[0];
                    console.log('📹 Stream received with tracks:', stream.getTracks().length);
                    stream.getTracks().forEach(track => {
                        console.log('🎯 Track:', track.kind, 'id:', track.id, 'readyState:', track.readyState);
                    });
                    
                    this.remoteVideo.srcObject = stream;
                    this.isConnected = true;
                    this.updateConnectionStatus('Video connected!');
                    
                    // Проверяем состояние видео элемента
                    console.log('🎥 Video element srcObject:', this.remoteVideo.srcObject);
                    console.log('🎥 Video element readyState:', this.remoteVideo.readyState);
                    
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
                } else {
                    console.log('✅ All ICE candidates gathered');
                }
            };

            // Отслеживание состояния
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                console.log('🔗 WebRTC connection state:', state);
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
            console.log('✅ Answer created, type:', answer.type);
            
            await this.peerConnection.setLocalDescription(answer);
            console.log('✅ Local description set');

            console.log('📨 Sending answer to host');
            this.socket.emit('webrtc-answer', {
                target: 'host',
                answer: answer
            });

            this.updateConnectionStatus('WebRTC connected!');

        } catch (error) {
            console.error('❌ Error handling offer:', error);
            this.showError('Connection failed: ' + error.message);
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.peerConnection && answer) {
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

    async playVideoWithRetry() {
        try {
            console.log('🎬 Attempting to play video...');
            console.log('🎥 Video srcObject:', this.remoteVideo.srcObject);
            console.log('🎥 Video tracks:', this.remoteVideo.srcObject?.getTracks().length);
            
            await this.remoteVideo.play();
            console.log('✅ Video playback started successfully');
            this.loadingMessage.style.display = 'none';
            this.updateConnectionStatus('Streaming!');
        } catch (playError) {
            console.log('⚠️ Auto-play failed:', playError);
            console.log('🎥 Video error details:', this.remoteVideo.error);
            
            this.loadingMessage.innerHTML = 'Click to start video (autoplay blocked)';
            this.loadingMessage.style.cursor = 'pointer';
            this.loadingMessage.style.background = 'rgba(255, 152, 0, 0.8)';
            this.loadingMessage.onclick = () => {
                console.log('🎬 Manual play attempt...');
                this.remoteVideo.play().then(() => {
                    console.log('✅ Manual play successful');
                    this.loadingMessage.style.display = 'none';
                }).catch(e => {
                    console.error('❌ Manual play failed:', e);
                    this.loadingMessage.innerHTML = 'Playback failed. Check browser permissions.';
                });
            };
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

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    new ClientController();
});
