export async function captureVideoFrame(src: string): Promise<File> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('The tour video could not be read. Please use an MP4 or WebM video.'));
      video.src = src;
      video.load();
    });
    if (!video.videoWidth || !video.videoHeight) throw new Error('This video has no readable picture.');
    if (Number.isFinite(video.duration) && video.duration > 0.2) {
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('The tour frame could not be read.'));
        video.currentTime = Math.min(1, video.duration / 4);
      });
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1920 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not read the tour frame.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('The tour frame could not be captured.');
    return new File([blob], 'tour-frame.jpg', { type: 'image/jpeg' });
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}