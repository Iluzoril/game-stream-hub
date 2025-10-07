class HostController {
    constructor() {
        this.socket = io();
        this.sessionId = null;
        this.localStream = null;
        this.peerConnection = null;
        
        // УЛУЧШЕННАЯ конфигурация WebRTC
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                // Бесплатные TURN серверы для обхода NAT
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
            this.updateStatus('Connected to server', 'waiting');
        });

        this.socket.on('session-created', (data) => {
            this.sessionId = data.sessionId;
            this.sessionIdElement.textContent = this.sessionId;
            this.updateStatus('Waiting for client...', 'waiting');
        });

        this.socket.on('client-connected', (data) => {
            this.updateStatus('Client connected!', 'connected');
            this.connectedClientsElement.textContent = '1/1';
            this.createPeerConnection(data.clientId);
        });

        this.socket.on('webrtc-answer', async (answer) => {
            await this.handleAnswer(answer);
        });

        this.socket.on('ice-candidate', (candidate) => {
            this.handleIceCandidate(candidate);
        });
    }

    async startHosting() {
        try {
            this.updateStatus('Requesting screen access...', 'waiting');
            
            // ЗАХВАТ ЭКРАНА с улучшенными настройками
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor',
                    frameRate: { ideal: 30, max: 60 },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });

            console.log('🎥 Screen capture started. Tracks:', this.localStream.getTracks().length);

            // Показываем локальное видео
            this.localVideo.srcObject = this.localStream;
            
            // Обработчик остановки
            this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
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
            console.log('🔗 Creating peer connection for client:', clientId);
            
            this.peerConnection = new RTCPeerConnection(this.configuration);

            // ВАЖНО: Добавляем все треки в соединение
            this.localStream.getTracks().forEach(track => {
                console.log('➕ Adding track:', track.kind, track);
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Обработчик ICE кандидатов
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('❄️ Sending ICE candidate');
                    this.socket.emit('ice-candidate', {
                        target: clientId,
                        candidate: event.candidate
                    });
                }
            };

            // Отслеживание состояния соединения
            this.peerConnection.onconnectionstatechange = () => {
                console.log('🔗 Connection state:', this.peerConnection.connectionState);
                switch(this.peerConnection.connectionState) {
                    case 'connected':
                        this.updateStatus('Streaming!', 'connected');
                        break;
                    case 'disconnected':
                    case 'failed':
                        this.updateStatus('Connection lost', 'error');
                        break;
                }
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('❄️ ICE state:', this.peerConnection.iceConnectionState);
            };

            // Создаем и отправляем offer
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await this.peerConnection.setLocalDescription(offer);
            
            this.socket.emit('webrtc-offer', {
                target: clientId,
                offer: offer
            });

            console.log('✅ Offer created and sent');

        } catch (error) {
            console.error('❌ Peer connection error:', error);
            this.updateStatus('Connection error', 'error');
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.peerConnection) {
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
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        window.location.href = '/';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HostController();
});
