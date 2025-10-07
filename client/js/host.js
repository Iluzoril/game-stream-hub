class HostController {
    constructor() {
        this.socket = io();
        this.sessionId = null;
        this.localStream = null;
        this.peerConnection = null;
        
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
            
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });

            console.log('🎥 Screen capture started');

            this.localVideo.srcObject = this.localStream;
            
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

            // Добавляем треки
            this.localStream.getTracks().forEach(track => {
                console.log('➕ Adding track:', track.kind);
                this.peerConnection.addTrack(track, this.localStream);
            });

            // ICE кандидаты
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
                if (this.peerConnection.connectionState === 'connected') {
                    this.updateStatus('Streaming to client!', 'connected');
                }
            };

            // Создаем offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            console.log('📨 Sending offer to client');
            
            this.socket.emit('webrtc-offer', {
                target: clientId,
                offer: offer
            });

        } catch (error) {
            console.error('❌ Peer connection error:', error);
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.peerConnection && answer) {
                console.log('✅ Processing answer from client');
                await this.peerConnection.setRemoteDescription(answer);
                console.log('✅ Remote description set successfully');
            }
        } catch (error) {
            console.error('❌ Error handling answer:', error);
        }
    }

    handleIceCandidate(candidate) {
        try {
            if (this.peerConnection && candidate) {
                console.log('✅ Adding ICE candidate from client');
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
