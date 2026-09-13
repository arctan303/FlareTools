import { useCallback, useEffect, useRef, useState } from 'react';
import { clearFileTransferSessionRefs } from '../fileTransferSessionPolicy';

const CHUNK_SIZE = 64 * 1024;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function useWebRTCFileTransfer(roomCode, myDeviceId) {
  const [availableFiles, setAvailableFiles] = useState([]);
  const [peers, setPeers] = useState({});
  const [stagedFiles, setStagedFiles] = useState([]);
  const [transfers, setTransfers] = useState([]);

  const channelsRef = useRef({});
  const connectionsRef = useRef({});
  const myDeviceIdRef = useRef(myDeviceId);
  const objectUrlsRef = useRef(new Set());
  const pendingCandidatesRef = useRef({});
  const receiveBufferRef = useRef({});
  const roomCodeRef = useRef(roomCode);
  const stagedFilesMetaRef = useRef([]);
  const stagedFilesRef = useRef({});

  useEffect(() => {
    stagedFilesMetaRef.current = stagedFiles;
  }, [stagedFiles]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
    myDeviceIdRef.current = myDeviceId;
  }, [myDeviceId, roomCode]);

  const closePeerConnection = useCallback((targetId, status = 'failed') => {
    const channel = channelsRef.current[targetId];
    if (channel) {
      channel.onclose = null;
      channel.onerror = null;
      channel.onmessage = null;
      channel.onopen = null;
    }
    const connection = connectionsRef.current[targetId];
    if (connection) {
      connection.ondatachannel = null;
      connection.onicecandidate = null;
      connection.oniceconnectionstatechange = null;
      connection.close();
    }
    delete channelsRef.current[targetId];
    delete connectionsRef.current[targetId];
    delete pendingCandidatesRef.current[targetId];
    setAvailableFiles((current) => current.filter((file) => file.senderId !== targetId));
    setTransfers((current) => current.map((transfer) => (
      transfer.status === 'transferring'
        && (transfer.targetId === targetId || transfer.senderId === targetId)
        ? { ...transfer, status: 'failed' }
        : transfer
    )));
    if (status) {
      setPeers((current) => ({ ...current, [targetId]: { connected: false, status } }));
    }
  }, []);

  const sendSignal = useCallback(async (targetId, data) => {
    try {
      await fetch('/api/text-share/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_code: roomCodeRef.current,
          device_id: myDeviceIdRef.current,
          to_device_id: targetId,
          signal_data: data,
        }),
      });
    } catch (error) {
      console.error('Failed to send signal', error);
    }
  }, []);

  const sendFileToTarget = useCallback(async (file, id, targetId) => {
    const channel = channelsRef.current[targetId];
    if (!channel || channel.readyState !== 'open') return;

    const transferId = `${id}_${targetId}`;
    setTransfers((current) => [...current, {
      id: transferId,
      name: file.name,
      size: file.size,
      progress: 0,
      direction: 'send',
      status: 'transferring',
      targetId,
    }]);

    try {
      channel.send(JSON.stringify({
        type: 'file_start',
        id,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
      }));

      const reader = file.stream().getReader();
      let sentBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (channel.readyState !== 'open') throw new Error('data-channel-closed');

        for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
          channel.send(value.slice(offset, offset + CHUNK_SIZE));
        }

        sentBytes += value.length;
        const progress = Math.round((sentBytes / file.size) * 100);
        setTransfers((current) => current.map((transfer) => (
          transfer.id === transferId ? { ...transfer, progress } : transfer
        )));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      if (channel.readyState !== 'open') throw new Error('data-channel-closed');
      channel.send(JSON.stringify({ type: 'file_end', id }));
      setTransfers((current) => current.map((transfer) => (
        transfer.id === transferId
          ? { ...transfer, status: 'completed', progress: 100 }
          : transfer
      )));
    } catch {
      setTransfers((current) => current.map((transfer) => (
        transfer.id === transferId
          ? { ...transfer, status: 'failed' }
          : transfer
      )));
    }
  }, []);

  const setupDataChannel = useCallback((channel, targetId) => {
    channel.binaryType = 'arraybuffer';
    channelsRef.current[targetId] = channel;

    const handleOpen = () => {
      setPeers((current) => ({ ...current, [targetId]: { connected: true, status: 'connected' } }));
      stagedFilesMetaRef.current.forEach((metadata) => {
        channel.send(JSON.stringify(metadata));
      });
    };

    if (channel.readyState === 'open') handleOpen();
    else channel.onopen = handleOpen;

    channel.onclose = () => {
      closePeerConnection(targetId, 'offline');
    };

    channel.onerror = () => {
      closePeerConnection(targetId, 'failed');
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        if (message.type === 'file_offered') {
          setAvailableFiles((current) => (
            current.some((file) => file.id === message.id)
              ? current
              : [...current, { ...message, senderId: targetId }]
          ));
        } else if (message.type === 'file_request') {
          const file = stagedFilesRef.current[message.id];
          if (file) sendFileToTarget(file, message.id, targetId);
        } else if (message.type === 'file_start') {
          receiveBufferRef.current[message.id] = {
            ...message,
            chunks: [],
            receivedBytes: 0,
          };
          setTransfers((current) => current.map((transfer) => (
            transfer.id === message.id ? { ...transfer, status: 'transferring' } : transfer
          )));
        } else if (message.type === 'file_end') {
          const buffer = receiveBufferRef.current[message.id];
          if (!buffer) return;
          const blob = new Blob(buffer.chunks, { type: buffer.mime });
          const url = URL.createObjectURL(blob);
          objectUrlsRef.current.add(url);
          setTransfers((current) => current.map((transfer) => (
            transfer.id === message.id
              ? { ...transfer, status: 'completed', progress: 100, url }
              : transfer
          )));

          const link = document.createElement('a');
          link.href = url;
          link.download = buffer.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          delete receiveBufferRef.current[message.id];
        }
        return;
      }

      const bufferIds = Object.keys(receiveBufferRef.current);
      if (bufferIds.length === 0) return;
      const id = bufferIds[bufferIds.length - 1];
      const buffer = receiveBufferRef.current[id];
      buffer.chunks.push(event.data);
      buffer.receivedBytes += event.data.byteLength;
      const progress = Math.round((buffer.receivedBytes / buffer.size) * 100);
      setTransfers((current) => current.map((transfer) => (
        transfer.id === id ? { ...transfer, progress } : transfer
      )));
    };
  }, [closePeerConnection, sendFileToTarget]);

  const createPeerConnection = useCallback((targetId) => {
    if (connectionsRef.current[targetId]) return connectionsRef.current[targetId];

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    connectionsRef.current[targetId] = connection;
    setPeers((current) => ({ ...current, [targetId]: { connected: false, status: 'connecting' } }));
    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === 'failed') {
        closePeerConnection(targetId, 'failed');
      } else if (connection.iceConnectionState === 'disconnected') {
        setPeers((current) => ({ ...current, [targetId]: { connected: false, status: 'offline' } }));
      } else if (connection.iceConnectionState === 'connected') {
        setPeers((current) => ({ ...current, [targetId]: { connected: true, status: 'connected' } }));
      }
    };
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(targetId, { type: 'candidate', candidate: event.candidate });
      }
    };
    connection.ondatachannel = (event) => setupDataChannel(event.channel, targetId);
    return connection;
  }, [closePeerConnection, sendSignal, setupDataChannel]);

  const processSignal = useCallback(async (signal) => {
    if (!signal?.data) return;
    const { from, data } = signal;
    let connection = connectionsRef.current[from];

    if (data.type === 'offer') {
      connection = createPeerConnection(from);
      await connection.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendSignal(from, connection.localDescription);
    } else if (data.type === 'answer' && connection) {
      await connection.setRemoteDescription(new RTCSessionDescription(data));
    } else if (data.type === 'candidate') {
      if (connection?.remoteDescription) {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.error('Error adding received ICE candidate', error);
        }
      } else {
        if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = [];
        pendingCandidatesRef.current[from].push(data.candidate);
      }
      return;
    }

    if (connection && pendingCandidatesRef.current[from]) {
      for (const candidate of pendingCandidatesRef.current[from]) {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding buffered ICE candidate', error);
        }
      }
      delete pendingCandidatesRef.current[from];
    }
  }, [createPeerConnection, sendSignal]);

  const initiateConnection = useCallback(async (targetId, { force = false } = {}) => {
    const existingConnection = connectionsRef.current[targetId];
    if (existingConnection) {
      if (!force && !['closed', 'disconnected', 'failed'].includes(existingConnection.iceConnectionState)) return;
      closePeerConnection(targetId, null);
    }

    try {
      const connection = createPeerConnection(targetId);
      const channel = connection.createDataChannel('file-transfer');
      setupDataChannel(channel, targetId);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await sendSignal(targetId, connection.localDescription);
    } catch {
      closePeerConnection(targetId, 'failed');
    }
  }, [closePeerConnection, createPeerConnection, sendSignal, setupDataChannel]);

  const syncDevices = useCallback((deviceIds) => {
    deviceIds.forEach((deviceId) => {
      if (
        deviceId !== myDeviceIdRef.current
        && !connectionsRef.current[deviceId]
        && myDeviceIdRef.current > deviceId
      ) {
        initiateConnection(deviceId);
      }
    });
  }, [initiateConnection]);

  const stageFile = useCallback((file) => {
    const id = `${Date.now()}${Math.random().toString(36).substring(2, 7)}`;
    const metadata = {
      type: 'file_offered',
      id,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
    };
    stagedFilesRef.current[id] = file;
    setStagedFiles((current) => [...current, metadata]);

    Object.keys(peers)
      .filter((deviceId) => peers[deviceId].connected)
      .forEach((targetId) => {
        const channel = channelsRef.current[targetId];
        if (channel?.readyState === 'open') channel.send(JSON.stringify(metadata));
      });
  }, [peers]);

  const requestFile = useCallback((fileMetadata) => {
    const { id, senderId } = fileMetadata;
    const channel = channelsRef.current[senderId];
    if (!channel || channel.readyState !== 'open') return;
    channel.send(JSON.stringify({ type: 'file_request', id }));
    setTransfers((current) => [...current, {
      id,
      name: fileMetadata.name,
      size: fileMetadata.size,
      progress: 0,
      direction: 'receive',
      senderId,
      status: 'transferring',
    }]);
    setAvailableFiles((current) => current.filter((file) => file.id !== id));
  }, []);

  const removeTransfer = useCallback((id) => {
    setTransfers((current) => {
      const removed = current.find((transfer) => transfer.id === id);
      if (removed?.url) {
        URL.revokeObjectURL(removed.url);
        objectUrlsRef.current.delete(removed.url);
      }
      return current.filter((transfer) => transfer.id !== id);
    });
  }, []);

  const clearSession = useCallback(() => {
    clearFileTransferSessionRefs({
      channelsRef,
      connectionsRef,
      objectUrlsRef,
      pendingCandidatesRef,
      receiveBufferRef,
      stagedFilesMetaRef,
      stagedFilesRef,
    });
    setAvailableFiles([]);
    setPeers({});
    setStagedFiles([]);
    setTransfers([]);
  }, []);

  useEffect(() => () => {
    clearSession();
  }, [clearSession, myDeviceId, roomCode]);

  return {
    availableFiles,
    closePeerConnection,
    initiateConnection,
    peers,
    processSignal,
    removeTransfer,
    requestFile,
    stagedFiles,
    stageFile,
    syncDevices,
    transfers,
  };
}
