class HostController {
    constructor() {
        this.socket = io();
        this.sessionId = null;
        this.localStream = null;
        this.peerConnection = null;
        
        // ПРОСТАЯ конфигурация WebRTC
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };

        this.initializeElements();
        this.initializeSocketListeners();
        this.startHosting();
    }

    initializeElements() {
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = this.statusIndicator.querySelector('.status-text');
        this.sessionIdElement = document.getElementById('sessionId');
        this.connectedClientsElement = document.getElementById('connectedClients');
        this.localVideo = document.getElementById('localVideo');
        this.copyBtn = document.getElementById('copyBtn');
        this.stopHostingBtn = document.getElementById('stopHostingBtn');
        
        this.stopHostingBtn.addEventListener('click', () => this.stopHosting());
        this.copyBtn.addEventListener('click', () => this.copySessionId());
    }

    initializeSocketListeners() {
        this.socket.on('connect', () => {
            this.updateStatus('Connected to server', 'connected');
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

    async startHosting() {
        try {
            this.updateStatus('Requesting screen access...', 'waiting');
            
            // Захват экрана
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            this.localVideo.srcObject = this.localStream;
            
            // Создание сессии
            this.socket.emit('create-session', {});
            this.updateStatus('Screen sharing started', 'connected');

        } catch (error) {
            console.error('Error:', error);
            this.updateStatus('Failed to start sharing', 'error');
            alert('Failed to start screen sharing: ' + error.message);
        }
    }

    async createPeerConnection(clientId) {
        try {
            console.log('Creating peer connection for:', clientId);
            
            this.peerConnection = new RTCPeerConnection(this.configuration);

            // Добавляем треки
            this.localStream.getTracks().forEach(track => {
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

            // Создаем offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.socket.emit('webrtc-offer', {
                target: clientId,
                offer: offer
            });

            console.log('Offer sent to client');

        } catch (error) {
            console.error('Peer connection error:', error);
            this.updateStatus('Connection error', 'error');
        }
    }

    updateStatus(text, status) {
        this.statusText.textContent = text;
        const dot = this.statusIndicator.querySelector('.status-dot');
        dot.className = 'status-dot ' + status;
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

// Запуск
document.addEventListener('DOMContentLoaded', () => {
    new HostController();
});
