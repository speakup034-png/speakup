// Thin Socket.IO connection helper, reused by home/match/call pages.
function connectSocket() {
  return io({ auth: { token: getToken() } });
}
