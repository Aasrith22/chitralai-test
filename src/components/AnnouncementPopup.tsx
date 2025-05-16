import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, MessageSquare } from 'lucide-react';

const AnnouncementPopup = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user is signed in by looking for email and token in localStorage
    const userEmail = localStorage.getItem('userEmail');
    const token = localStorage.getItem('googleToken');
    
    // Only show popup if user is not signed in
    if (!userEmail || !token) {
      setIsVisible(true);
    }
  }, []);
//frontend
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 flex items-center justify-center z-[2000] bg-black/5 backdrop-blur-sm"
        >
          <div className="bg-white rounded-xl shadow-2xl border border-blue-100 p-6 max-w-md mx-4 relative">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                You're Among the First to Try chitralai
              </h3>
              <div className="space-y-3 mb-4">
                <p className="text-sm text-gray-600 leading-relaxed">
                  This is our beta version, and we're still perfecting the experience. If you spot any issues, we'd love your feedback.
                </p>
                <p className="text-sm text-gray-600">
                  Thanks for being part of our journey!
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-blue-600 font-medium">
                <MessageSquare className="h-4 w-4" />
                <span>Your feedback helps us improve</span>
              </div>
            </div>
            <button
              onClick={() => setIsVisible(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-500 transition-colors duration-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AnnouncementPopup; 
