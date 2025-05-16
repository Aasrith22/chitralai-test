import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const PhotoGallery = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const galleryImages = [
    { src: 'https://i0.wp.com/josiahandsteph.com/wp-content/uploads/2021/06/An-Elegant-Pen-Ryn-Estate-Wedding-in-Bensalem-PA-Sam-Lexi-0079-scaled.jpg?w=1920', title: 'Wedding Celebration' },
    { src: 'https://offloadmedia.feverup.com/secretmumbai.com/wp-content/uploads/2024/10/22180638/Birthday-ideas-Freepik-1024x683.jpg', title: 'Birthday Party' },
    { src: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_8eZYDeRpNHeeAdLukfZxHC5T9s9DVIphZQ&s', title: 'Corporate Event' },
  ];

useEffect(() => {
    const loadImages = async () => {
      try {
        await Promise.all(galleryImages.map(image => {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = () => reject(new Error(`Failed to load image: ${image.src}`));
            img.src = image.src;
          });
        }));
        setIsLoading(false);
      } catch (err) {
        setError('Failed to load some images');
        setIsLoading(false);
      }
    };
    loadImages();
  }, []);

  return (
    <div className="bg-gray-50 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Featured Event Galleries
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Discover amazing moments captured at various events
          </p>
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-3"
        >
          {isLoading ? (
            <div className="col-span-full flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="col-span-full text-center text-red-500">{error}</div>
          ) : galleryImages.map((image) => (
            <motion.div
              key={image.id}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
              className="relative overflow-hidden rounded-2xl bg-white shadow-lg"
            >
              <div className="aspect-[3/2]">
                <img
                  src={image.src}
                  alt={image.title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-6">
                <h3 className="text-xl font-semibold text-white">{image.title}</h3>
                <p className="mt-2 text-sm text-white/80">
                  Find your photos using Face Recognition
                </p>
              </div>
              <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                AI Powered
              </div>
            </motion.div>
          ))}
        </motion.div>

        <div className="mt-16 text-center">
          <a
            href="#"
            className="rounded-md bg-blue-500 px-6 py-3 text-lg font-semibold text-white shadow-sm hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            View All Galleries
          </a>
        </div>
      </div>
    </div>
  );
};

export default PhotoGallery;