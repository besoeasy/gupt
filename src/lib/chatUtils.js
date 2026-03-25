// Shared pure utilities used across RoomView and GroupRoomView.

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDuration(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60)
  const secs = String(totalSeconds % 60).padStart(2, '0')
  return `${mins}:${secs}`
}

export function bytesToBase64(bytes) {
  let out = ''
  for (const byte of bytes) out += String.fromCharCode(byte)
  return btoa(out)
}

export function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

export function isImage(mime) {
  return typeof mime === 'string' && mime.startsWith('image/')
}

export function isVideo(mime) {
  return typeof mime === 'string' && mime.startsWith('video/')
}

export function isAudio(mime) {
  return typeof mime === 'string' && mime.startsWith('audio/')
}

export function getFileLabel(message) {
  return (
    message.mediaName || message.text || (message.type === 'voice' ? 'Voice note' : 'Attachment')
  )
}
