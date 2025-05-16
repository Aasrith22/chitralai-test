import React, { useState } from 'react';

interface ProgressiveImageProps {
  compressedSrc: string;
  originalSrc: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  compressedSrc,
  originalSrc,
  alt = '',
  className = '',
  style = {},
}) => {
  const [highResLoaded, setHighResLoaded] = useState(false);

  return (
    <span style={{ position: 'relative', display: 'inline-block', ...style }}>
      <img
        src={compressedSrc}
        alt={alt}
        className={className}
        style={{
          filter: highResLoaded ? 'blur(0px)' : 'blur(8px)',
          transition: 'filter 0.3s',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
        loading="lazy"
        draggable={false}
      />
      <img
        src={originalSrc}
        alt={alt}
        className={className}
        style={{
          opacity: highResLoaded ? 1 : 0,
          transition: 'opacity 0.3s',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          position: 'relative',
          zIndex: 1,
        }}
        loading="lazy"
        onLoad={() => setHighResLoaded(true)}
        draggable={false}
      />
    </span>
  );
};

export default ProgressiveImage; 