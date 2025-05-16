import React, { useState, useEffect, useContext } from 'react';
import { Search, Building2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  queryUserByOrganizationCode, 
  storeAttendeeOrg, 
  getAttendeeOrganizations,
  deleteAttendeeOrg,
  getAttendeeSelfieURL
} from '../config/dynamodb';
import { UserContext } from '../App';
import OrganizationEvents from './OrganizationEvents';

interface Organization {
  organizationCode: string;
  organizationName: string;
  organizationLogo: string;
  joinedAt: string;
}

const MyOrganizations: React.FC = () => {
  const { userEmail } = useContext(UserContext);
  const navigate = useNavigate();
  const [organizationId, setOrganizationId] = useState(() => {
    // Check URL parameters for organization code on initial load
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code') || '';
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  // Load organizations from DynamoDB on mount and handle direct organization link
  useEffect(() => {
    const loadOrganizations = async () => {
      if (!userEmail) return;
      
      setLoading(true);
      try {
        // Check URL parameters for organization code
        const urlParams = new URLSearchParams(window.location.search);
        const orgCode = urlParams.get('code');

        const orgs = await getAttendeeOrganizations(userEmail);
        setOrganizations(orgs);

        // If organization code is provided in URL and not already joined
        if (orgCode && !orgs.some(org => org.organizationCode === orgCode)) {
          // Fetch organization details
          const orgDetails = await queryUserByOrganizationCode(orgCode);
          
          if (orgDetails) {
            // Store the relationship
            await storeAttendeeOrg({
              userId: userEmail,
              organizationCode: orgCode
            });

            // Add to organizations list
            const newOrg: Organization = {
              ...orgDetails,
              joinedAt: new Date().toISOString()
            };
            setOrganizations(prev => [newOrg, ...prev]);

            // Select the organization automatically
            setSelectedOrg(newOrg);
          }
        }
      } catch (error) {
        console.error('Error loading organizations:', error);
        setError('Failed to load your organizations');
      } finally {
        setLoading(false);
      }
    };

    loadOrganizations();
  }, [userEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail) {
      setError('Please sign in to join organizations');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (!organizationId.trim()) {
        throw new Error('Please enter an organization code');
      }

      // Check if organization is already joined
      if (organizations.some(org => org.organizationCode === organizationId)) {
        throw new Error('You have already joined this organization');
      }

      // Fetch organization details from DynamoDB
      const orgDetails = await queryUserByOrganizationCode(organizationId);
      
      if (!orgDetails) {
        throw new Error('Organization not found. Please check the organization code and try again.');
      }

      // Store the relationship in Attendee-org table
      const stored = await storeAttendeeOrg({
        userId: userEmail,
        organizationCode: organizationId
      });

      if (!stored) {
        throw new Error('Failed to join organization. Please try again.');
      }

      // Add the organization to the list with joined date
      const newOrg: Organization = {
        ...orgDetails,
        joinedAt: new Date().toISOString()
      };

      setOrganizations(prev => [newOrg, ...prev]);
      setOrganizationId(''); // Clear the input
    } catch (error: any) {
      setError(error.message || 'Failed to add organization');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (organizationCode: string) => {
    if (!userEmail) return;
    
    setLoading(true);
    try {
      // Delete from DynamoDB
      await deleteAttendeeOrg(userEmail, organizationCode);
      
      // Update local state
      setOrganizations(prev => prev.filter(org => org.organizationCode !== organizationCode));
    } catch (error) {
      console.error('Error deleting organization:', error);
      setError('Failed to delete organization');
    } finally {
      setLoading(false);
    }
  };

  const handleViewEvents = async (org: Organization) => {
    if (!userEmail) return;

    try {
      const selfieUrl = await getAttendeeSelfieURL(userEmail);
      
      if (!selfieUrl) {
        // Redirect to AttendeeDashboard if no selfie is found
        navigate('/attendee-dashboard');
        return;
      }

      setSelectedOrg(org);
    } catch (error) {
      console.error('Error checking selfie:', error);
      setError('Failed to verify user profile');
    }
  };

  if (selectedOrg) {
    return (
      <OrganizationEvents
        organizationCode={selectedOrg.organizationCode}
        organizationName={selectedOrg.organizationName}
        onBack={() => setSelectedOrg(null)}
      />
    );
  }

  if (!userEmail) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-gray-900">My Organizations</h1>
          <p className="mt-4 text-gray-600">Please sign in to view and join organizations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Organizations</h1>
          <p className="mt-2 text-gray-600">Join and manage your organization memberships</p>
        </div>

        {/* Organization ID Entry Form */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Join an Organization</h2>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                placeholder="Enter organization code"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Join
                </>
              )}
            </button>
          </form>
        </div>

        {/* Organizations List */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Organizations</h2>
          
          {organizations.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">You haven't joined any organizations yet</p>
              <p className="text-sm text-gray-400 mt-1">Enter an organization code above to join one</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {organizations.map((org) => (
                <div
                  key={org.organizationCode}
                  className="bg-blue-50 rounded-lg overflow-hidden border border-blue-100 hover:shadow-lg transition-all duration-300"
                >
                  <div className="aspect-w-16 aspect-h-9 bg-white">
                    {org.organizationLogo ? (
                      <img 
                        src={org.organizationLogo} 
                        alt={org.organizationName}
                        className="w-full h-48 object-cover"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                        <Building2 className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-blue-900 text-lg">{org.organizationName}</h3>
                      
                    </div>
                    <p className="text-sm text-gray-600 mb-1">
                      Organization Code: {org.organizationCode}
                      
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(org.joinedAt).toLocaleDateString()}
                    </p>
                    <div className="mt-4 flex justify-between">
                      <button
                        onClick={() => handleViewEvents(org)}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        View Events
                      </button>
                      <button
                        onClick={() => handleDelete(org.organizationCode)}
                        disabled={loading}
                        className="px-4 py-2 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyOrganizations;
