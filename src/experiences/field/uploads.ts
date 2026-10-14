import type { QueuedPhoto } from './queue';
import { supabase } from '@/lib/supabase';

export async function uploadQueuedPhoto(photo: QueuedPhoto, tenantId: string, onProgress?: (progress: number) => void): Promise<string> {
  const path = `${tenantId}/${photo.staffId}/${photo.bookingId}/${photo.phase}/${photo.id}.jpg`;
  const bucket = 'job-evidence';
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('signed_url_unavailable');
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', data.signedUrl);
    if (photo.blob.type) xhr.setRequestHeader('Content-Type', photo.blob.type);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload_failed_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('upload_network_error'));
    xhr.send(photo.blob);
  });
  return path;
}
