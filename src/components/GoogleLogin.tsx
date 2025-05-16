import React from 'react';
import { GoogleLogin as GoogleLoginButton } from '@react-oauth/google';
import { storeUserCredentials, getUserByEmail, queryUserByEmail } from '../config/dynamodb';
import { jwtDecode as jwt_decode } from 'jwt-decode';

interface GoogleLoginProps {
  onSuccess: (credentialResponse: any) => void;
  onError: () => void;
}

interface GoogleUserData {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

const GoogleLogin: React.FC<GoogleLoginProps> = ({ onSuccess, onError }) => {
  const handleSuccess = async (credentialResponse: any) => {
    try {
      const decoded: GoogleUserData = jwt_decode(credentialResponse.credential);
      
      // Check if user already exists using both methods
      let existingUser = await getUserByEmail(decoded.email);
      
      if (!existingUser) {
        existingUser = await queryUserByEmail(decoded.email);
      }
      
      // Check if there was a pending action before login
      const pendingAction = localStorage.getItem('pendingAction');
      const role = pendingAction === 'createEvent' ? 'organizer' : 'attendee';
      
      console.log('GoogleLogin: User exists:', !!existingUser, 'Setting role:', role);
      
      // Get the phone number from the form if it exists
      const phoneNumber = localStorage.getItem('pendingPhoneNumber') || '';
      
      if (!existingUser) {
        // Create new user with role as organizer if pendingAction is createEvent, otherwise attendee
        await storeUserCredentials({
          userId: decoded.sub,
          email: decoded.email,
          name: decoded.name,
          mobile: phoneNumber, // Use the phone number from the form
          role: role
        });
      } else if (pendingAction === 'createEvent') {
        // If user exists but they're creating an event, update their role
        await storeUserCredentials({
          userId: decoded.sub,
          email: decoded.email,
          name: decoded.name,
          mobile: existingUser.mobile || phoneNumber, // Keep existing phone or use new one
          role: 'organizer'
        });
      }

      // Clear the pending phone number
      localStorage.removeItem('pendingPhoneNumber');

      // Call the original onSuccess callback
      onSuccess(credentialResponse);
    } catch (error) {
      console.error('Error processing Google login:', error);
      onError();
    }
  };

  return (
    <div className="flex justify-center p-2 rounded-lg hover:bg-blue-50 transition-all duration-300">
      <div className="w-full max-w-xs bg-white shadow-lg rounded-lg overflow-hidden hover:shadow-xl transition-all duration-300 border border-blue-100">
        <GoogleLoginButton
          onSuccess={handleSuccess}
          onError={onError}
          useOneTap={false}
          type="standard"
          theme="outline"
          text="signin_with"
          shape="rectangular"
          logo_alignment="left"
        />
      </div>
    </div>
  );
};

export default GoogleLogin;