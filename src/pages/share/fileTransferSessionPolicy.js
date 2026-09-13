export function clearFileTransferSessionRefs({
  channelsRef,
  connectionsRef,
  objectUrlsRef,
  pendingCandidatesRef,
  receiveBufferRef,
  revokeObjectUrl = (url) => URL.revokeObjectURL(url),
  stagedFilesMetaRef,
  stagedFilesRef,
}) {
  Object.values(channelsRef.current).forEach((channel) => {
    channel.onclose = null;
    channel.onerror = null;
    channel.onmessage = null;
    channel.onopen = null;
  });
  Object.values(connectionsRef.current).forEach((connection) => {
    connection.ondatachannel = null;
    connection.onicecandidate = null;
    connection.oniceconnectionstatechange = null;
    connection.close();
  });
  objectUrlsRef.current.forEach((url) => revokeObjectUrl(url));

  channelsRef.current = {};
  connectionsRef.current = {};
  objectUrlsRef.current = new Set();
  pendingCandidatesRef.current = {};
  receiveBufferRef.current = {};
  stagedFilesMetaRef.current = [];
  stagedFilesRef.current = {};
}
