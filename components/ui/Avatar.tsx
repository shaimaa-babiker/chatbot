import Image from 'next/image'
import React from 'react'
import { rings } from '@dicebear/collection'
import { createAvatar } from '@dicebear/core'


function Avatar({seed,className}:{seed:string,className?:string}) {
const avatar= createAvatar(rings, {
    seed,
   
  })
  const svg = avatar.toString();
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  return (
    <div>
      <Image
src={dataUrl}
alt="Avatar"
width={80}
height={80}
className={className}
/>
    </div>
  )
}

export default Avatar