import React from 'react';
import { motion } from 'framer-motion';

const HowItWorks = () => {
  const steps = [
    {
      title: 'Create Event & Invite guests',
      description: 'Create an event, upload photos and invite all guests',
      image: '/create event.jpeg'
    },
    {
      title: 'Click a Selfie to find photos',
      description: 'Guest opens the link & clicks a selfie to find their photos',
      image: '/Click a Selfie to find photos1.jpeg'
    },
    {
      title: 'Get your photos',
      description: 'Guests can view, download & share photos',
      image: '/Get your photos .jpeg'
    }
  ];

  return (
    <div className="py-8 sm:py-10 md:py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
            How it works. Easy & Fast
          </h2>
          <p className="mt-2 sm:mt-3 text-sm sm:text-base md:text-lg text-gray-600">
            World's fastest & easiest solution for Photo Sharing and Sales
          </p>
        </motion.div>

        <div className="mx-auto mt-6 sm:mt-8 md:mt-10 grid max-w-lg gap-y-8 sm:max-w-none sm:grid-cols-3 sm:gap-x-4 md:gap-x-6 lg:gap-x-8">
          {steps.map((step, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 + 0.2 }}
              className="flex flex-col items-center text-center"
            >
              <div className="relative">
                <div className="mb-4 rounded-xl flex items-center justify-center bg-blue-100 p-3 sm:p-4 shadow-lg ring-1 ring-gray-900/10 w-40 h-40 sm:w-44 sm:h-44 md:w-48 md:h-48 lg:w-52 lg:h-52 mx-auto">
                  <img
                    src={step.image}
                    alt={step.title}
                    className="max-h-full max-w-full object-contain rounded-lg"
                    loading="lazy"
                  />
                </div>
                <div className="absolute -left-3 -top-3 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-blue-600 text-white text-sm shadow-md">
                  {index + 1}
                </div>
              </div>
              <h3 className="mt-4 text-sm sm:text-base md:text-lg font-semibold leading-7 text-gray-900">
                {step.title}
              </h3>
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm leading-6 text-gray-600 max-w-xs">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HowItWorks;
