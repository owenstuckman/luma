import { createBrowserClient } from '@supabase/ssr'; 
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/*

Utility functions for supabase.

 */

const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY); // Updated to createBrowserClient

export const getActiveRoles = async () => {
    const { data, error } = await supabase
        .from("job_posting")
        .select('*');

    if (error) {
        console.error('Error fetching data:', error);
        throw new Error('Failed to fetch data from Supabase');
    }
    return data;
};

export const getRoleByID = async (id: number) => {
    const { data, error } = await supabase
        .from("job_posting")
        .select('*')
        .eq('id', id); // Filter by the provided id

    if (error) {
        console.error('Error fetching data:', error);
        throw new Error('Failed to fetch data from Supabase');
    }
    console.log(data);
    return data;
};
