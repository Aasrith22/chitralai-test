import React, { useState, useRef, useEffect } from 'react';
import { Phone, Building2, Upload } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

interface PhoneVerificationProps {
  onSubmit: (data: {
    phoneNumber: string;
    isOrganization: boolean;
    organizationName?: string;
    organizationLogo?: File;
  }) => void;
  onGoogleSignIn: (response: any) => void;
  onError: () => void;
  isSignUp?: boolean;
}

const PhoneVerification: React.FC<PhoneVerificationProps> = ({ 
  onSubmit, 
  onGoogleSignIn, 
  onError,
  isSignUp = false 
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  const [isOrganization, setIsOrganization] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationLogo, setOrganizationLogo] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showOrgFields, setShowOrgFields] = useState(true);

  useEffect(() => {
    // Check if the pending action is 'getPhotos'
    const pendingAction = localStorage.getItem('pendingAction');
    setShowOrgFields(pendingAction !== 'getPhotos');
  }, []);

  const validatePhoneNumber = (number: string) => {
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;
    const isValid = phoneRegex.test(number);
    setIsPhoneValid(isValid);
    return isValid;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const number = e.target.value;
    setPhoneNumber(number);
    setError('');
    validatePhoneNumber(number);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setOrganizationLogo(file);
        setError('');
      } else {
        setError('Please upload an image file');
      }
    }
  };

  const handleGoogleSignIn = (response: any) => {
    if (!isPhoneValid) {
      setError('Please enter a valid phone number first');
      return;
    }

    if (isOrganization && !organizationName) {
      setError('Please enter organization name');
      return;
    }

    if (isOrganization && !organizationLogo) {
      setError('Please upload organization logo');
      return;
    }

    // Store organization data temporarily
    if (isOrganization) {
      localStorage.setItem('pendingOrganizationData', JSON.stringify({
        isOrganization,
        organizationName,
        phoneNumber,
        organizationLogo: organizationLogo ? true : false
      }));
    }

    // Store phone number
    localStorage.setItem('pendingPhoneNumber', phoneNumber);

    // Pass the organization logo to parent component if it exists
    onSubmit({
      phoneNumber,
      isOrganization,
      organizationName: isOrganization ? organizationName : undefined,
      organizationLogo: isOrganization && organizationLogo ? organizationLogo : undefined
    });

    // Call Google Sign In callback with additional context
    onGoogleSignIn({
      ...response,
      isSignUp,
      phoneNumber,
      isOrganization,
      organizationName: isOrganization ? organizationName : undefined,
      organizationLogo: isOrganization && organizationLogo ? organizationLogo : undefined
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        
        <p className="mt-2 text-sm text-gray-600">
          {isSignUp ? "Please enter your details to continue" : "Please sign in to continue"}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Phone className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="tel"
              value={phoneNumber}
              onChange={handlePhoneChange}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              placeholder="+1234567890"
            />
          </div>
        </div>

        {showOrgFields && isSignUp && (
          <>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isOrganization"
                checked={isOrganization}
                onChange={(e) => setIsOrganization(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isOrganization" className="ml-2 block text-sm text-gray-900">
                Are you an Organisation?
              </label>
            </div>

            {isOrganization && (
              <div className="space-y-4 pt-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Organization Name"
                  />
                </div>

                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Upload className="h-5 w-5 text-gray-400" />
                    {organizationLogo ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  {organizationLogo && (
                    <p className="mt-2 text-sm text-gray-500">
                      Selected: {organizationLogo.name}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}

        <div className={`transition-opacity duration-300 ${isPhoneValid && (!showOrgFields || !isOrganization || (organizationName && organizationLogo)) ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          <GoogleLogin 
            onSuccess={handleGoogleSignIn}
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
    </div>
  );
};

export default PhoneVerification; 
