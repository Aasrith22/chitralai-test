import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: 'How does the AI categorization work?',
    answer:
      'Our AI analyzes your photos to identify people, places, objects, and events. It uses machine learning to recognize patterns and categorize your images automatically, making them easily searchable without you having to manually tag them.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Absolutely. We use end-to-end encryption to ensure your photos are only accessible to you and those you choose to share them with. Your privacy is our top priority, and we never use your photos for training our AI without explicit permission.',
  },
  {
    question: 'Can I access my photos offline?',
    answer:
      'Yes, you can mark specific albums or photos as "Available Offline" in the mobile app. These will be stored locally on your device so you can access them even without an internet connection.',
  },
  {
    question: 'How do I share my photos with friends and family?',
    answer:
      'Chitralai makes sharing simple. You can create shareable links for individual photos or entire albums, set permissions for who can view or edit, and even collaborate on shared albums with family members.',
  },
  {
    question: 'What happens if I exceed my storage limit?',
    answer:
      "If you approach your storage limit, we'll notify you and provide options to upgrade to a plan with more storage. Your existing photos will remain safe and accessible even if you exceed your limit temporarily.",
  },
  {
    question: 'Can I cancel my subscription at any time?',
    answer:
      "Yes, you can cancel your subscription at any time. If you cancel, you'll continue to have access to your premium features until the end of your billing cycle. After that, you'll be downgraded to the Basic plan but will still have access to all your photos.",
  },
];

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div id="faq" className="bg-gradient-to-b from-white to-blue-50/50 py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Partners Section */}
        <div className="mb-24 mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8"
          >
            <h3 className="text-xl sm:text-2xl font-semibold text-gray-900">
              Our Partners
            </h3>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-wrap justify-center items-center gap-12 sm:gap-16"
          >
            <div className="w-64 h-28 relative">
              <img
                src="https://remoters.net/wp-content/uploads/2020/06/draper-startup-house.png"
                alt="Draper"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="w-64 h-28 relative">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/4/40/T-Hub_Logo-PNG.png"
                alt="T-Hub"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="w-64 h-28 relative">
              <img
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSHpS7l6XHJgFCx3-FWabYpvaD4eSbGoIpVRSVsOgnCPue71d2UYOLNqxPdJ_gdijKzgw&usqp=CAU"
                alt="AWS for Startup"
                className="w-full h-full object-contain"
              />
            </div>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-sm font-semibold text-blue-600">FAQ</p>
          <h2 className="mt-2 text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-gray-900">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base md:text-lg text-gray-600">
            Common questions about our service and how it works
          </p>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto mt-8 sm:mt-12 md:mt-16 max-w-3xl"
        >
          <div className="divide-y divide-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
            {faqs.map((faq, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 + 0.3 }}
                className="group"
              >
                <button
                  onClick={() => toggleFaq(index)}
                  className="flex w-full items-start justify-between px-4 py-4 sm:px-6 sm:py-5 text-left hover:bg-gray-50 focus:outline-none transition-colors duration-200"
                  aria-expanded={openIndex === index}
                >
                  <span className="text-sm sm:text-base font-medium text-gray-900">{faq.question}</span>
                  <span className="ml-6 flex h-7 items-center">
                    <motion.div
                      animate={{ rotate: openIndex === index ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    </motion.div>
                  </span>
                </button>
                <AnimatePresence>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 sm:px-6 sm:pb-5">
                        <p className="text-xs sm:text-sm text-gray-600">{faq.answer}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default FAQ;