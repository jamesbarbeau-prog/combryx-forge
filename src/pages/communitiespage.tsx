import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { fetchUserProfile } from '../api'; // Assume this function fetches user profile from an API

const CommunitiesPage = () => {
    const { user } = useAuth();
    const [companyId, setCompanyId] = useState('');

    useEffect(() => {
        const getUserCompanyId = async () => {
            if (user && user.id) {
                const profile = await fetchUserProfile(user.id);
                setCompanyId(profile.company_id || ''); // Set company_id from the fetched profile
            }
        };
        getUserCompanyId();
    }, [user]);

    return (
        <div>
            <h1>Welcome to the Communities Page</h1>
            <p>Your Company ID: {companyId}</p>
            {/* Other components */}
        </div>
    );
};

export default CommunitiesPage;