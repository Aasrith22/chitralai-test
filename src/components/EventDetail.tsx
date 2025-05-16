import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Camera, QrCode, Share2, Download, Upload } from 'lucide-react';
import EventImages from './EventImages';
import { getEventById, EventData } from '../config/eventStorage';

interface EventDetailProps {
  eventId: string;
}

const EventActionBar = () => {
  return (
    <div className="flex flex-row gap-2">
      <button className="bg-blue-100 hover:bg-blue-200 text-blue-900 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors duration-200 text-xs sm:text-sm sm:py-3 sm:px-4 sm:gap-2">
        <QrCode className="w-4 h-4 sm:w-5 sm:h-5" />
        <span className="font-medium hidden sm:inline">Show QR</span>
      </button>
      <button className="bg-blue-100 hover:bg-blue-200 text-blue-900 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors duration-200 text-xs sm:text-sm sm:py-3 sm:px-4 sm:gap-2">
        <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
        <span className="font-medium hidden sm:inline">Share Link</span>
      </button>
      <button className="bg-blue-100 hover:bg-blue-200 text-blue-900 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors duration-200 text-xs sm:text-sm sm:py-3 sm:px-4 sm:gap-2">
        <Download className="w-4 h-4 sm:w-5 sm:h-5" />
        <span className="font-medium hidden sm:inline">Download</span>
      </button>
      <button className="bg-blue-100 hover:bg-blue-200 text-blue-900 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors duration-200 text-xs sm:text-sm sm:py-3 sm:px-4 sm:gap-2">
        <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
        <span className="font-medium hidden sm:inline">Upload</span>
      </button>
    </div>
  );
};

const EventDetail = ({ eventId }: EventDetailProps) => {
  const [event, setEvent] = useState<EventData | null>(null);

  useEffect(() => {
    const loadEventDetails = async () => {
      try {
        const currentEvent = await getEventById(eventId);
        if (currentEvent) {
          setEvent(currentEvent);
        }
      } catch (error) {
        console.error('Error loading event details:', error);
      }
    };
    loadEventDetails();
  }, [eventId]);

  if (!event) {
    return <div>Loading event details...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <Link to="/events" className="text-blue-900 hover:text-blue-700 flex items-center gap-2">
            <span className="text-sm font-medium">← Back to Events</span>
          </Link>
          <div className="hidden sm:block">
            <EventActionBar />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-blue-900 mb-2">{event.name}</h1>
        <p className="text-blue-700">{new Date(event.date).toLocaleDateString()}</p>
        <div className="block sm:hidden mt-4">
          <EventActionBar />
        </div>
      </div>

      <div className="space-y-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-blue-900">Event Images</h2>
          </div>
          <EventImages eventId={eventId} />
        </div>

        
      </div>
    </div>
  );
};

export default EventDetail;
