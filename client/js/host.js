class HostController {
    constructor() {
        this.socket = io();
        this.sessionId = null;
        this.localStream = null;
        this.peerConnection = null;
        
        // Простая конфигурация WebRTC
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
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
            this.updateStatus('Client connected!', 'connected');
            this.connectedClientsElement.textContent = '1/1';
            this.createPeerConnection(data.clientId);
        });

        this.socket.on('webrtc-answer', async (data) => {
            console.log('📨 Received answer from client');
            await this.handleAnswer(data.answer);
        });

        this.socket.on('ice-candidate', (data) => {
            console.log('❄️ Received ICE candidate from client');
            this.handleIceCandidate(data.candidate);
        });

        this.socket.on('session-error', (data) => {
            console.error('❌ Session error:', data.message);
        });
    }

    async startHosting() {
        try {
            this.updateStatus('Requesting screen access...', 'waiting');
            
            // Захват экрана
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    frameRate: 30
                },
                audio: false
            });

            console.log('🎥 Screen capture started');

            // Показываем локальное видео
            this.localVideo.srcObject = this.localStream;
            
            // Обработчик остановки трансляции
            this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
                console.log('🛑 Screen sharing stopped');
                this.stopHosting();
            });

            // Создаем сессию
            this.socket.emit('create-session', {});
            this.updateStatus('Screen sharing active', 'connected');

        } catch (error) {
            console.error('❌ Screen capture error:', error);
            this.updateStatus('Failed to start sharing', 'error');
            alert('Error: ' + error.message);
        }
    }

    async createPeerConnection(clientId) {
        try {
            console.log('🔗 Creating peer connection for:', clientId);
            
            this.peerConnection = new RTCPeerConnection(this.configuration);

            // Добавляем треки
            this.localStream.getTracks().forEach(track => {
                console.log('➕ Adding track:', track.kind);
                this.peerConnection.addTrack(track, this.localStream);
            });

            // ICE кандидаты
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        target: clientId,
                        candidate: event.candidate
                    });
                }
            };

            // Отслеживание состояния
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                console.log('🔗 Connection state:', state);
                
                if (state === 'connected') {
                    this.updateStatus('Streaming!', 'connected');
                } else if (state === 'failed') {
                    this.updateStatus('Connection failed', 'error');
                }
            };

            // Создаем offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.socket.emit('webrtc-offer', {
                target: clientId,
                offer: offer
            });

            console.log('✅ Offer sent to client');

        } catch (error) {
            console.error('❌ Peer connection error:', error);
            this.updateStatus('Connection error', 'error');
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.peerConnection && answer) {
                await this.peerConnection.setRemoteDescription(answer);
                console.log('✅ Answer processed');
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
