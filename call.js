// Shared WebRTC + signaling logic for call-video.html and call-voice.html.
// Actual media (camera/mic) is peer-to-peer via WebRTC; the socket only relays
// offer/answer/ICE candidate JSON and call-lifecycle events.
function initCall({ callType }) {
  requireLogin();

  const match = JSON.parse(sessionStorage.getItem('speakup_match') || 'null');
  if (!match) { window.location.href = '/home.html'; return; }

  const { partnerId, sessionId, isInitiator } = match;
  const startedAt = new Date().toISOString();

  const socket = connectSocket();
  let peerConnection;
  let localStream;
  let durationTimer;
  let seconds = 0;

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // Production TURN server — required for reliable connections behind strict NATs.
      // Values come from server/.env (TURN_SERVER_URL / TURN_USERNAME / TURN_PASSWORD),
      // exposed to the client only via a short-lived, signed credential in production —
      // never hardcode real TURN credentials in frontend JS.
    ],
  };

  async function start() {
    try {
      const constraints = callType === 'video' ? { video: true, audio: true } : { audio: true };
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      setStatus(err.name === 'NotAllowedError' ? 'Camera/mic permission denied' : 'Could not access camera/mic');
      return;
    }

    if (callType === 'video') {
      const localVideo = document.getElementById('localVideo');
      if (localVideo) localVideo.srcObject = localStream;
    }

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
      const remoteVideo = document.getElementById('remoteVideo');
      if (remoteVideo) remoteVideo.srcObject = event.streams[0];
      setStatus('Connected');
      socket.emit('call_connected', { partnerId });
      startDurationTimer();
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) socket.emit('ice_candidate', { partnerId, candidate: event.candidate });
    };

    peerConnection.onconnectionstatechange = () => {
      if (['disconnected', 'failed'].includes(peerConnection.connectionState)) setStatus('Poor connection…');
    };

    if (isInitiator) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('call_offer', { partnerId, offer });
    }
  }

  socket.on('connect', start);

  socket.on('call_offer', async ({ offer }) => {
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('call_answer', { partnerId, answer });
  });

  socket.on('call_answer', async ({ answer }) => {
    await peerConnection.setRemoteDescription(answer);
  });

  socket.on('ice_candidate', async ({ candidate }) => {
    try { await peerConnection.addIceCandidate(candidate); } catch (err) { console.error(err); }
  });

  socket.on('call_ended', () => {
    cleanupAndRedirect('/match.html?type=' + callType, 'The other person left the call.');
  });

  function setStatus(text) {
    const el = document.getElementById('call-status');
    if (el) el.textContent = text;
  }

  function startDurationTimer() {
    durationTimer = setInterval(() => {
      seconds += 1;
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      const el = document.getElementById('call-duration');
      if (el) el.textContent = `${m}:${s}`;
    }, 1000);
  }

  function teardownMedia() {
    clearInterval(durationTimer);
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (peerConnection) peerConnection.close();
  }

  function cleanupAndRedirect(url, message) {
    teardownMedia();
    sessionStorage.removeItem('speakup_match');
    if (message) showToast(message);
    window.location.href = url;
  }

  // ---- Controls ----
  let muted = false;
  document.getElementById('mute-btn')?.addEventListener('click', (e) => {
    muted = !muted;
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    e.target.style.opacity = muted ? 0.5 : 1;
  });

  let cameraOff = false;
  document.getElementById('camera-btn')?.addEventListener('click', (e) => {
    cameraOff = !cameraOff;
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
    e.target.style.opacity = cameraOff ? 0.5 : 1;
  });

  document.getElementById('speaker-btn')?.addEventListener('click', (e) => {
    e.target.style.opacity = e.target.style.opacity === '0.5' ? 1 : 0.5;
  });

  document.getElementById('next-btn')?.addEventListener('click', () => {
    socket.emit('user_skipped', { partnerId, sessionId, callType, startedAt });
    cleanupAndRedirect('/match.html?type=' + callType);
  });

  document.getElementById('end-btn')?.addEventListener('click', () => {
    document.getElementById('end-confirm').style.display = 'flex';
  });
  document.getElementById('end-cancel')?.addEventListener('click', () => {
    document.getElementById('end-confirm').style.display = 'none';
  });
  document.getElementById('end-confirm-btn')?.addEventListener('click', () => {
    socket.emit('call_ended', { partnerId, sessionId, callType, startedAt });
    cleanupAndRedirect('/home.html');
  });

  document.getElementById('report-btn')?.addEventListener('click', async () => {
    const reason = prompt('Reason (harassment, nudity, spam, scam, hate, underage, threatening, other):', 'other');
    if (!reason) return;
    try {
      await api('/reports', { method: 'POST', body: { reportedUserId: partnerId, callSessionId: sessionId, reason } });
      showToast('Thank you. Your report has been submitted.');
    } catch (err) { showToast(err.message); }
  });

  document.getElementById('block-btn')?.addEventListener('click', async () => {
    if (!confirm('Block this user? You will not be matched with them again.')) return;
    try {
      await api('/blocks', { method: 'POST', body: { blockedUserId: partnerId } });
      socket.emit('call_ended', { partnerId, sessionId, callType, startedAt });
      cleanupAndRedirect('/home.html', 'User blocked.');
    } catch (err) { showToast(err.message); }
  });

  window.addEventListener('beforeunload', teardownMedia);
}
