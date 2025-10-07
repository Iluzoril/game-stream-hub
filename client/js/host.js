class HostController {
    constructor() {
        this.socket = io();
        this.sessionId = null;
        this.localStream = null;
        this.peerConnections = new Map();
        
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeSocketListeners();
        this.startHosting();
    }

    initializeElements() {
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = this.statusIndicator.querySelector('.status-text');
        this.statusDot = this.statusIndicator.querySelector('.status-dot');
        this.sessionIdElement = document.getElementById('sessionId');
        this.connectedClientsElement = document.getElementById('connectedClients');
        this.streamStatusElement = document.getElementById('streamStatus');
        this.localVideo = document.getElementById('localVideo');
        this.copyBtn = document.getElementById('copyBtn');
        this.stopHostingBtn = document.getElementById('stopHostingBtn');
    }

    initializeEventListeners() {
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
            this.updateConnectedClients(0);
        });

        this.socket.on('client-connected', (data) => {
            console.log('✅ Client connected:', data.clientId);
            this.updateConnectedClients(data.totalClients);
            this.updateStatus('Client connected! Creating connection...', 'connected');
            this.createPeerConnection(data.clientId);
        });

        this.socket.on('client-disconnected', (data) => {
            console.log('❌ Client disconnected');
            this.updateConnectedClients(data.totalClients);
            this.peerConnections.delete(data.clientId);
            
            if (data.totalClients === 0) {
                this.updateStatus('Waiting for client...', 'waiting');
            }
        });

        this.socket.on('webrtc-answer', async (data) => {
            console.log('📨 Received answer from client');
            await this.handleAnswer(data.sender, data.answer);
        });

        this.socket.on('ice-candidate', (data) => {
            console.log('❄️ Received ICE candidate from client');
            this.handleIceCandidate(data.sender, data.candidate);
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
                audio: true
            });

            console.log('🎥 Screen capture started');

            // Обработчик остановки трансляции
            this.localStream.getTracks().forEach(track => {
                track.onended = () => {
                    console.log('🛑 Screen sharing stopped by user');
                    this.stopHosting();
                };
            });

            this.localVideo.srcObject = this.localStream;
            this.streamStatusElement.textContent = 'Active';
            
            // Создание сессии
            this.socket.emit('create-session', {
                game: 'Desktop Stream'
            });

            this.updateStatus('Screen sharing active', 'connected');

        } catch (error) {
            console.error('❌ Error starting hosting:', error);
            this.updateStatus('Failed to start sharing', 'error');
            alert('Error: ' + error.message);
        }
    }

    async createPeerConnection(clientId) {
        try {
            console.log('🔗 Creating peer connection for client:', clientId);
            
            const peerConnection = new RTCPeerConnection(this.configuration);

            // Добавляем треки из локального стрима
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });

            // Обработка ICE кандидатов
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        target: clientId,
                        candidate: event.candidate
                    });
                }
            };

            peerConnection.onconnectionstatechange = () => {
                console.log('🔗 Connection state:', peerConnection.connectionState);
                if (peerConnection.connectionState === 'connected') {
                    this.updateStatus('Streaming to client!', 'connected');
                }
            };

            // Создание offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            this.socket.emit('webrtc-offer', {
                target: clientId,
                offer: offer
            });

            this.peerConnections.set(clientId, peerConnection);
            console.log('✅ Peer connection created and offer sent');

        } catch (error) {
            console.error('❌ Error creating peer connection:', error);
            this.updateStatus('Connection error', 'error');
        }
    }

    async handleAnswer(clientId, answer) {
        try {
            const peerConnection = this.peerConnections.get(clientId);
            if (peerConnection) {
                await peerConnection.setRemoteDescription(answer);
                console.log('✅ Answer processed for client:', clientId);
            }
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    }

    handleIceCandidate(clientId, candidate) {
        try {
            const peerConnection = this.peerConnections.get(clientId);
            if (peerConnection && candidate) {
                peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('❌ Error adding ICE candidate:', error);
        }
    }

    updateStatus(text, status) {
        this.statusText.textContent = text;
        this.statusDot.className = 'status-dot';
        if (status === 'connected') {
            this.statusDot.classList.add('connected');
        } else if (status === 'waiting') {
            this.statusDot.classList.add('waiting');
        } else if (status === 'error') {
            this.statusDot.classList.add('error');
        }
    }

    updateConnectedClients(count) {
        this.connectedClientsElement.textContent = `${count}/5`;
    }

    copySessionId() {
        if (this.sessionId) {
            navigator.clipboard.writeText(this.sessionId);
            alert('Session ID copied to clipboard!');
        }
    }

    stopHosting() {
        console.log('🛑 Stopping hosting...');
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();

        window.location.href = '/';
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    new HostController();
});
