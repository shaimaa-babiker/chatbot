import React from 'react'
import { rings } from '@dicebear/collection'
import { createAvatar } from '@dicebear/core'

/**
 * Browser-safe base64 encoder. Avoids `Buffer` because the embed is shipped
 * to non-Node consumers where `Buffer` is not defined.
 */
function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function Avatar({ seed, className }: { seed: string; className?: string }) {
  const avatar = createAvatar(rings, { seed });
  const svg = avatar.toString();
  const dataUrl = `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;

  return (
    <div>
      <img src={dataUrl} alt="Avatar" width={80} height={80} className={className} />
    </div>
  );
}

export default Avatar;
